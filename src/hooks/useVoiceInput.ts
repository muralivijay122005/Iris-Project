"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Extend Window for vendor-prefixed SpeechRecognition
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: Event & { error: string }) => void) | null;
  onstart: (() => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  return (
    (window as unknown as Record<string, SpeechRecognitionConstructor>).SpeechRecognition ??
    (window as unknown as Record<string, SpeechRecognitionConstructor>).webkitSpeechRecognition ??
    null
  );
}

export interface UseVoiceInputOptions {
  /** Called with transcribed text when a final result is received */
  onResult: (transcript: string) => void;
  /** Called with interim (in-progress) text */
  onInterim?: (transcript: string) => void;
  /** Language for recognition (default: "en-US") */
  lang?: string;
}

export interface UseVoiceInputReturn {
  /** Whether the browser supports speech recognition */
  supported: boolean;
  /** Whether the mic is currently listening */
  listening: boolean;
  /** Current interim transcript (updates live while speaking) */
  interim: string;
  /** Start listening */
  start: () => void;
  /** Stop listening */
  stop: () => void;
  /** Toggle listening on/off */
  toggle: () => void;
}

export function useVoiceInput({
  onResult,
  onInterim,
  lang = "en-US",
}: UseVoiceInputOptions): UseVoiceInputReturn {
  const SpeechRecognition = getSpeechRecognition();
  const supported = SpeechRecognition !== null;

  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const onResultRef = useRef(onResult);
  const onInterimRef = useRef(onInterim);
  const stoppingRef = useRef(false);

  onResultRef.current = onResult;
  onInterimRef.current = onInterim;

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        stoppingRef.current = true;
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
    };
  }, []);

  const start = useCallback(() => {
    if (!SpeechRecognition || listening) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang;

    recognition.onstart = () => {
      setListening(true);
      stoppingRef.current = false;
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimText = "";
      let finalText = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript;
        if (result.isFinal) {
          finalText += transcript;
        } else {
          interimText += transcript;
        }
      }

      if (finalText) {
        onResultRef.current(finalText);
        setInterim("");
      } else {
        setInterim(interimText);
        onInterimRef.current?.(interimText);
      }
    };

    recognition.onerror = (event) => {
      // "aborted" is expected when user stops manually
      if (event.error === "aborted" || event.error === "no-speech") return;
      console.warn("SpeechRecognition error:", event.error);
      setListening(false);
      setInterim("");
    };

    recognition.onend = () => {
      // Auto-restart if user hasn't explicitly stopped
      if (!stoppingRef.current && recognitionRef.current) {
        try {
          recognition.start();
        } catch {
          setListening(false);
          setInterim("");
        }
        return;
      }
      setListening(false);
      setInterim("");
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch {
      setListening(false);
    }
  }, [SpeechRecognition, lang, listening]);

  const stop = useCallback(() => {
    stoppingRef.current = true;
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setListening(false);
    setInterim("");
  }, []);

  const toggle = useCallback(() => {
    if (listening) {
      stop();
    } else {
      start();
    }
  }, [listening, start, stop]);

  return { supported, listening, interim, start, stop, toggle };
}
