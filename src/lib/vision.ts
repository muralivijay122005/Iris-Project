// Image understanding for attachments. A vision model transcribes and
// describes each image so text-only chat models can reason about it; Tesseract
// is the fallback when the vision model is unavailable.
import { Groq } from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY ?? "" });

export const VISION_MODEL =
  process.env.GROQ_VISION_MODEL || "qwen/qwen3.8-27b";

// Groq accepts base64 images up to 4MB; stay under that after encoding
const MAX_VISION_BYTES = 3 * 1024 * 1024;
const MAX_EDGE = 2048;
// Scanned PDFs: pages rendered and read, and how many at once
const MAX_PDF_PAGES = 8;
const PDF_CONCURRENCY = 3;

const VISION_PROMPT = `You are the eyes of a text-only assistant. It cannot see this image, so it will rely entirely on your report.

Reply in exactly this format:

## Text
Transcribe ALL visible text verbatim, in reading order. Keep line breaks and structure: tables as Markdown tables, code in fenced code blocks, math in LaTeX, form fields as "Label: value". Mark illegible parts as [illegible]. If there is no text, write "(none)".

## Description
Describe the image thoroughly: what kind of image it is (photo, screenshot, document, chart, diagram, handwriting, meme…), the main subject, important objects and their positions, colors, and context. For charts and graphs give the title, axes, series and approximate values. For screenshots name the app or site and the UI state. For diagrams explain the structure and connections. Do not identify real people by name.`;

const PAGE_PROMPT = `Transcribe ALL text on this scanned document page verbatim, in reading order. Keep structure: headings, paragraphs, lists, tables as Markdown tables, math in LaTeX. Mark illegible parts as [illegible]. After the text, add one line starting with "Visuals:" briefly describing any figures, photos, stamps, signatures or charts (or "Visuals: none"). Output only the transcription.`;

async function loadCanvas() {
  try {
    return await import("@napi-rs/canvas");
  } catch {
    return null;
  }
}

// Downscales large images and converts unusual formats to JPEG so the vision
// model accepts them. Returns the original bytes when no change is needed.
async function prepareImage(buf: Buffer, mime: string): Promise<{ data: Buffer; mime: string }> {
  const direct = ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mime);
  if (direct && buf.length <= MAX_VISION_BYTES) return { data: buf, mime };

  const canvasLib = await loadCanvas();
  if (!canvasLib) return { data: buf, mime };
  const img = await canvasLib.loadImage(buf);
  const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = canvasLib.createCanvas(w, h);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  let quality = 88;
  let data = await canvas.encode("jpeg", quality);
  while (data.length > MAX_VISION_BYTES && quality > 40) {
    quality -= 15;
    data = await canvas.encode("jpeg", quality);
  }
  return { data, mime: "image/jpeg" };
}

async function askVision(data: Buffer, mime: string, prompt: string): Promise<string> {
  const res = await groq.chat.completions.create({
    model: VISION_MODEL,
    temperature: 0.1,
    max_completion_tokens: 3000,
    // Qwen can think before answering; keep only the answer
    ...(VISION_MODEL.startsWith("qwen/") && { reasoning_format: "hidden" as const }),
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: `data:${mime};base64,${data.toString("base64")}` } },
        ],
      },
    ],
  });
  return (res.choices[0]?.message?.content || "").trim();
}

async function tesseract(buf: Buffer): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  try {
    const ret = await worker.recognize(buf);
    return ret.data.text.trim();
  } finally {
    await worker.terminate();
  }
}

// Full reading of an image attachment: transcription plus description
export async function readImage(buf: Buffer, mime: string, name: string): Promise<string> {
  if (process.env.GROQ_API_KEY) {
    try {
      const img = await prepareImage(buf, mime);
      const report = await askVision(img.data, img.mime, VISION_PROMPT);
      if (report) return `[Image "${name}", read by a vision model]\n${report}`;
    } catch (err: any) {
      console.warn("[vision] Vision model failed for", name, err?.status, err?.message);
    }
  }
  try {
    const text = await tesseract(buf);
    return text
      ? `[Image "${name}": only OCR text is available, no visual description]\n${text}`
      : `[Image "${name}": no text detected and no visual description available]`;
  } catch (err: any) {
    console.warn("[vision] OCR failed for", name, err?.message);
    return "";
  }
}

// OCR for PDFs without a text layer: renders pages and reads each one
export async function readScannedPdf(buf: Buffer): Promise<{ text: string; pages: number; read: number }> {
  const canvasLib = await loadCanvas();
  if (!canvasLib) return { text: "", pages: 0, read: 0 };

  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buf),
    disableFontFace: true,
    isEvalSupported: false,
    verbosity: 0,
  }).promise;

  const total: number = doc.numPages;
  const count = Math.min(total, MAX_PDF_PAGES);
  const renderPage = async (n: number) => {
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    // ~150-200 DPI is plenty for OCR while keeping uploads small
    const scale = Math.min(2.5, MAX_EDGE / Math.max(base.width, base.height));
    const viewport = page.getViewport({ scale });
    const canvas = canvasLib.createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    page.cleanup();
    return canvas.encode("jpeg", 85);
  };

  const readPage = async (n: number) => {
    const jpg = await renderPage(n);
    if (process.env.GROQ_API_KEY) {
      try {
        return await askVision(jpg, "image/jpeg", PAGE_PROMPT);
      } catch (err: any) {
        console.warn("[vision] Page OCR via vision failed, using Tesseract:", err?.message);
      }
    }
    return tesseract(jpg);
  };

  const results: string[] = new Array(count).fill("");
  let next = 1;
  const workers = Array.from({ length: Math.min(PDF_CONCURRENCY, count) }, async () => {
    while (next <= count) {
      const n = next++;
      try {
        results[n - 1] = await readPage(n);
      } catch (err: any) {
        console.warn("[vision] Failed to read PDF page", n, err?.message);
      }
    }
  });
  await Promise.all(workers);
  await doc.destroy();

  const text = results
    .map((t, i) => (t ? `--- Page ${i + 1} ---\n${t}` : ""))
    .filter(Boolean)
    .join("\n\n");
  return { text, pages: total, read: count };
}
