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

  try {
    const result = await groq.audio.transcriptions.create({
      model: STT_MODEL,
      file: audio,
      response_format: "json",
      temperature: 0,
    });
    return NextResponse.json({ text: (result.text || "").trim() });
  } catch (err: any) {
    console.warn("[POST /api/voice/transcribe] Failed:", err?.status, err?.message);
    return NextResponse.json({ error: "Couldn't transcribe audio" }, { status: 502 });
  }
}
