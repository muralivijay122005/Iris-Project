// Server-side text extraction for chat attachments. Any file type is accepted;
// files we can't read as text are still attached, with metadata only.
import pdfParse from "pdf-parse-debugging-disabled";
import mammoth from "mammoth";
import JSZip from "jszip";
import { readImage, readScannedPdf } from "./vision";

export const MAX_FILES = 5;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
// Per-file cap on extracted text sent to the model (~6k tokens)
const MAX_CHARS_PER_FILE = 24_000;

export interface ExtractedAttachment {
  name: string;
  size: number;
  type: string;
  content: string;
  truncated: boolean;
}

const TEXT_EXTENSIONS = new Set([
  "txt", "md", "markdown", "mdx", "csv", "tsv", "json", "jsonl", "xml", "yaml",
  "yml", "toml", "ini", "cfg", "conf", "env", "log", "html", "htm", "css",
  "scss", "sass", "less", "js", "jsx", "mjs", "cjs", "ts", "tsx", "py", "rb",
  "go", "rs", "java", "kt", "kts", "swift", "c", "h", "cpp", "cc", "hpp", "cs",
  "php", "sh", "bash", "zsh", "ps1", "bat", "sql", "graphql", "gql", "vue",
  "svelte", "astro", "r", "lua", "pl", "dart", "scala", "ex", "exs", "erl",
  "hs", "clj", "tex", "rst", "srt", "vtt", "svg", "gitignore", "dockerfile",
  "makefile", "gradle", "proto", "tf", "ipynb",
]);

const extOf = (name: string) => {
  const base = name.toLowerCase().split(/[\\/]/).pop() || "";
  return base.includes(".") ? base.split(".").pop()! : base;
};

// Treat as text when the sample has no NUL bytes and few control characters
function looksLikeText(buf: Buffer): boolean {
  const sample = buf.subarray(0, 8192);
  if (sample.length === 0) return true;
  let suspicious = 0;
  for (const byte of sample) {
    if (byte === 0) return false;
    if (byte < 7 || (byte > 13 && byte < 32)) suspicious++;
  }
  return suspicious / sample.length < 0.02;
}

function clip(text: string) {
  const clean = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return clean.length > MAX_CHARS_PER_FILE
    ? { content: clean.slice(0, MAX_CHARS_PER_FILE), truncated: true }
    : { content: clean, truncated: false };
}

const decodeXml = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

async function extractPptx(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const slides = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => parseInt(a.match(/\d+/)![0]) - parseInt(b.match(/\d+/)![0]));
  const out: string[] = [];
  for (const [i, path] of slides.entries()) {
    const xml = await zip.file(path)!.async("string");
    const texts = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => decodeXml(m[1]));
    if (texts.length) out.push(`Slide ${i + 1}:\n${texts.join(" ")}`);
  }
  return out.join("\n\n");
}

async function extractXlsx(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const shared: string[] = [];
  const sharedXml = await zip.file("xl/sharedStrings.xml")?.async("string");
  if (sharedXml) {
    for (const si of sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      shared.push(
        [...si[1].matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((m) => decodeXml(m[1])).join("")
      );
    }
  }
  const sheets = Object.keys(zip.files)
    .filter((p) => /^xl\/worksheets\/sheet\d+\.xml$/.test(p))
    .sort((a, b) => parseInt(a.match(/\d+/)![0]) - parseInt(b.match(/\d+/)![0]));
  const out: string[] = [];
  for (const [i, path] of sheets.entries()) {
    const xml = await zip.file(path)!.async("string");
    const rows: string[] = [];
    for (const row of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells: string[] = [];
      for (const c of row[1].matchAll(/<c([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1];
        const inner = c[2] || "";
        const v = inner.match(/<v>([^<]*)<\/v>/)?.[1];
        const inline = inner.match(/<t[^>]*>([^<]*)<\/t>/)?.[1];
        if (/t="s"/.test(attrs) && v !== undefined) cells.push(shared[parseInt(v)] ?? "");
        else if (inline !== undefined) cells.push(decodeXml(inline));
        else cells.push(v !== undefined ? decodeXml(v) : "");
      }
      if (cells.some((x) => x !== "")) rows.push(cells.join("\t"));
    }
    if (rows.length) out.push(`Sheet ${i + 1}:\n${rows.join("\n")}`);
  }
  return out.join("\n\n");
}

// Image formats the vision pipeline can decode
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "image/bmp", "image/tiff", "image/avif"]);

// A text layer this thin means the PDF is scanned (or mostly images)
const needsPdfOcr = (text: string, pages: number) =>
  text.replace(/\s+/g, "").length < Math.max(40, pages * 25);

async function extractPdf(buf: Buffer): Promise<string> {
  let text = "";
  let pages = 1;
  try {
    const parsed = await pdfParse(buf);
    text = parsed.text?.trim() || "";
    pages = parsed.numpages || 1;
  } catch (err: any) {
    console.warn("[extract] pdf-parse failed, trying OCR:", err?.message);
  }
  if (!needsPdfOcr(text, pages)) return text;

  try {
    const ocr = await readScannedPdf(buf);
    if (ocr.text) {
      const note =
        ocr.read < ocr.pages ? `\n\n[Only the first ${ocr.read} of ${ocr.pages} pages were read.]` : "";
      return `[Scanned PDF, text recovered with OCR]\n${ocr.text}${note}`;
    }
  } catch (err: any) {
    console.warn("[extract] PDF OCR failed:", err?.message);
  }
  return text;
}

export async function extractAttachment(file: File): Promise<ExtractedAttachment> {
  const buf = Buffer.from(await file.arrayBuffer());
  const ext = extOf(file.name);
  const type = file.type || "application/octet-stream";
  const base = { name: file.name, size: file.size, type };

  let text = "";

  try {
    if (IMAGE_TYPES.has(type) || /^(jpe?g|png|gif|webp|bmp|tiff?|avif)$/.test(ext)) {
      text = await readImage(buf, type.startsWith("image/") ? type : `image/${ext === "jpg" ? "jpeg" : ext}`, file.name);
    } else if (type === "application/pdf" || ext === "pdf") {
      text = await extractPdf(buf);
    } else if (ext === "docx") {
      text = (await mammoth.extractRawText({ buffer: buf })).value;
    } else if (ext === "pptx") {
      text = await extractPptx(buf);
    } else if (ext === "xlsx") {
      text = await extractXlsx(buf);
    } else if (
      type.startsWith("text/") ||
      /json|xml|javascript|typescript|yaml|x-sh|sql|csv/.test(type) ||
      TEXT_EXTENSIONS.has(ext) ||
      (!type.startsWith("image/") &&
        !type.startsWith("audio/") &&
        !type.startsWith("video/") &&
        looksLikeText(buf))
    ) {
      text = buf.toString("utf-8");
    }
  } catch (err: any) {
    console.warn("[extract] Failed to read", file.name, err?.message);
    text = "";
  }

  return { ...base, ...clip(text) };
}

// Human-readable reason the model can't see a file's contents
export function unreadableNote(att: { name: string; type: string }) {
  if (att.type.startsWith("image/"))
    return "This image couldn't be read (unsupported format or the vision service was unavailable). Only the file name is available.";
  if (att.type.startsWith("audio/") || att.type.startsWith("video/"))
    return "This is a media file. Its contents are not available to you.";
  if (att.type === "application/pdf" || /\.pdf$/i.test(att.name))
    return "No text could be recovered from this PDF, even with OCR.";
  return "The contents of this file could not be extracted as text.";
}
