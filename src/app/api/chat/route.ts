import { NextResponse } from "next/server";
import Chat, { IMessage, serializeMessage } from "../../../models/chat";
import Memory from "../../../models/memory";
import GeneratedImage from "../../../models/image";
import { generateImage, planImage, wantsImage, SIZES, RateLimitedError } from "../../../lib/imagegen";
import { requireUser, isObjectId } from "../../../lib/session-user";
import {
  groq,
  buildSystemPrompt,
  buildModelMessages,
  generateTitle,
  extractMemories,
  friendlyAIError,
  HistoryMessage,
} from "../../../lib/ai";
import { resolveModel } from "../../../lib/models";
import {
  extractAttachment,
  ExtractedAttachment,
  MAX_FILES,
  MAX_FILE_BYTES,
} from "../../../lib/extract";

export const runtime = "nodejs";
// Image generation on free providers can take a while
export const maxDuration = 120;

// Emoji and pictographs, stripped from spoken replies
const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{200D}\u{20E3}]/gu;

type Mode = "send" | "edit" | "regenerate";

// Normalizes stored messages (including legacy single-file ones) for the model
const toHistory = (msg: any): HistoryMessage => ({
  role: msg.role,
  content: msg.content || "",
  attachments: msg.attachments?.length
    ? msg.attachments
    : msg.fileName
    ? [{ name: msg.fileName, type: msg.fileType || "", content: msg.fileContent || "" }]
    : [],
  images: msg.images?.length ? msg.images.map((im: any) => ({ prompt: im.prompt || "" })) : undefined,
});

const jsonError = (error: string, status: number) =>
  NextResponse.json({ error }, { status });

