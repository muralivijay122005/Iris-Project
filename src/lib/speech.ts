"use client";

// Client-side speech playback shared by "Read aloud" and voice chat. Text is
// spoken sentence by sentence through /api/voice/speech (prefetching ahead);
// if that fails, the browser's built-in speech synthesis takes over.
import { resolveVoice, VoiceOption } from "./voices";

// Markdown → plain text suitable for speaking
export const toSpeech = (md: string) =>
  md
    .replace(/```[\s\S]*?```/g, " Code block omitted. ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s*\|?[-:| ]+\|?\s*$/gm, " ")
    .replace(/(\*\*|__|\*|~~)(?=\S)|(?<=\S)(\*\*|__|\*|~~)/g, "")
    .replace(/[#>*~|]+/g, " ")
    .replace(/^\s*[-+]\s+/gm, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,!?;:])/g, "$1")
    .trim();

const MAX_CHUNK = 220;

// Splits off complete sentences, merging short ones up to MAX_CHUNK chars.
// Returns the chunks and whatever incomplete text is left over.
function takeSentences(text: string, flush: boolean): { chunks: string[]; rest: string } {
  const chunks: string[] = [];
  const re = /[^.!?…\n]+(?:[.!?…]+["')\]]*|\n+)(?=\s|$)/g;
  let last = 0;
  let current = "";
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const s = m[0].trim();
    last = re.lastIndex;
    if (!s) continue;
    if (current && current.length + s.length + 1 > MAX_CHUNK) {
      chunks.push(current);
      current = "";
    }
    current = current ? `${current} ${s}` : s;
  }
  let rest = text.slice(last);
  if (flush) {
    const tail = rest.trim();
    if (tail) current = current ? `${current} ${tail}` : tail;
    rest = "";
  }
  if (current) chunks.push(current);
  // Hard-split anything still too long (e.g. a run-on sentence)
  return {
    chunks: chunks.flatMap((c) => {
      if (c.length <= MAX_CHUNK * 1.5) return [c];
      const parts: string[] = [];
      let buf = "";
      for (const word of c.split(" ")) {
        if (buf && buf.length + word.length + 1 > MAX_CHUNK) {
          parts.push(buf);
          buf = "";
        }
        buf = buf ? `${buf} ${word}` : word;
      }
      if (buf) parts.push(buf);
      return parts;
    }),
    rest,
  };
}

// Once the server route fails, stay on browser speech for the session
let serverSpeechBroken = false;

function browserVoice(v: VoiceOption): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis?.getVoices() ?? [];
  for (const name of v.browser) {
    const found = voices.find((x) => x.name.includes(name));
    if (found) return found;
  }
  const english = voices.filter((x) => x.lang.startsWith("en"));
  const pool = english.length ? english : voices;
  if (!pool.length) return null;
  const idx = ["aurora", "sage", "atlas", "juniper"].indexOf(v.id);
  return pool[Math.max(0, idx) % pool.length];
}

export interface SpeakerEvents {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (message: string) => void;
}

interface Chunk {
  text: string;
  audio?: Promise<Blob | null>;
}

export class Speaker {
  // Only one speaker talks at a time across the app
  private static active: Speaker | null = null;
  private voice: VoiceOption;
  private queue: Chunk[] = [];
  private latest = "";
  private consumed = 0;
  private ended = false;
  private stopped = false;
  private playing = false;
  private audioEl: HTMLAudioElement | null = null;
  private objectUrl: string | null = null;
  private doneResolvers: (() => void)[] = [];
  private events: SpeakerEvents;

  constructor(voiceId: string, events: SpeakerEvents = {}) {
    this.voice = resolveVoice(voiceId);
    this.events = events;
    // Warm up the browser voice list for the fallback path
    window.speechSynthesis?.getVoices();
  }

  // Feed the full text so far (as it streams in); complete sentences are queued
  push(fullText: string) {
    if (this.stopped || this.ended) return;
    this.latest = fullText;
    // Hold back an unfinished code block so it isn't read out
    const fences = fullText.match(/```/g)?.length ?? 0;
    const safe = fences % 2 ? fullText.slice(0, fullText.lastIndexOf("```")) : fullText;
    const plain = toSpeech(safe);
    const { chunks, rest } = takeSentences(plain.slice(this.consumed), false);
    if (chunks.length) {
      this.consumed = plain.length - rest.length;
      this.enqueue(chunks);
    }
  }

  // Marks the text complete; resolves when everything has been spoken
  end(fullText?: string): Promise<void> {
    if (!this.ended && !this.stopped) {
      this.ended = true;
      const plain = toSpeech(fullText ?? this.latest);
      const { chunks } = takeSentences(plain.slice(this.consumed), true);
      this.consumed = plain.length;
      this.enqueue(chunks);
    }
    return this.whenDone();
  }

  // Speak a complete text in one go
  speak(text: string): Promise<void> {
    return this.end(text);
  }

  stop() {
    this.stopped = true;
    if (Speaker.active === this) Speaker.active = null;
    this.queue = [];
    if (this.audioEl) {
      this.audioEl.pause();
      this.audioEl.src = "";
    }
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = null;
    window.speechSynthesis?.cancel();
    this.finish();
  }

  private whenDone() {
    if (this.stopped || (this.ended && !this.playing && !this.queue.length)) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => this.doneResolvers.push(resolve));
  }

  private finish() {
    const wasActive = this.playing || this.doneResolvers.length > 0;
    this.playing = false;
    const resolvers = this.doneResolvers;
    this.doneResolvers = [];
    resolvers.forEach((r) => r());
    if (wasActive) this.events.onEnd?.();
  }

  private enqueue(texts: string[]) {
    for (const text of texts) if (text.trim()) this.queue.push({ text });
    this.prefetch();
    if (!this.playing) void this.pump();
    else if (this.ended && !this.queue.length && !this.playing) this.finish();
  }

  // Keep the next two chunks' audio in flight
  private prefetch() {
    if (serverSpeechBroken) return;
    for (const chunk of this.queue.slice(0, 2)) {
      if (!chunk.audio) chunk.audio = this.fetchAudio(chunk.text);
    }
  }

  private async fetchAudio(text: string): Promise<Blob | null> {
    if (serverSpeechBroken) return null;
    try {
      const res = await fetch("/api/voice/speech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: this.voice.id }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      return await res.blob();
    } catch {
      serverSpeechBroken = true;
      return null;
    }
  }

  private async pump() {
    if (this.playing) return;
    this.playing = true;
    let started = false;
    while (!this.stopped) {
      const chunk = this.queue.shift();
      if (!chunk) break;
      this.prefetch();
      if (!started) {
        started = true;
        if (Speaker.active && Speaker.active !== this) Speaker.active.stop();
        Speaker.active = this;
        this.events.onStart?.();
      }
      const blob = await (chunk.audio ?? this.fetchAudio(chunk.text));
      if (this.stopped) break;
      try {
        if (blob) await this.playBlob(blob);
        else await this.playBrowser(chunk.text);
      } catch {
        // Autoplay blocked or decode failure: try the browser voice once
        try {
          await this.playBrowser(chunk.text);
        } catch {
          this.events.onError?.("Couldn't play audio");
        }
      }
    }
    this.playing = false;
    // More text may still arrive while streaming
    if (this.stopped || (this.ended && !this.queue.length)) this.finish();
  }

  private playBlob(blob: Blob) {
    return new Promise<void>((resolve, reject) => {
      if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = URL.createObjectURL(blob);
      const el = this.audioEl ?? (this.audioEl = new Audio());
      el.src = this.objectUrl;
      el.onended = () => resolve();
      el.onerror = () => reject(new Error("audio error"));
      el.onpause = () => this.stopped && resolve();
      el.play().catch(reject);
    });
  }

  private playBrowser(text: string) {
    return new Promise<void>((resolve, reject) => {
      const synth = window.speechSynthesis;
      if (!synth) return reject(new Error("no speech synthesis"));
      const u = new SpeechSynthesisUtterance(text);
      const v = browserVoice(this.voice);
      if (v) u.voice = v;
      u.pitch = this.voice.pitch;
      u.rate = this.voice.rate;
      u.onend = () => resolve();
      u.onerror = (e) => (e.error === "interrupted" || e.error === "canceled" ? resolve() : reject(e));
      synth.speak(u);
    });
  }
}
