"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { SETTINGS_STORAGE_KEY } from "../../lib/settings-key";
import { DEFAULT_MODEL } from "../../lib/models";
import { DEFAULT_VOICE } from "../../lib/voices";

export type ThemeMode = "light" | "dark" | "system";
export type Accent = "lagoon" | "iris" | "ocean" | "rose" | "amber" | "mono";
export type FontSize = "sm" | "md" | "lg";

// Appearance and input preferences, stored per browser
export interface Settings {
  theme: ThemeMode;
  accent: Accent;
  fontSize: FontSize;
  wide: boolean;
  sendOnEnter: boolean;
  showReasoning: boolean;
  model: string;
  voice: string;
}

export const ACCENTS: { id: Accent; label: string; swatch: string }[] = [
  { id: "lagoon", label: "Lagoon", swatch: "oklch(0.7 0.12 198)" },
  { id: "iris", label: "Iris", swatch: "oklch(0.64 0.18 285)" },
  { id: "ocean", label: "Ocean", swatch: "oklch(0.64 0.16 248)" },
  { id: "rose", label: "Rose", swatch: "oklch(0.66 0.18 10)" },
  { id: "amber", label: "Amber", swatch: "oklch(0.76 0.15 70)" },
  { id: "mono", label: "Graphite", swatch: "oklch(0.45 0.01 255)" },
];

const DEFAULTS: Settings = {
  theme: "system",
  accent: "lagoon",
  fontSize: "md",
  wide: false,
  sendOnEnter: true,
  showReasoning: true,
  model: DEFAULT_MODEL,
  voice: DEFAULT_VOICE,
};

interface SettingsContextValue {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  resolvedTheme: "light" | "dark";
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

function readStored(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [systemDark, setSystemDark] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setSettings(readStored());
    setLoaded(true);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setSystemDark(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const resolvedTheme =
    settings.theme === "system" ? (systemDark ? "dark" : "light") : settings.theme;

  // The pre-paint script already applied stored values; sync only after load
  useEffect(() => {
    if (!loaded) return;
    const root = document.documentElement;
    root.classList.toggle("dark", resolvedTheme === "dark");
    root.dataset.accent = settings.accent;
    root.dataset.fontSize = settings.fontSize;
    root.dataset.wide = String(settings.wide);
  }, [loaded, resolvedTheme, settings.accent, settings.fontSize, settings.wide]);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, update, resolvedTheme }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used inside SettingsProvider");
  return ctx;
}
