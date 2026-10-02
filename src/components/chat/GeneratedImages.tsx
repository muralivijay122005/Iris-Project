"use client";

import React, { useEffect, useState } from "react";
import { LuCheck, LuCopy, LuDownload, LuMaximize2, LuX } from "react-icons/lu";
import type { GeneratedImageRef } from "../../types/chat";
import { cn, Portal, Tooltip } from "../ui/primitives";

const src = (id: string) => `/api/images/${id}`;

function Frame({ image, onOpen }: { image: GeneratedImageRef; onOpen: () => void }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(image.prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <figure
      className="group/img relative overflow-hidden rounded-2xl border border-line bg-surface"
      style={{ aspectRatio: `${image.width} / ${image.height}` }}
    >
      {!loaded && !failed && <div className="image-placeholder absolute inset-0" />}
      {failed ? (
        <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-fg-subtle">
          This image is no longer available.
        </div>
      ) : (
        <button type="button" onClick={onOpen} className="block h-full w-full cursor-zoom-in" aria-label="Open image">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src(image.id)}
            alt={image.prompt}
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
            className={cn("h-full w-full object-cover transition-[opacity,filter] duration-700", loaded ? "opacity-100" : "opacity-0 blur-md")}
          />
        </button>
      )}
      {loaded && (
        <div className="absolute right-2 top-2 flex gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover/img:opacity-100 md:focus-within:opacity-100">
          {[
            { label: copied ? "Copied" : "Copy prompt", icon: copied ? <LuCheck size={15} /> : <LuCopy size={15} />, onClick: copyPrompt },
            { label: "Expand", icon: <LuMaximize2 size={15} />, onClick: onOpen },
          ].map((b) => (
            <Tooltip key={b.label} label={b.label}>
              <button
                type="button"
                onClick={b.onClick}
                aria-label={b.label}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/55 text-white backdrop-blur-sm hover:bg-black/70"
              >
                {b.icon}
              </button>
            </Tooltip>
          ))}
          <Tooltip label="Download">
            <a
              href={`${src(image.id)}?download=1`}
              aria-label="Download"
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/55 text-white backdrop-blur-sm hover:bg-black/70"
            >
              <LuDownload size={15} />
            </a>
          </Tooltip>
        </div>
      )}
    </figure>
  );
}

function Lightbox({ image, onClose }: { image: GeneratedImageRef; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <Portal>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Image preview"
        onClick={onClose}
        className="animate-fade-in fixed inset-0 z-[800] flex flex-col items-center justify-center gap-4 bg-black/85 p-4 backdrop-blur-sm"
      >
        <div className="absolute right-4 top-4 flex gap-2">
          <a
            href={`${src(image.id)}?download=1`}
            onClick={(e) => e.stopPropagation()}
            aria-label="Download"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <LuDownload size={18} />
          </a>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <LuX size={20} />
          </button>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src(image.id)}
          alt={image.prompt}
          onClick={(e) => e.stopPropagation()}
          className="animate-pop-in max-h-[80dvh] max-w-full rounded-xl object-contain shadow-dialog"
        />
        <p onClick={(e) => e.stopPropagation()} className="max-w-2xl text-center text-sm leading-6 text-white/70">
          {image.prompt}
        </p>
      </div>
    </Portal>
  );
}

export default function GeneratedImages({ images }: { images: GeneratedImageRef[] }) {
  const [open, setOpen] = useState<GeneratedImageRef | null>(null);
  return (
    <>
      <div className={cn("mb-3 grid gap-2", images.length > 1 ? "grid-cols-2" : "max-w-[440px] grid-cols-1")}>
        {images.map((im) => (
          <Frame key={im.id} image={im} onOpen={() => setOpen(im)} />
        ))}
      </div>
      {open && <Lightbox image={open} onClose={() => setOpen(null)} />}
    </>
  );
}

// Shimmering frame shown while an image is being painted
export function ImagePlaceholder() {
  return (
    <div className="image-placeholder mb-3 aspect-square w-full max-w-[440px] rounded-2xl border border-line" aria-hidden />
  );
}
