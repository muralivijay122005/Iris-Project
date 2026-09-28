"use client";

import React, { useEffect, useState } from "react";
import { LuCode, LuFileText, LuGhost, LuGraduationCap, LuLightbulb, LuPenLine } from "react-icons/lu";
import { IrisMark } from "../ui/brand";

const SUGGESTIONS = [
  { icon: LuLightbulb, title: "Brainstorm ideas", prompt: "Brainstorm 10 creative side-project ideas for a web developer, with a one-line pitch for each." },
  { icon: LuCode, title: "Write code", prompt: "Write a TypeScript function that debounces another function, with a short usage example." },
  { icon: LuGraduationCap, title: "Explain a concept", prompt: "Explain how HTTPS works like I'm new to networking, then give a technical summary." },
  { icon: LuPenLine, title: "Polish my writing", prompt: "Rewrite this to sound clear and professional:\n\n" },
];

function greeting(hour: number) {
  if (hour < 5) return "Up late";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function EmptyState({
  firstName,
  temporary,
  onPick,
  onAttach,
  children,
}: {
  firstName: string;
  temporary: boolean;
  onPick: (prompt: string) => void;
  onAttach: () => void;
  children: React.ReactNode;
}) {
  // Computed after mount so server and client render the same markup
  const [hello, setHello] = useState("Hello");
  useEffect(() => setHello(greeting(new Date().getHours())), []);

  return (
    <div className="hero-glow flex min-h-full flex-col items-center justify-center px-4 pb-10 pt-8">
      <div className="animate-slide-up w-full max-w-[var(--chat-width)]">
        <div className="mb-8 flex flex-col items-center text-center">
          {temporary ? (
            <>
              <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-line bg-elevated text-fg shadow-pop">
                <LuGhost size={22} />
              </span>
              <h1 className="text-[28px] font-semibold tracking-tight text-fg sm:text-[32px]">Temporary chat</h1>
              <p className="mt-2 max-w-md text-[15px] text-fg-muted">
                This chat won&rsquo;t appear in your history, and Iris won&rsquo;t use or save memories.
              </p>
            </>
          ) : (
            <>
              <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-accent-fg shadow-pop">
                <IrisMark size={22} />
              </span>
              <h1 className="text-[28px] font-semibold tracking-tight text-fg sm:text-[32px]">
                {hello}, {firstName}
              </h1>
              <p className="mt-2 text-[15px] text-fg-muted">How can I help you today?</p>
            </>
          )}
        </div>

        {children}

        {!temporary && (
          <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s.title}
                type="button"
                onClick={() => onPick(s.prompt)}
                className="group/sug flex items-center gap-3 rounded-2xl border border-line bg-elevated/60 px-4 py-3 text-left transition-colors hover:border-line-strong hover:bg-elevated"
              >
                <s.icon size={18} className="shrink-0 text-fg-subtle transition-colors group-hover/sug:text-accent" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-fg">{s.title}</span>
                  <span className="block truncate text-[13px] text-fg-subtle">{s.prompt.split("\n")[0]}</span>
                </span>
              </button>
            ))}
            <button
              type="button"
              onClick={onAttach}
              className="group/sug flex items-center gap-3 rounded-2xl border border-dashed border-line-strong px-4 py-3 text-left transition-colors hover:border-accent/50 hover:bg-elevated sm:col-span-2"
            >
              <LuFileText size={18} className="shrink-0 text-fg-subtle transition-colors group-hover/sug:text-accent" />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-fg">Analyze a file</span>
                <span className="block truncate text-[13px] text-fg-subtle">
                  PDF, Word, Excel, PowerPoint, code, CSV — or drop any file here
                </span>
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
