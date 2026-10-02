// Text-to-image generation using free providers. Providers with credentials
// in the environment are tried first; keyless Pollinations is the fallback, so
// image generation works out of the box (with a small watermark).
//
//   CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN  Workers AI FLUX.1 schnell (free daily quota)
//   HF_TOKEN                                      Hugging Face FLUX.1 schnell (free monthly credits)
//   POLLINATIONS_API_KEY                          Pollinations, no watermark (free tier)
//   IMAGE_PROVIDER                                Force one: cloudflare | huggingface | pollinations
import { groq } from "./ai";
import { UTILITY_MODEL } from "./models";

export type Aspect = "square" | "landscape" | "portrait";

export const SIZES: Record<Aspect, { width: number; height: number }> = {
  square: { width: 1024, height: 1024 },
  landscape: { width: 1344, height: 768 },
  portrait: { width: 768, height: 1344 },
};

export interface GeneratedImage {
  data: Buffer;
  mime: string;
  provider: string;
}

interface GenerateOptions {
  prompt: string;
  width: number;
  height: number;
  seed: number;
  signal?: AbortSignal;
  /** Progress updates worth showing the user */
  onStatus?: (label: string) => void;
}

type Provider = {
  name: string;
  available: () => boolean;
  run: (o: GenerateOptions) => Promise<GeneratedImage>;
};

const TIMEOUT_MS = 90_000;

function withTimeout(signal?: AbortSignal) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  signal?.addEventListener("abort", () => ctrl.abort());
  return { signal: ctrl.signal, done: () => clearTimeout(timer) };
}

async function imageResponse(res: Response, provider: string): Promise<GeneratedImage> {
  const type = res.headers.get("content-type") || "";
  if (!res.ok || !type.startsWith("image/")) {
    const detail = (await res.text().catch(() => "")).slice(0, 200);
    throw new Error(`${provider} returned ${res.status}${detail ? `: ${detail}` : ""}`);
  }
  const data = Buffer.from(await res.arrayBuffer());
  if (data.length < 1000) throw new Error(`${provider} returned an empty image`);
  return { data, mime: type.split(";")[0], provider };
}

const PROVIDERS: Provider[] = [
  {
    name: "cloudflare",
    available: () => !!(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN),
    run: async ({ prompt, seed, signal }) => {
      const t = withTimeout(signal);
      try {
        const res = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-1-schnell`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ prompt: prompt.slice(0, 2048), steps: 8, seed }),
            signal: t.signal,
          }
        );
        const json: any = await res.json().catch(() => ({}));
        const b64 = json?.result?.image;
        if (!res.ok || !b64) {
          throw new Error(`cloudflare returned ${res.status}: ${JSON.stringify(json?.errors ?? json).slice(0, 200)}`);
        }
        return { data: Buffer.from(b64, "base64"), mime: "image/jpeg", provider: "cloudflare" };
      } finally {
        t.done();
      }
    },
  },
  {
    name: "huggingface",
    available: () => !!process.env.HF_TOKEN,
    run: async ({ prompt, width, height, seed, signal }) => {
      const model = process.env.HF_IMAGE_MODEL || "black-forest-labs/FLUX.1-schnell";
      const t = withTimeout(signal);
      try {
        const res = await fetch(`https://router.huggingface.co/hf-inference/models/${model}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.HF_TOKEN}`,
            "Content-Type": "application/json",
            Accept: "image/jpeg",
          },
          body: JSON.stringify({ inputs: prompt, parameters: { width, height, seed, num_inference_steps: 4 } }),
          signal: t.signal,
        });
        return await imageResponse(res, "huggingface");
      } finally {
        t.done();
      }
    },
  },
  {
    name: "pollinations",
    available: () => true,
    run: async ({ prompt, width, height, seed, signal, onStatus }) => {
      const key = process.env.POLLINATIONS_API_KEY;
      const model = process.env.POLLINATIONS_MODEL || "flux";
      const params = new URLSearchParams({
        width: String(width),
        height: String(height),
        seed: String(seed),
        model,
        nologo: "true",
        private: "true",
      });
      const path = encodeURIComponent(prompt.slice(0, 1500));
      const url = key
        ? `https://gen.pollinations.ai/image/${path}?${params}`
        : `https://image.pollinations.ai/prompt/${path}?${params}`;
      // Keyless use allows roughly one image per minute per IP; when we're
      // throttled (402/429), wait it out for a while instead of failing
      const started = Date.now();
      for (let attempt = 0; ; attempt++) {
        const t = withTimeout(signal);
        let res: Response;
        try {
          res = await fetch(url, {
            headers: key ? { Authorization: `Bearer ${key}` } : {},
            signal: t.signal,
          });
        } finally {
          t.done();
        }
        const throttled = res.status === 402 || res.status === 429;
        if (!throttled || Date.now() - started > POLLINATIONS_MAX_WAIT_MS) {
          if (throttled) throw new RateLimitedError();
          return imageResponse(res, "pollinations");
        }
        if (attempt === 0) onStatus?.("Waiting for the free image service");
        await sleep(POLLINATIONS_RETRY_MS, signal);
      }
    },
  },
];

