import { Groq } from "groq-sdk";
import { UTILITY_MODEL } from "./models";
import { unreadableNote } from "./extract";

export const groq = new Groq({ apiKey: process.env.GROQ_API_KEY ?? "" });

// Budget for attachment text across the whole history (~8k tokens)
const MAX_ATTACHMENT_CHARS_TOTAL = 32_000;
const MAX_HISTORY_MESSAGES = 40;

export interface HistoryAttachment {
  name: string;
  size?: number;
  type: string;
  content?: string;
  truncated?: boolean;
}

export interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
  attachments?: HistoryAttachment[];
}

export interface Preferences {
  aboutYou?: string;
  responseStyle?: string;
  memoryEnabled?: boolean;
  memoryAutoSave?: boolean;
}

export function buildSystemPrompt(opts: {
  userName?: string | null;
  preferences?: Preferences;
  memories?: string[];
}) {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const parts = [
    `You are Iris, a thoughtful, precise and friendly AI assistant. Today is ${today}.`,
    "Format answers in GitHub-flavored Markdown when it helps readability: short paragraphs, headings for long answers, bullet or numbered lists, tables for comparisons, and fenced code blocks with a language tag for any code. Keep simple answers short.",
    "When the user attaches files, their extracted contents appear inside <attachment> tags in the user's message. Refer to files by name.",
  ];

  if (opts.userName)
    parts.push(
      `The user is signed in as "${opts.userName}". This may be a handle rather than their real name; if they've shared their name (for example in memories below), use that instead.`
    );

  const p = opts.preferences;
  if (p?.aboutYou?.trim())
    parts.push(`About the user (provided by them):\n${p.aboutYou.trim()}`);
  if (p?.responseStyle?.trim())
    parts.push(`How the user wants you to respond:\n${p.responseStyle.trim()}`);

  if (opts.memories?.length) {
    parts.push(
      "Things you remember about the user from earlier conversations. Use them when relevant; don't list them unprompted:\n" +
        opts.memories.map((m) => `- ${m}`).join("\n")
    );
  }

  return parts.join("\n\n");
}

// Turns stored messages into model messages, inlining attachment text and
// giving recent attachments priority within the character budget.
export function buildModelMessages(history: HistoryMessage[]) {
  const recent = history.slice(-MAX_HISTORY_MESSAGES);
  let budget = MAX_ATTACHMENT_CHARS_TOTAL;
  const out: { role: "user" | "assistant"; content: string }[] = [];

  for (let i = recent.length - 1; i >= 0; i--) {
    const msg = recent[i];
    let content = msg.content || "";

    if (msg.role === "user" && msg.attachments?.length) {
      const blocks = msg.attachments.map((a) => {
        const header = `<attachment name="${a.name}" type="${a.type || "unknown"}">`;
        if (!a.content) return `${header}\n[${unreadableNote(a)}]\n</attachment>`;
        if (budget <= 0)
          return `${header}\n[Content omitted to save space; ask the user to re-attach if needed.]\n</attachment>`;
        const text = a.content.slice(0, budget);
        budget -= text.length;
        const cut = a.truncated || text.length < a.content.length;
        return `${header}\n${text}${cut ? "\n[…truncated]" : ""}\n</attachment>`;
      });
      content = `${content}\n\n${blocks.join("\n\n")}`.trim();
    }

    if (content) out.unshift({ role: msg.role, content });
  }
  return out;
}

export async function generateTitle(prompt: string, fileNames: string[] = []) {
  const res = await groq.chat.completions.create({
    model: UTILITY_MODEL,
    messages: [
      {
        role: "system",
        content:
          "Write a short, specific title (2-6 words) for a chat that starts with the user's message below. Reply with the title only: no quotes, no trailing punctuation.",
      },
      {
        role: "user",
        content:
          (prompt || "(no text)").slice(0, 2000) +
          (fileNames.length ? `\n\nAttached: ${fileNames.join(", ")}` : ""),
      },
    ],
    max_completion_tokens: 400,
  });
  const title = (res.choices[0]?.message?.content || "")
    .replace(/^["'\s]+|["'.\s]+$/g, "")
    .slice(0, 80);
  return title || null;
}

// Picks out durable facts or preferences worth remembering from one exchange
export async function extractMemories(
  userMessage: string,
  existing: string[]
): Promise<string[]> {
  if (userMessage.trim().length < 8) return [];

  const res = await groq.chat.completions.create({
    model: UTILITY_MODEL,
    response_format: { type: "json_object" },
    max_completion_tokens: 1200,
    messages: [
      {
        role: "system",
        content: `You maintain a long-term memory about a user for an AI assistant.
From the user's latest message, extract durable facts worth remembering in future conversations: name, location, job, skills, projects, goals, preferences, dislikes, important relationships, or anything the user explicitly asks you to remember.
Do NOT extract: one-off questions, temporary tasks, facts about the world, sensitive data (passwords, IDs, financial or health details) unless the user explicitly asks to remember it, or anything already known.
Write each memory as a short third-person statement, e.g. "Is a vegetarian", "Works as a backend engineer at Acme", "Prefers answers in bullet points".
Already known:
${existing.length ? existing.map((m) => `- ${m}`).join("\n") : "(nothing yet)"}

Respond with JSON: {"memories": string[]}. Use an empty array when there is nothing new. Most messages have nothing new.`,
      },
      { role: "user", content: userMessage.slice(0, 4000) },
    ],
  });

  try {
    const parsed = JSON.parse(res.choices[0]?.message?.content || "{}");
    const list: unknown[] = Array.isArray(parsed.memories) ? parsed.memories : [];
    const known = new Set(existing.map((m) => m.toLowerCase()));
    return list
      .filter((m): m is string => typeof m === "string")
      .map((m) => m.trim().slice(0, 300))
      .filter((m) => m.length > 2 && !known.has(m.toLowerCase()))
      .slice(0, 5);
  } catch {
    return [];
  }
}

// Maps Groq errors to messages a user can act on
export function friendlyAIError(err: any): string {
  const status = err?.status;
  const msg: string = err?.error?.error?.message || err?.message || "";
  if (status === 413 || /too large|context length|tokens per minute/i.test(msg))
    return "That request is too large for this model. Try a shorter message or smaller attachments.";
  if (status === 429) return "Rate limit reached. Please wait a moment and try again.";
  if (status === 401) return "The AI service rejected the API key. Check GROQ_API_KEY.";
  if (status === 404) return "The selected model is unavailable. Pick another model and try again.";
  return msg ? `The AI service returned an error: ${msg}` : "Something went wrong while generating a reply.";
}
