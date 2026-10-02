"use client";

import { useEffect, useRef, useState } from "react";

// Characters per second when the reveal has caught up with the stream, and the
// ceiling it ramps to when far behind (so long replies never lag for long)
const BASE_CPS = 75;
const MAX_CPS = 520;
const RAMP = 0.9; // extra cps per character of backlog

/**
 * Reveals streamed text at a steady, readable pace instead of in network-sized
 * bursts. Text that was already complete on mount (history) shows immediately.
 */
export function useSmoothText(text: string, streaming: boolean) {
  const [shown, setShown] = useState(() => (streaming ? 0 : text.length));
  const textRef = useRef(text);
  textRef.current = text;
  const streamingRef = useRef(streaming);
  streamingRef.current = streaming;
  const posRef = useRef(shown);
  const runningRef = useRef(false);

  // Text can shrink (edit/regenerate reuse); never show past the end
  if (posRef.current > text.length) posRef.current = text.length;

  useEffect(() => {
    if (runningRef.current) return;
    if (posRef.current >= text.length && !streaming) return;
    runningRef.current = true;
    let raf = 0;
    let last = performance.now();

    const step = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const full = textRef.current;
      const backlog = full.length - posRef.current;

      if (backlog <= 0) {
        if (!streamingRef.current) {
          runningRef.current = false;
          setShown(full.length);
          return;
        }
      } else {
        const cps = Math.min(MAX_CPS, BASE_CPS + backlog * RAMP);
        posRef.current = Math.min(full.length, posRef.current + cps * dt);
        // Finish the current word so text doesn't flicker mid-word
        let end = Math.floor(posRef.current);
        const word = /^[^\s]{0,24}/.exec(full.slice(end))?.[0] ?? "";
        end += word.length;
        posRef.current = Math.max(posRef.current, end);
        setShown(end);
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      runningRef.current = false;
    };
  }, [text, streaming]);

  const visible = Math.min(shown, text.length);
  return { text: text.slice(0, visible), revealing: visible < text.length };
}
