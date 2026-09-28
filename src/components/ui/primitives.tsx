"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

// ---------- Platform ----------
export function useIsMac() {
  const [mac, setMac] = useState(false);
  useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent));
  }, []);
  return mac;
}

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    setMatches(mq.matches);
    const on = (e: MediaQueryListEvent) => setMatches(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return matches;
}

// ---------- Kbd ----------
export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-line bg-surface px-1 font-sans text-[11px] font-medium text-fg-subtle",
        className
      )}
    >
      {children}
    </kbd>
  );
}

// Renders a shortcut like ["mod", "K"] as ⌘K or Ctrl K
export function Shortcut({ keys, className }: { keys: string[]; className?: string }) {
  const mac = useIsMac();
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)}>
      {keys.map((k) => (
        <Kbd key={k}>
          {k === "mod" ? (mac ? "⌘" : "Ctrl") : k === "shift" ? (mac ? "⇧" : "Shift") : k}
        </Kbd>
      ))}
    </span>
  );
}

// ---------- Tooltip ----------
export function Tooltip({
  label,
  children,
  side = "bottom",
  shortcut,
}: {
  label: string;
  children: React.ReactElement;
  side?: "top" | "bottom" | "right";
  shortcut?: string[];
}) {
  const pos =
    side === "top"
      ? "bottom-full left-1/2 mb-2 -translate-x-1/2"
      : side === "right"
      ? "left-full top-1/2 ml-2 -translate-y-1/2"
      : "top-full left-1/2 mt-2 -translate-x-1/2";
  return (
    <span className="group/tt relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute z-[400] flex items-center gap-2 whitespace-nowrap rounded-lg bg-fg px-2 py-1 text-xs font-medium text-bg opacity-0 shadow-pop transition-opacity delay-0 duration-100 group-hover/tt:opacity-100 group-hover/tt:delay-300 max-md:hidden",
          pos
        )}
      >
        {label}
        {shortcut && <ShortcutInverse keys={shortcut} />}
      </span>
    </span>
  );
}

function ShortcutInverse({ keys }: { keys: string[] }) {
  const mac = useIsMac();
  return (
    <span className="text-bg/60">
      {keys.map((k) => (k === "mod" ? (mac ? "⌘" : "Ctrl+") : k === "shift" ? (mac ? "⇧" : "Shift+") : k)).join("")}
    </span>
  );
}

// ---------- Buttons ----------
export const IconButton = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; size?: "sm" | "md" }
>(function IconButton({ className, active, size = "md", ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-40 disabled:hover:bg-transparent",
        size === "sm" ? "h-7 w-7" : "h-9 w-9",
        active && "bg-surface-2 text-fg",
        className
      )}
      {...props}
    />
  );
});

export function Button({
  variant = "secondary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3.5 text-sm font-medium transition-colors disabled:opacity-50",
        variant === "primary" && "bg-accent text-accent-fg hover:bg-accent-hover",
        variant === "secondary" && "border border-line bg-elevated text-fg hover:bg-surface",
        variant === "ghost" && "text-fg-muted hover:bg-surface-2 hover:text-fg",
        variant === "danger" && "bg-danger/10 text-danger hover:bg-danger/15",
        className
      )}
      {...props}
    />
  );
}

// ---------- Switch ----------
export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
        checked ? "bg-accent" : "bg-surface-2 ring-1 ring-line-strong ring-inset"
      )}
    >
      <span
        className={cn(
          "inline-block h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-[19px]" : "translate-x-[3px]"
        )}
      />
    </button>
  );
}

// ---------- Portal ----------
export function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? createPortal(children, document.body) : null;
}

// ---------- Dialog ----------
export function Dialog({
  open,
  onClose,
  children,
  className,
  label,
  position = "center",
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  label: string;
  position?: "center" | "top";
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    // Bubble phase, so inputs inside can stopPropagation() on Escape to cancel edits
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Focus the first focusable element unless something inside is autofocused
    requestAnimationFrame(() => {
      if (!panelRef.current?.contains(document.activeElement)) {
        panelRef.current
          ?.querySelector<HTMLElement>("input, textarea, button, [tabindex]")
          ?.focus();
      }
    });
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return (
    <Portal>
      <div
        className={cn(
          "fixed inset-0 z-[500] flex justify-center bg-overlay p-3 backdrop-blur-[2px] animate-fade-in sm:p-6",
          position === "top" ? "items-start pt-[12vh]" : "items-center"
        )}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={label}
          className={cn(
            "animate-pop-in w-full overflow-hidden rounded-2xl border border-line bg-elevated text-fg shadow-dialog",
            className
          )}
        >
          {children}
        </div>
      </div>
    </Portal>
  );
}

// ---------- Menu ----------
export interface MenuItem {
  label: string;
  icon?: React.ReactNode;
  onSelect: () => void;
  danger?: boolean;
  shortcut?: string[];
  separatorBefore?: boolean;
}

// Dropdown anchored to a trigger element; flips upward near the bottom edge
export function Menu({
  anchor,
  open,
  onClose,
  items,
  align = "start",
  header,
  width = 208,
}: {
  anchor: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  items: MenuItem[];
  align?: "start" | "end";
  header?: React.ReactNode;
  width?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [active, setActiveState] = useState(-1);
  const activeRef = useRef(-1);
  const setActive = (v: number | ((i: number) => number)) => {
    activeRef.current = typeof v === "function" ? v(activeRef.current) : v;
    setActiveState(activeRef.current);
  };

  useLayoutEffect(() => {
    if (!open || !anchor) return;
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const h = ref.current?.offsetHeight ?? 200;
      let left = align === "end" ? r.right - width : r.left;
      left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
      let top = r.bottom + 6;
      if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
      setPos({ top, left });
    };
    place();
    requestAnimationFrame(place);
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, anchor, align, width]);

  useEffect(() => {
    if (!open) {
      setActive(-1);
      return;
    }
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !anchor?.contains(t)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const n = items.length;
        const i = activeRef.current;
        setActive(e.key === "ArrowDown" ? (i + 1) % n : (i - 1 + n) % n);
      } else if (e.key === "Enter" && activeRef.current >= 0) {
        e.preventDefault();
        items[activeRef.current].onSelect();
        onClose();
      }
    };
    const onScroll = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, anchor, onClose, items]);

  if (!open) return null;
  return (
    <Portal>
      <div
        ref={ref}
        role="menu"
        style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width }}
        className="animate-pop-in fixed z-[600] rounded-xl border border-line bg-elevated p-1 text-sm text-fg shadow-pop"
      >
        {header}
        {items.map((item, i) => (
          <React.Fragment key={item.label}>
            {item.separatorBefore && <div className="mx-2 my-1 h-px bg-line" />}
            <button
              type="button"
              role="menuitem"
              onMouseEnter={() => setActive(i)}
              onClick={() => {
                item.onSelect();
                onClose();
              }}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left",
                active === i && "bg-surface-2",
                item.danger ? "text-danger" : "text-fg"
              )}
            >
              {item.icon && (
                <span className={cn("shrink-0", item.danger ? "text-danger" : "text-fg-muted")}>
                  {item.icon}
                </span>
              )}
              <span className="flex-1 truncate">{item.label}</span>
              {item.shortcut && <Shortcut keys={item.shortcut} />}
            </button>
          </React.Fragment>
        ))}
      </div>
    </Portal>
  );
}