const POLLINATIONS_MAX_WAIT_MS = 70_000;
const POLLINATIONS_RETRY_MS = 12_000;

export class RateLimitedError extends Error {
  constructor() {
    super(
      "The free image service is busy (it allows about one image a minute without a key). Add POLLINATIONS_API_KEY or CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN to .env.local for faster images."
    );
  }
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
    });
  });
}

export async function generateImage(opts: GenerateOptions): Promise<GeneratedImage> {
  const forced = process.env.IMAGE_PROVIDER?.toLowerCase();
  const order = PROVIDERS.filter((p) => p.available() && (!forced || p.name === forced));
  if (!order.length) throw new Error(`Image provider "${forced}" isn't configured`);

  let lastError: unknown = null;
  for (const provider of order) {
    if (opts.signal?.aborted) break;
    try {
      return await provider.run(opts);
    } catch (err: any) {
      lastError = err;
      console.warn(`[imagegen] ${provider.name} failed:`, err?.message);
    }
  }
  throw lastError ?? new Error("Image generation was cancelled");
}

// ---------- Deciding when to draw ----------

const DIRECT_ASK =
  /\b(generate|create|make|draw|paint|sketch|render|design|illustrate|produce|give me|show me|imagine)\b[^.?!\n]{0,60}?\b(image|images|picture|pic|photo|photograph|drawing|illustration|painting|artwork|art|logo|icon|wallpaper|poster|sketch|portrait|render|banner|sticker|avatar|thumbnail|mockup|concept art)\b/i;
const IMPERATIVE = /^\s*(please\s+)?(draw|paint|sketch|illustrate|imagine)\s+(me\s+)?(a|an|the|some|my|\w+ing)\b/i;
const COMMAND = /^\s*\/(image|imagine|img|draw)\b/i;
const FOLLOW_UP =
  /^\s*(now\s+|ok(ay)?,?\s+|and\s+)?(make|change|turn|add|remove|put|try|redo|regenerate|another|again|same|more|less|but)\b/i;

/** Whether a message asks for an image (follow-ups count when the last reply was one) */
export function wantsImage(prompt: string, lastReplyWasImage: boolean) {
  const p = prompt.trim();
  if (!p) return false;
  if (COMMAND.test(p) || IMPERATIVE.test(p) || DIRECT_ASK.test(p)) return true;
  // Questions about an image ("what is in this picture?") aren't requests to draw
  if (/^\s*(what|why|how|who|where|when|is|are|does|do|can you (explain|describe|tell))\b/i.test(p)) return false;
  return lastReplyWasImage && p.length < 200 && FOLLOW_UP.test(p);
}

export interface ImagePlan {
  prompt: string;
  aspect: Aspect;
  caption: string;
}

/** Turns a casual request (plus recent context) into a detailed image prompt */
export async function planImage(request: string, context: string[]): Promise<ImagePlan> {
  const cleaned = request.replace(COMMAND, "").trim();
  const fallback: ImagePlan = { prompt: cleaned || request, aspect: "square", caption: "Here's your image." };
  try {
    const res = await groq.chat.completions.create({
      model: UTILITY_MODEL,
      response_format: { type: "json_object" },
      // Leave room for the answer after gpt-oss's reasoning
      reasoning_effort: "low" as any, // accepted by the API; missing from SDK types
      max_completion_tokens: 2000,
      messages: [
        {
          role: "system",
          content: `You write prompts for a text-to-image model (FLUX).
Given the user's request and recent conversation, write ONE vivid, specific prompt (40-90 words): subject, setting, composition, lighting, color palette, style/medium, and quality cues. Keep every detail the user asked for. If the request modifies a previous image, rewrite that previous prompt with the change applied. Put any exact text the image must show in double quotes. No negative prompts, no parameters.
Pick an aspect: "landscape" for scenes, banners and wallpapers; "portrait" for people, posters and phone wallpapers; otherwise "square".
Also write a one-sentence, friendly caption (under 20 words, no emojis) telling the user what you made.
Respond with JSON: {"prompt": string, "aspect": "square"|"landscape"|"portrait", "caption": string}`,
        },
        {
          role: "user",
          content: `${context.length ? `Recent conversation:\n${context.join("\n").slice(-2500)}\n\n` : ""}Request: ${cleaned || request}`,
        },
      ],
    });
    const json = JSON.parse(res.choices[0]?.message?.content || "{}");
    const aspect: Aspect = ["square", "landscape", "portrait"].includes(json.aspect) ? json.aspect : "square";
    return {
      prompt: typeof json.prompt === "string" && json.prompt.trim() ? json.prompt.trim().slice(0, 1500) : fallback.prompt,
      aspect,
      caption: typeof json.caption === "string" && json.caption.trim() ? json.caption.trim().slice(0, 200) : fallback.caption,
    };
  } catch (err: any) {
    console.warn("[imagegen] Prompt planning failed:", err?.message);
    return fallback;
  }
}
