"use client";

// Client-side speech playback shared by "Read aloud" and voice chat. Text is
// spoken sentence by sentence through /api/voice/speech (prefetching ahead);
// if that fails, the browser's built-in speech synthesis takes over.
import { resolveVoice, VoiceOption } from "./voices";

// Emoji and pictographs (never spoken)
export const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{200D}\u{20E3}]/gu;

// Markdown → plain text suitable for speaking. Tables and code are never read
// out cell by cell; a short note points to the chat instead.
export const toSpeech = (md: string) =>
  md
    .replace(EMOJI, "")
    .replace(/```[\s\S]*?```/g, " The code is in the chat. ")
    .replace(/(^[ \t]*\|.*(\n|$))+/gm, " The table is shown in the chat. ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "the link in the chat")
    .replace(/^\s*\|?[-:| ]+\|?\s*$/gm, " ")
    .replace(/(\*\*|__|\*|~~)(?=\S)|(?<=\S)(\*\*|__|\*|~~)/g, "")
    .replace(/[#>*~|]+/g, " ")
    .replace(/^\s*[-+]\s+/gm, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,!?;:])/g, "$1")
    .trim();

// Each chunk is one spoken request and one subtitle cue, so keep it to a
// sentence or two
const MAX_CHUNK = 150;

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

/** The subtitle currently being spoken: its words and the index of the word being said */
export interface Cue {
  id: number;
  words: string[];
  current: number;
}

export interface SpeakerEvents {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (message: string) => void;
  /** Fires when a new cue starts and whenever the spoken word advances; null between cues */
  onCue?: (cue: Cue | null) => void;
}

// Relative time each word takes to say: its length plus pauses after punctuation
function wordWeights(words: string[]) {
  return words.map((w) => w.replace(/[^\p{L}\p{N}]/gu, "").length + 2 + (/[.!?…]$/.test(w) ? 6 : /[,;:]$/.test(w) ? 3 : 0));
}

// Index of the word being spoken `fraction` of the way through the cue
function wordAt(weights: number[], fraction: number) {
  const total = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  const target = fraction * total;
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i];
    if (acc > target) return i;
  }
  return weights.length - 1;
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
  private cueId = 0;
  private cue: Cue | null = null;
  private raf = 0;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private levelBuf: Float32Array<ArrayBuffer> | null = null;
  private browserSpeaking = false;
  private analyserFailed = false;

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

  /** Loudness of what's being said right now, 0..1 (for visualizers) */
  level(): number {
    if (this.analyser && this.levelBuf && this.audioEl && !this.audioEl.paused) {
      this.analyser.getFloatTimeDomainData(this.levelBuf);
      let sum = 0;
      for (const v of this.levelBuf) sum += v * v;
      return Math.min(1, Math.sqrt(sum / this.levelBuf.length) * 5);
    }
    // Browser voices can't be measured; approximate a gentle speaking motion
    if (this.browserSpeaking) return 0.35 + 0.25 * Math.abs(Math.sin(performance.now() / 140));
    return 0;
  }

  stop() {
    this.stopped = true;
    if (Speaker.active === this) Speaker.active = null;
    cancelAnimationFrame(this.raf);
    this.setCue(null);
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
    // Speech is over for good: release the visualizer's audio graph
    const ctx = this.audioCtx;
    this.audioCtx = null;
    this.analyser = null;
    void ctx?.close().catch(() => {});
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
        if (blob) await this.playBlob(blob, chunk.text);
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
    this.setCue(null);
    // More text may still arrive while streaming
    if (this.stopped || (this.ended && !this.queue.length)) this.finish();
  }

  private setCue(cue: Cue | null) {
    const prev = this.cue;
    if (cue && prev && cue.id === prev.id && cue.current === prev.current) return;
    if (!cue && !prev) return;
    this.cue = cue;
    this.events.onCue?.(cue);
  }

  // Starts a cue and advances its word from `progress()` (0..1) every frame
  private trackCue(text: string, progress: () => number | null) {
    cancelAnimationFrame(this.raf);
    const words = text.split(/\s+/).filter(Boolean);
    const weights = wordWeights(words);
    const id = ++this.cueId;
    this.setCue({ id, words, current: -1 });
    const tick = () => {
      if (this.stopped || this.cueId !== id) return;
      const p = progress();
      if (p !== null) this.setCue({ id, words, current: p >= 1 ? words.length : wordAt(weights, p) });
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(this.raf);
      if (this.cueId === id && !this.stopped) this.setCue({ id, words, current: words.length });
    };
  }

  // Routes the audio element through an analyser so level() can read it
  private async connectAnalyser(el: HTMLAudioElement) {
    if (this.audioCtx || this.analyserFailed) return;
    try {
      const ctx = new AudioContext();
      // A suspended context would silence the element once routed through it,
      // so only connect when the browser lets audio run
      if (ctx.state !== "running") {
        await Promise.race([ctx.resume(), new Promise((r) => setTimeout(r, 250))]);
      }
      if (ctx.state !== "running") {
        this.analyserFailed = true;
        void ctx.close().catch(() => {});
        return;
      }
      const source = ctx.createMediaElementSource(el);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      analyser.connect(ctx.destination);
      this.audioCtx = ctx;
      this.analyser = analyser;
      this.levelBuf = new Float32Array(analyser.fftSize);
    } catch {
      this.analyserFailed = true; // visualizer only; playback works without it
    }
  }

  private async playBlob(blob: Blob, text: string) {
    const el = this.audioEl ?? (this.audioEl = new Audio());
    await this.connectAnalyser(el);
    if (this.stopped) return;
    return new Promise<void>((resolve, reject) => {
      if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = URL.createObjectURL(blob);
      el.src = this.objectUrl;
      let done = () => {};
      el.onplaying = () => {
        done = this.trackCue(text, () =>
          el.duration && isFinite(el.duration) ? el.currentTime / el.duration : null
        );
      };
      el.onended = () => {
        done();
        resolve();
      };
      el.onerror = () => {
        done();
        reject(new Error("audio error"));
      };
      el.onpause = () => {
        if (!this.stopped) return;
        done();
        resolve();
      };
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

      // Word boundaries are exact when the voice reports them; otherwise
      // estimate from elapsed time (~15 characters a second at rate 1)
      let boundary = -1;
      let startedAt = 0;
      const estimate = Math.max(0.8, text.length / (15 * u.rate));
      let done = () => {};
      u.onstart = () => {
        startedAt = performance.now();
        this.browserSpeaking = true;
        done = this.trackCue(text, () => {
          if (boundary >= 0) return Math.min(0.999, boundary / text.length);
          return Math.min(0.97, (performance.now() - startedAt) / 1000 / estimate);
        });
      };
      u.onboundary = (e) => {
        if (e.name === "word" || e.name === undefined) boundary = e.charIndex + 1;
      };
      const finish = () => {
        this.browserSpeaking = false;
        done();
      };
      u.onend = () => {
        finish();
        resolve();
      };
      u.onerror = (e) => {
        finish();
        if (e.error === "interrupted" || e.error === "canceled") resolve();
        else reject(e);
      };
      synth.speak(u);
    });
  }
}
