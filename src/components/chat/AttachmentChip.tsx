"use client";

import React from "react";
import {
  LuFile,
  LuFileArchive,
  LuFileAudio,
  LuFileCode,
  LuFileSpreadsheet,
  LuFileText,
  LuFileVideo,
  LuImage,
  LuPresentation,
  LuX,
} from "react-icons/lu";
import { cn } from "../ui/primitives";

export function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const CODE_EXT = /\.(js|jsx|ts|tsx|py|rb|go|rs|java|kt|swift|c|h|cpp|cs|php|sh|sql|html|css|scss|json|ya?ml|xml|toml|vue|svelte)$/i;

// Icon and tint for a file, based on type and extension
export function fileVisual(name: string, type: string) {
  const n = name.toLowerCase();
  if (type.startsWith("image/")) return { Icon: LuImage, tone: "text-violet-500 bg-violet-500/12", label: "Image" };
  if (type === "application/pdf" || n.endsWith(".pdf")) return { Icon: LuFileText, tone: "text-red-500 bg-red-500/12", label: "PDF" };
  if (/\.(xlsx?|csv|tsv)$/.test(n)) return { Icon: LuFileSpreadsheet, tone: "text-emerald-500 bg-emerald-500/12", label: "Spreadsheet" };
  if (/\.(pptx?|key)$/.test(n)) return { Icon: LuPresentation, tone: "text-orange-500 bg-orange-500/12", label: "Slides" };
  if (/\.(docx?|rtf|odt)$/.test(n)) return { Icon: LuFileText, tone: "text-blue-500 bg-blue-500/12", label: "Document" };
  if (CODE_EXT.test(n)) return { Icon: LuFileCode, tone: "text-sky-500 bg-sky-500/12", label: "Code" };
  if (/\.(zip|rar|7z|tar|gz)$/.test(n)) return { Icon: LuFileArchive, tone: "text-amber-500 bg-amber-500/12", label: "Archive" };
  if (type.startsWith("audio/")) return { Icon: LuFileAudio, tone: "text-pink-500 bg-pink-500/12", label: "Audio" };
  if (type.startsWith("video/")) return { Icon: LuFileVideo, tone: "text-fuchsia-500 bg-fuchsia-500/12", label: "Video" };
  if (type.startsWith("text/") || /\.(txt|md|log)$/.test(n)) return { Icon: LuFileText, tone: "text-fg-muted bg-surface-2", label: "Text" };
  return { Icon: LuFile, tone: "text-fg-muted bg-surface-2", label: "File" };
}

export function AttachmentChip({
  name,
  size,
  type,
  previewUrl,
  readable,
  onRemove,
  className,
}: {
  name: string;
  size: number;
  type: string;
  previewUrl?: string;
  readable?: boolean;
  onRemove?: () => void;
  className?: string;
}) {
  const { Icon, tone, label } = fileVisual(name, type);
  const note = readable === false ? " · not readable by AI" : "";

  return (
    <div
      className={cn(
        "group/chip relative flex h-14 w-full max-w-[240px] items-center gap-3 rounded-xl border border-line bg-elevated p-2 pr-3",
        className
      )}
      title={`${name} (${formatBytes(size)})${note}`}
    >
      {previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={previewUrl} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
      ) : (
        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", tone)}>
          <Icon size={18} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium text-fg">{name}</div>
        <div className="truncate text-xs text-fg-subtle">
          {label} · {formatBytes(size)}
          {note}
        </div>
      </div>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${name}`}
          className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-line bg-elevated text-fg-muted shadow-sm hover:text-fg sm:opacity-0 sm:group-hover/chip:opacity-100"
        >
          <LuX size={12} />
        </button>
      )}
    </div>
  );
}
