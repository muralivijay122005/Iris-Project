import { NextResponse } from "next/server";
import { requireUser } from "../../../../lib/session-user";
import { groq } from "../../../../lib/ai";

export const runtime = "nodejs";

const STT_MODEL = process.env.GROQ_STT_MODEL || "whisper-large-v3-turbo";
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

// POST form { audio }: transcribes one spoken turn with Whisper
export async function POST(req: Request) {
  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json({ error: "Missing GROQ_API_KEY" }, { status: 500 });
  }
  const { error } = await requireUser();
  if (error) return error;

  const form = await req.formData();
  const audio = form.get("audio");
  if (!(audio instanceof File) || audio.size === 0) {
    return NextResponse.json({ error: "No audio received" }, { status: 400 });
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "Recording is too long" }, { status: 413 });
  }

  // Recent conversation text helps Whisper with names, jargon and spelling
  const context = typeof form.get("prompt") === "string" ? (form.get("prompt") as string).slice(-600) : "";
  const language = typeof form.get("language") === "string" ? (form.get("language") as string).slice(0, 5) : "";

  try {
    const result: any = await groq.audio.transcriptions.create({
      model: STT_MODEL,
      file: audio,
      response_format: "verbose_json",
      temperature: 0,
      ...(context && { prompt: context }),
      ...(/^[a-z]{2}$/.test(language) && { language }),
    });
    // Drop segments Whisper itself flags as probably not speech
    const segments: any[] = Array.isArray(result.segments) ? result.segments : [];
    const text = segments.length
      ? segments
          .filter((s) => !(s.no_speech_prob > 0.6 && s.avg_logprob < -0.8))
          .map((s) => s.text)
          .join("")
      : result.text || "";
    return NextResponse.json({ text: text.replace(/\s+/g, " ").trim() });
  } catch (err: any) {
    console.warn("[POST /api/voice/transcribe] Failed:", err?.status, err?.message);
    return NextResponse.json({ error: "Couldn't transcribe audio" }, { status: 502 });
  }
}
