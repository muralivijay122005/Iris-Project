"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { LuMic, LuMicOff, LuX } from "react-icons/lu";
import { VOICES } from "../../lib/voices";
import { Speaker } from "../../lib/speech";
import { useSettings } from "../providers/settings";
import { useToast } from "../providers/toast";
import { cn, Portal } from "../ui/primitives";

type Phase = "starting" | "listening" | "transcribing" | "thinking" | "speaking" | "muted";

interface VoiceModeProps {
  open: boolean;
  onClose: () => void;
  /** Sends a user turn; streams reply text to onDelta, resolves with the full reply */
  ask: (text: string, onDelta: (content: string) => void) => Promise<string | null>;
}

// Voice activity detection
const SILENCE_MS = 1300; // pause that ends a turn
const MIN_SPEECH_MS = 250; // ignore clicks and pops
const MAX_TURN_MS = 60_000;
const CALIBRATE_MS = 400;

const STATUS: Record<Phase, string> = {
  starting: "Connecting…",
  listening: "Listening",
  transcribing: "Got it…",
  thinking: "Thinking…",
  speaking: "Tap to interrupt",
  muted: "Microphone muted",
};

function pickMime() {
  const options = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return options.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) || "";
}

export default function VoiceMode({ open, onClose, ask }: VoiceModeProps) {
  if (!open) return null;
  return <VoiceSession onClose={onClose} ask={ask} />;
}

