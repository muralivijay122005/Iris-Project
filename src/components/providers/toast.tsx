"use client";

import React, { createContext, useCallback, useContext, useState } from "react";
import { LuCircleAlert, LuCheck, LuInfo } from "react-icons/lu";

type ToastKind = "success" | "error" | "info";

interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
  icon?: React.ReactNode;
}

type ShowToast = (message: string, opts?: { kind?: ToastKind; icon?: React.ReactNode }) => void;

const ToastContext = createContext<ShowToast | null>(null);

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback<ShowToast>((message, opts) => {
    const id = nextId++;
    setToasts((prev) => [...prev.slice(-2), { id, message, kind: opts?.kind ?? "success", icon: opts?.icon }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2600);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 top-4 z-[1000] flex flex-col items-center gap-2 px-4"
        role="status"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="animate-toast-in flex max-w-md items-center gap-2.5 rounded-xl border border-line bg-elevated px-3.5 py-2.5 text-sm text-fg shadow-pop"
          >
            <span
              className={
                t.kind === "error"
                  ? "text-danger"
                  : t.kind === "info"
                  ? "text-fg-muted"
                  : "text-accent"
              }
            >
              {t.icon ??
                (t.kind === "error" ? (
                  <LuCircleAlert size={16} />
                ) : t.kind === "info" ? (
                  <LuInfo size={16} />
                ) : (
                  <LuCheck size={16} />
                ))}
            </span>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
