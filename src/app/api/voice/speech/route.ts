import { NextResponse } from "next/server";
import { requireUser } from "../../../../lib/session-user";
import { groq } from "../../../../lib/ai";
import { resolveVoice } from "../../../../lib/voices";

export const runtime = "nodejs";

const TTS_MODEL = process.env.GROQ_TTS_MODEL || "canopylabs/orpheus-v1-english";
// Clients send one sentence-sized chunk at a time
const MAX_CHARS = 400;

// POST { text, voice }: synthesizes speech and returns WAV audio
export async function POST(req: Request) {
  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json({ error: "Missing GROQ_API_KEY" }, { status: 500 });
  }
  const { error } = await requireUser();
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const text = typeof body.text === "string" ? body.text.trim().slice(0, MAX_CHARS) : "";
  if (!text) return NextResponse.json({ error: "Nothing to say" }, { status: 400 });

  try {
    const res = await groq.audio.speech.create({
      model: TTS_MODEL,
      voice: resolveVoice(body.voice).ttsVoice,
      input: text,
      response_format: "wav",
    });
    return new Response(await res.arrayBuffer(), {
      headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" },
    });
  } catch (err: any) {
    console.warn("[POST /api/voice/speech] TTS failed:", err?.status, err?.message);
    // The client falls back to the browser's built-in speech on any error
    return NextResponse.json({ error: "Speech unavailable" }, { status: 502 });
  }
}