function VoiceSession({ onClose, ask }: Omit<VoiceModeProps, "open">) {
  const { settings, update } = useSettings();
  const toast = useToast();
  const [phase, setPhase] = useState<Phase>("starting");
  const [heard, setHeard] = useState("");
  const [reply, setReply] = useState("");
  const [level, setLevel] = useState(0);
  const [muted, setMuted] = useState(false);

  const phaseRef = useRef<Phase>("starting");
  const mutedRef = useRef(false);
  const voiceRef = useRef(settings.voice);
  voiceRef.current = settings.voice;
  const askRef = useRef(ask);
  askRef.current = ask;

  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const speakerRef = useRef<Speaker | null>(null);
  const rafRef = useRef<number>(0);
  const closedRef = useRef(false);
  // Interrupting during a reply: text that arrives later is ignored
  const turnRef = useRef(0);

  const go = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  const stopRecorder = (discard: boolean) => {
    const rec = recorderRef.current;
    if (!rec) return;
    recorderRef.current = null;
    if (discard) rec.ondataavailable = null;
    if (discard) rec.onstop = null;
    if (rec.state !== "inactive") rec.stop();
  };

  // ---------- Listening ----------
  const listen = useCallback(() => {
    if (closedRef.current) return;
    const stream = streamRef.current;
    const analyser = analyserRef.current;
    if (!stream || !analyser) return;
    if (mutedRef.current) {
      go("muted");
      return;
    }

    const mimeType = pickMime();
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const parts: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && parts.push(e.data);
    recorderRef.current = rec;
    go("listening");

    const buf = new Float32Array(analyser.fftSize);
    const startedAt = performance.now();
    let floor = 0.01;
    let samples = 0;
    let speechStart = 0;
    let lastVoice = 0;
    let spoke = false;

    rec.onstop = () => {
      if (closedRef.current || !spoke) return;
      const blob = new Blob(parts, { type: rec.mimeType || "audio/webm" });
      void handleTurn(blob);
    };
    rec.start(250);

    const tick = () => {
      if (recorderRef.current !== rec) return;
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += v * v;
      const rms = Math.sqrt(sum / buf.length);
      const now = performance.now();
      setLevel(Math.min(1, rms * 12));

      // Measure background noise first, then look for speech above it
      if (now - startedAt < CALIBRATE_MS) {
        floor = (floor * samples + rms) / ++samples;
      } else {
        const threshold = Math.max(0.018, floor * 3);
        if (rms > threshold) {
          if (!speechStart) speechStart = now;
          lastVoice = now;
          if (now - speechStart > MIN_SPEECH_MS) spoke = true;
        } else if (speechStart && !spoke && now - lastVoice > 300) {
          speechStart = 0; // just a blip
        }
        if ((spoke && now - lastVoice > SILENCE_MS) || now - startedAt > MAX_TURN_MS) {
          recorderRef.current = null;
          setLevel(0);
          if (spoke) go("transcribing");
          rec.stop();
          if (!spoke) listen(); // hit the time limit in silence: start over
          return;
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- One turn: transcribe → ask → speak ----------
  const handleTurn = async (audio: Blob) => {
    const turn = ++turnRef.current;
    let text = "";
    try {
      const form = new FormData();
      const ext = audio.type.includes("mp4") ? "m4a" : audio.type.includes("ogg") ? "ogg" : "webm";
      form.append("audio", audio, `speech.${ext}`);
      const res = await fetch("/api/voice/transcribe", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Transcription failed");
      text = (data.text || "").trim();
    } catch (err: any) {
      if (closedRef.current) return;
      toast(err?.message || "Couldn't hear that", { kind: "error" });
    }
    if (closedRef.current || turn !== turnRef.current) return;
    // Whisper hallucinates these on near-silence
    if (!text || /^(thank you\.?|thanks for watching!?|\.+|you)$/i.test(text)) {
      listen();
      return;
    }

    setHeard(text);
    setReply("");
    go("thinking");

    const speaker = new Speaker(voiceRef.current, {
      onStart: () => turn === turnRef.current && phaseRef.current !== "speaking" && go("speaking"),
    });
    speakerRef.current = speaker;

    const full = await askRef.current(text, (content) => {
      if (turn !== turnRef.current) return;
      setReply(content);
      speaker.push(content);
    });
    if (closedRef.current || turn !== turnRef.current) return;
    if (!full) {
      speaker.stop();
      toast("Iris couldn't answer that. Try again.", { kind: "error" });
      listen();
      return;
    }
    setReply(full);
    await speaker.end(full);
    if (closedRef.current || turn !== turnRef.current) return;
    speakerRef.current = null;
    listen();
  };

  // Tap the orb while Iris talks (or thinks) to cut in
  const interrupt = () => {
    if (phaseRef.current !== "speaking" && phaseRef.current !== "thinking") return;
    turnRef.current++;
    speakerRef.current?.stop();
    speakerRef.current = null;
    listen();
  };

  const toggleMute = () => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
    if (next && phaseRef.current === "listening") {
      cancelAnimationFrame(rafRef.current);
      stopRecorder(true);
      setLevel(0);
      go("muted");
    } else if (!next && phaseRef.current === "muted") {
      listen();
    }
  };

  // ---------- Setup / teardown ----------
  useEffect(() => {
    closedRef.current = false;
    let cancelled = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        toast("Voice chat isn't supported in this browser", { kind: "error" });
        onClose();
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        ctx.createMediaStreamSource(stream).connect(analyser);
        ctxRef.current = ctx;
        analyserRef.current = analyser;
        listen();
      } catch {
        toast("Microphone access was blocked. Allow it to use voice chat.", { kind: "error" });
        onClose();
      }
    })();

    return () => {
      cancelled = true;
      closedRef.current = true;
      turnRef.current++;
      cancelAnimationFrame(rafRef.current);
      stopRecorder(true);
      speakerRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      void ctxRef.current?.close().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === " " && !(e.target as HTMLElement).closest("button")) {
        e.preventDefault();
        interrupt();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);

  const caption = phase === "speaking" || phase === "thinking" ? reply : "";

  return (
    <Portal>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Voice chat"
        className="animate-fade-in fixed inset-0 z-[700] flex flex-col bg-bg text-fg"
      >
        <div className="flex h-14 shrink-0 items-center justify-between px-4">
          <span className="text-sm font-medium text-fg-muted">Voice chat</span>
          <span className="text-xs text-fg-subtle">Esc to end · Space to interrupt</span>
        </div>

        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-10 px-6">
          <button
            type="button"
            onClick={phase === "muted" ? toggleMute : interrupt}
            aria-label={phase === "speaking" ? "Interrupt" : STATUS[phase]}
            className="relative flex h-56 w-56 items-center justify-center rounded-full outline-none sm:h-64 sm:w-64"
          >
            <span
              className={cn(
                "voice-orb absolute inset-0 rounded-full",
                phase === "thinking" || phase === "transcribing" ? "voice-orb-think" : "",
                phase === "speaking" && "voice-orb-speak",
                (phase === "muted" || phase === "starting") && "opacity-40 grayscale"
              )}
              style={{
                transform: phase === "listening" ? `scale(${0.9 + level * 0.25})` : undefined,
              }}
            />
          </button>

          <div className="flex min-h-[7rem] w-full max-w-xl flex-col items-center gap-3 text-center">
            <div className="text-sm font-medium text-fg-muted" aria-live="polite">
              {STATUS[phase]}
            </div>
            {heard && (
              <p className="line-clamp-2 text-sm text-fg-subtle">
                <span className="font-medium text-fg-muted">You:</span> {heard}
              </p>
            )}
            {caption && (
              <p className="line-clamp-4 text-[15px] leading-6 text-fg">{caption.replace(/[#*`_>]/g, "")}</p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-center gap-5 px-4 pb-8">
          <div role="radiogroup" aria-label="Voice" className="flex flex-wrap justify-center gap-1.5">
            {VOICES.map((v) => {
              const active = (VOICES.some((x) => x.id === settings.voice) ? settings.voice : VOICES[0].id) === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  title={v.description}
                  onClick={() => update({ voice: v.id })}
                  className={cn(
                    "rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors",
                    active
                      ? "border-accent bg-accent/12 text-accent"
                      : "border-line text-fg-muted hover:border-line-strong hover:text-fg"
                  )}
                >
                  {v.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={toggleMute}
              aria-label={muted ? "Unmute microphone" : "Mute microphone"}
              aria-pressed={muted}
              className={cn(
                "flex h-14 w-14 items-center justify-center rounded-full transition-colors",
                muted ? "bg-danger/15 text-danger hover:bg-danger/25" : "bg-surface-2 text-fg hover:bg-line"
              )}
            >
              {muted ? <LuMicOff size={22} /> : <LuMic size={22} />}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="End voice chat"
              className="flex h-14 w-14 items-center justify-center rounded-full bg-danger text-white transition-opacity hover:opacity-90"
            >
              <LuX size={24} />
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
