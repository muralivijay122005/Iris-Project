"use client";

import React from "react";
import { cn } from "./primitives";

// The Iris logo, tinted with currentColor via a CSS mask
export function IrisMark({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block shrink-0 bg-current", className)}
      style={{
        width: size,
        height: size,
        WebkitMask: "url(/Iris_X.svg) center / contain no-repeat",
        mask: "url(/Iris_X.svg) center / contain no-repeat",
      }}
    />
  );
}

export function Avatar({
  name,
  image,
  size = 28,
  className,
}: {
  name?: string | null;
  image?: string | null;
  size?: number;
  className?: string;
}) {
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image}
        alt=""
        referrerPolicy="no-referrer"
        width={size}
        height={size}
        className={cn("shrink-0 rounded-full object-cover", className)}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-accent font-semibold text-accent-fg",
        className
      )}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {initial}
    </span>
  );
}

// Animated "working" star: eight rays ripple in a wave while it slowly turns
export function Spark({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className={cn("spark shrink-0", className)}>
      {Array.from({ length: 8 }, (_, i) => (
        <g key={i} transform={`rotate(${i * 45} 12 12)`}>
          <line
            x1="12"
            y1="2.2"
            x2="12"
            y2="8.6"
            stroke="currentColor"
            strokeWidth={i % 2 ? 2 : 2.6}
            strokeLinecap="round"
            style={{ animationDelay: `${(-i * 1.15) / 8}s` }}
          />
        </g>
      ))}
    </svg>
  );
}