// POST: send a message and stream the reply as newline-delimited JSON events:
// meta → reasoning/delta* → title? → memory? → done | error
export async function POST(req: Request) {
  if (!process.env.GROQ_API_KEY) {
    return jsonError("Server configuration error: missing GROQ_API_KEY", 500);
  }

  const { user, error } = await requireUser();
  if (error) return error;

  const form = await req.formData();
  const prompt = ((form.get("prompt") as string) || "").trim();
  const chatIdParam = (form.get("chatId") as string) || "";
  const isTemporary = form.get("temporary") === "true";
  const mode = ((form.get("mode") as string) || "send") as Mode;
  const editIndex = parseInt((form.get("editIndex") as string) || "-1", 10);
  const model = resolveModel(form.get("model") as string);
  // Voice chat wants speakable replies; image asks can also be forced from the composer
  const voiceMode = form.get("voice") === "true";
  const forceImage = form.get("image") === "true";
  const files = form.getAll("files").filter((f): f is File => f instanceof File);

  if (mode !== "regenerate" && !prompt && files.length === 0) {
    return jsonError("Type a message or attach a file", 400);
  }
  if (files.length > MAX_FILES) {
    return jsonError(`You can attach up to ${MAX_FILES} files at a time`, 400);
  }
  const tooBig = files.find((f) => f.size > MAX_FILE_BYTES);
  if (tooBig) {
    return jsonError(`${tooBig.name} is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB`, 400);
  }

  const attachments: ExtractedAttachment[] = await Promise.all(files.map(extractAttachment));

  // ---------- Build the conversation ----------
  let chat: any = null;
  let isNewChat = false;
  let history: HistoryMessage[] = [];
  const userMessage: IMessage | null =
    mode === "regenerate"
      ? null
      : { role: "user", content: prompt, attachments, createdAt: new Date() };

  if (isTemporary) {
    try {
      const raw = JSON.parse((form.get("history") as string) || "[]");
      history = Array.isArray(raw) ? raw.map(toHistory) : [];
    } catch {
      history = [];
    }
    if (mode === "edit" && userMessage && attachments.length === 0) {
      try {
        const kept = JSON.parse((form.get("editAttachments") as string) || "[]");
        if (Array.isArray(kept)) {
          userMessage.attachments = kept.slice(0, MAX_FILES).map((a: any) => ({
            name: String(a.name || "file"),
            size: Number(a.size) || 0,
            type: String(a.type || ""),
            content: typeof a.content === "string" ? a.content.slice(0, 24_000) : "",
          }));
        }
      } catch {}
    }
    if (userMessage) history.push(toHistory(userMessage));
  } else {
    if (chatIdParam) {
      if (!isObjectId(chatIdParam)) return jsonError("Invalid chat ID", 400);
      chat = await Chat.findOne({ _id: chatIdParam, user: user._id });
      if (!chat) return jsonError("Chat not found", 404);
    } else {
      chat = new Chat({
        title: (prompt || attachments[0]?.name || "New chat").slice(0, 60),
        messages: [],
        user: user._id,
        pinned: false,
      });
      isNewChat = true;
    }

    // Retrying a failed reply: nothing was saved after the last user message
    const isRetry = mode === "regenerate" && editIndex === chat.messages.length;
    if ((mode === "edit" || mode === "regenerate") && !isRetry) {
      const target = chat.messages[editIndex];
      const expectedRole = mode === "edit" ? "user" : "assistant";
      if (!target || target.role !== expectedRole) {
        return jsonError("That message can no longer be changed", 409);
      }
      // Editing keeps the original attachments unless new files were added
      if (mode === "edit" && userMessage && attachments.length === 0) {
        userMessage.attachments = (toHistory(target).attachments || []).map((a: any) => ({
          name: a.name,
          size: a.size || 0,
          type: a.type || "",
          content: a.content || "",
          truncated: !!a.truncated,
        }));
      }
      chat.messages = chat.messages.slice(0, editIndex);
    }

    if (userMessage) chat.messages.push(userMessage);
    if (!chat.messages.length || chat.messages[chat.messages.length - 1].role !== "user") {
      return jsonError("Nothing to reply to", 409);
    }
    await chat.save();
    history = chat.messages.map(toHistory);
  }

  // ---------- Personalization ----------
  const prefs = user.preferences || {};
  const useMemory = !isTemporary && prefs.memoryEnabled !== false;
  const memoryDocs = useMemory
    ? await Memory.find({ user: user._id }).sort({ createdAt: 1 }).limit(100).lean()
    : [];
  const memories = memoryDocs.map((m: any) => m.content as string);

  const systemPrompt = buildSystemPrompt({
    userName: user.username,
    preferences: prefs,
    memories,
    voice: voiceMode,
  });
  const modelMessages = [
    { role: "system" as const, content: systemPrompt },
    ...buildModelMessages(history),
  ];

  // Draw instead of chatting when the latest user message asks for an image
  const lastUser = history[history.length - 1];
  let prevAssistant: HistoryMessage | null = null;
  for (let i = history.length - 2; i >= 0 && !prevAssistant; i--) {
    if (history[i].role === "assistant") prevAssistant = history[i];
  }
  const imageTurn =
    !voiceMode &&
    lastUser?.role === "user" &&
    (forceImage || wantsImage(lastUser.content, !!prevAssistant?.images?.length));

  // Background jobs run alongside the main completion
  const titleJob =
    isNewChat && chat
      ? generateTitle(prompt, attachments.map((a) => a.name)).catch(() => null)
      : null;
  const memoryJob =
    useMemory && prefs.memoryAutoSave !== false && userMessage && prompt && !imageTurn
      ? extractMemories(prompt, memories).catch(() => [] as string[])
      : null;

  // ---------- Stream ----------
  const encoder = new TextEncoder();
  const upstream = new AbortController();
  req.signal.addEventListener("abort", () => upstream.abort());

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (event: Record<string, unknown>) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          closed = true;
        }
      };

      send({
        t: "meta",
        chatId: chat ? chat._id.toString() : null,
        model,
        userAttachments: attachments.map((a) => ({
          name: a.name,
          size: a.size,
          type: a.type,
          readable: !!a.content,
          // Temporary chats keep attachment text client-side for follow-ups
          ...(isTemporary && { content: a.content, truncated: a.truncated }),
        })),
      });

      let content = "";
      let reasoning = "";
      let failed: string | null = null;
      let interrupted = false;
      let images: { id: string; prompt: string; width: number; height: number }[] | undefined;

      if (imageTurn) {
        try {
          send({ t: "status", d: "Imagining" });
          const context = history
            .slice(-7, -1)
            .map((m) =>
              m.role === "assistant" && m.images?.length
                ? `Assistant generated an image with prompt: ${m.images[0].prompt}`
                : `${m.role === "user" ? "User" : "Assistant"}: ${m.content.slice(0, 300)}`
            );
          const plan = await planImage(lastUser.content, context);
          send({ t: "status", d: "Painting" });
          const size = SIZES[plan.aspect];
          const result = await generateImage({
            prompt: plan.prompt,
            ...size,
            seed: Math.floor(Math.random() * 2_147_483_647),
            signal: upstream.signal,
            onStatus: (label) => send({ t: "status", d: label }),
          });
          const doc = await GeneratedImage.create({
            user: user._id,
            chat: chat?._id,
            data: result.data,
            mime: result.mime,
            prompt: plan.prompt,
            ...size,
            provider: result.provider,
          });
          images = [{ id: doc._id.toString(), prompt: plan.prompt, ...size }];
          send({ t: "image", images });
          content = plan.caption;
          send({ t: "delta", d: content });
        } catch (err: any) {
          if (upstream.signal.aborted || err?.name === "AbortError") {
            interrupted = true;
          } else {
            console.error("[POST /api/chat] Image generation failed:", err?.message);
            failed =
              err instanceof RateLimitedError
                ? err.message
                : "Couldn't generate that image right now. The image service may be busy, so try again in a moment.";
          }
        }
      } else try {
        const completion = await groq.chat.completions.create(
          {
            model,
            messages: modelMessages,
            stream: true,
            ...(model.startsWith("qwen/") && { reasoning_format: "parsed" as const }),
          },
          { signal: upstream.signal }
        );
        for await (const chunk of completion) {
          const delta: any = chunk.choices[0]?.delta ?? {};
          if (delta.reasoning) {
            reasoning += delta.reasoning;
            send({ t: "reasoning", d: delta.reasoning });
          }
          if (delta.content) {
            const d: string = voiceMode ? delta.content.replace(EMOJI, "") : delta.content;
            if (!d) continue;
            content += d;
            send({ t: "delta", d });
          }
        }
      } catch (err: any) {
        if (upstream.signal.aborted || err?.name === "AbortError") {
          interrupted = true;
        } else {
          console.error("[POST /api/chat] Completion failed:", err?.status, err?.message);
          failed = friendlyAIError(err);
        }
      }

      // Save the reply (partial replies are kept and marked interrupted)
      if (chat && (content || images || interrupted) && !failed) {
        await Chat.updateOne(
          { _id: chat._id },
          {
            $push: {
              messages: {
                role: "assistant",
                content,
                images,
                reasoning: reasoning || undefined,
                model,
                interrupted: interrupted || undefined,
                createdAt: new Date(),
              },
            },
          }
        ).catch((e) => console.error("[POST /api/chat] Save failed:", e.message));
      }

      if (failed) {
        send({ t: "error", error: failed });
      } else if (!interrupted) {
        if (titleJob) {
          const title = await titleJob;
          if (title) {
            await Chat.updateOne({ _id: chat._id }, { title }, { timestamps: false }).catch(() => {});
            send({ t: "title", title });
          }
        }
        if (memoryJob) {
          const added = await memoryJob;
          if (added.length) {
            await Memory.insertMany(
              added.map((c) => ({ user: user._id, content: c, source: "auto", chat: chat?._id }))
            ).catch(() => {});
            send({ t: "memory", added });
          }
        }
        send({ t: "done" });
      }

      if (!closed) {
        closed = true;
        try {
          controller.close();
        } catch {}
      }
    },
    cancel() {
      upstream.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

// GET: ?chatId=… returns one chat with messages; otherwise the chat list
export async function GET(req: Request) {
  const { user, error } = await requireUser();
  if (error) return error;

  const chatId = new URL(req.url).searchParams.get("chatId");
  try {
    if (chatId) {
      if (!isObjectId(chatId)) return jsonError("Invalid chat ID", 400);
      const chat: any = await Chat.findOne({ _id: chatId, user: user._id }).lean();
      if (!chat) return jsonError("Chat not found", 404);
      return NextResponse.json({
        _id: chat._id.toString(),
        title: chat.title,
        pinned: !!chat.pinned,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
        messages: (chat.messages || []).map((m: any) => serializeMessage(m)),
      });
    }

    const chats = await Chat.find({ user: user._id })
      .select("_id title pinned createdAt updatedAt")
      .sort({ pinned: -1, updatedAt: -1 })
      .lean();
    return NextResponse.json(
      chats.map((c: any) => ({
        _id: c._id.toString(),
        title: c.title,
        pinned: !!c.pinned,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      }))
    );
  } catch (err: any) {
    console.error("[GET /api/chat] Error:", err.message);
    return jsonError("Failed to load chats", 500);
  }
}

// DELETE: removes all of the user's chats
export async function DELETE() {
  const { user, error } = await requireUser();
  if (error) return error;
  const result = await Chat.deleteMany({ user: user._id });
  await GeneratedImage.deleteMany({ user: user._id }).catch(() => {});
  return NextResponse.json({ deleted: result.deletedCount });
}
