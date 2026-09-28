"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  LuBrain,
  LuCornerDownLeft,
  LuGhost,
  LuKeyboard,
  LuMessageSquare,
  LuMoon,
  LuSearch,
  LuSettings,
  LuSquarePen,
  LuSun,
  LuPanelLeft,
} from "react-icons/lu";
import type { ChatSummary } from "../types/chat";
import { cn, Dialog, Kbd, Shortcut } from "./ui/primitives";

interface Action {
  id: string;
  label: string;
  icon: React.ReactNode;
  shortcut?: string[];
  run: () => void;
  keywords?: string;
}

interface PaletteProps {
  open: boolean;
  onClose: () => void;
  chats: ChatSummary[];
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  onTemporaryChat: () => void;
  onOpenSettings: (tab?: string) => void;
  onToggleSidebar: () => void;
  onToggleTheme: () => void;
  isDark: boolean;
}

type Row =
  | { kind: "action"; action: Action }
  | { kind: "chat"; chat: ChatSummary };

// Wraps matches of `q` in <mark>
function highlight(text: string, q: string) {
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-sm bg-accent/25 text-fg">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

const relTime = (iso: string) => {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

export default function CommandPalette(props: PaletteProps) {
  const { open, onClose, chats } = props;
  const [query, setQuery] = useState("");
  const [remote, setRemote] = useState<ChatSummary[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setRemote(null);
      setActive(0);
    }
  }, [open]);

  // Full-text search on the server, debounced
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setRemote(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?query=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        const data = await res.json();
        setRemote(Array.isArray(data.chats) ? data.chats : []);
      } catch {
        /* aborted or offline */
      } finally {
        if (!ctrl.signal.aborted) setSearching(false);
      }
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query]);

  const actions: Action[] = useMemo(
    () => [
      { id: "new", label: "New chat", icon: <LuSquarePen size={16} />, shortcut: ["mod", "shift", "O"], run: props.onNewChat },
      { id: "temp", label: "New temporary chat", icon: <LuGhost size={16} />, run: props.onTemporaryChat, keywords: "incognito private" },
      { id: "memory", label: "Manage memory", icon: <LuBrain size={16} />, run: () => props.onOpenSettings("memory"), keywords: "remember forget" },
      { id: "settings", label: "Open settings", icon: <LuSettings size={16} />, shortcut: ["mod", ","], run: () => props.onOpenSettings("general"), keywords: "preferences" },
      {
        id: "theme",
        label: props.isDark ? "Switch to light mode" : "Switch to dark mode",
        icon: props.isDark ? <LuSun size={16} /> : <LuMoon size={16} />,
        run: props.onToggleTheme,
        keywords: "theme appearance dark light",
      },
      { id: "sidebar", label: "Toggle sidebar", icon: <LuPanelLeft size={16} />, shortcut: ["mod", "B"], run: props.onToggleSidebar },
      { id: "shortcuts", label: "Keyboard shortcuts", icon: <LuKeyboard size={16} />, shortcut: ["mod", "/"], run: () => props.onOpenSettings("shortcuts") },
    ],
    [props]
  );

  const q = query.trim().toLowerCase();

  const { actionRows, chatRows } = useMemo(() => {
    const actionRows = actions.filter(
      (a) => !q || a.label.toLowerCase().includes(q) || a.keywords?.includes(q)
    );
    let chatRows: ChatSummary[];
    if (!q) {
      chatRows = chats.slice(0, 8);
    } else {
      // Instant title matches first, then server results
      const local = chats.filter((c) => c.title.toLowerCase().includes(q));
      const seen = new Set(local.map((c) => c._id));
      const merged: ChatSummary[] = local.map((c) => ({
        ...c,
        snippet: remote?.find((r) => r._id === c._id)?.snippet,
      }));
      for (const r of remote ?? []) if (!seen.has(r._id)) merged.push(r);
      chatRows = merged.slice(0, 20);
    }
    return { actionRows, chatRows };
  }, [actions, chats, remote, q]);

  // With a query, chats come first; otherwise actions lead
  const rows: Row[] = q
    ? [...chatRows.map((c) => ({ kind: "chat" as const, chat: c })), ...actionRows.map((a) => ({ kind: "action" as const, action: a }))]
    : [...actionRows.map((a) => ({ kind: "action" as const, action: a })), ...chatRows.map((c) => ({ kind: "chat" as const, chat: c }))];

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-row="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const runRow = (row: Row) => {
    onClose();
    if (row.kind === "chat") props.onSelectChat(row.chat._id);
    else row.action.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(rows.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter" && rows[active]) {
      e.preventDefault();
      runRow(rows[active]);
    }
  };

  const renderRow = (row: Row, i: number) => {
    const isActive = i === active;
    const base = cn(
      "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left",
      isActive ? "bg-surface-2" : "hover:bg-surface"
    );
    if (row.kind === "action") {
      const a = row.action;
      return (
        <button key={`a-${a.id}`} data-row={i} type="button" className={base} onMouseMove={() => setActive(i)} onClick={() => runRow(row)}>
          <span className="text-fg-muted">{a.icon}</span>
          <span className="flex-1 text-sm text-fg">{highlight(a.label, query.trim())}</span>
          {a.shortcut && <Shortcut keys={a.shortcut} />}
        </button>
      );
    }
    const c = row.chat;
    return (
      <button key={`c-${c._id}`} data-row={i} type="button" className={base} onMouseMove={() => setActive(i)} onClick={() => runRow(row)}>
        <LuMessageSquare size={16} className="shrink-0 text-fg-muted" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-fg">{highlight(c.title, query.trim())}</span>
          {c.snippet && (
            <span className="block truncate text-xs text-fg-subtle">{highlight(c.snippet, query.trim())}</span>
          )}
        </span>
        <span className="shrink-0 text-xs text-fg-subtle">{relTime(c.updatedAt || c.createdAt)}</span>
        {isActive && <LuCornerDownLeft size={14} className="shrink-0 text-fg-subtle" />}
      </button>
    );
  };

  const chatOffset = q ? 0 : actionRows.length;
  const actionOffset = q ? chatRows.length : 0;

  const chatSection = chatRows.length > 0 && (
    <div key="chats">
      <div className="px-3 pb-1 pt-3 text-xs font-medium text-fg-subtle">{q ? "Chats" : "Recent chats"}</div>
      {chatRows.map((c, i) => renderRow({ kind: "chat", chat: c }, chatOffset + i))}
    </div>
  );
  const actionSection = actionRows.length > 0 && (
    <div key="actions">
      <div className="px-3 pb-1 pt-3 text-xs font-medium text-fg-subtle">Actions</div>
      {actionRows.map((a, i) => renderRow({ kind: "action", action: a }, actionOffset + i))}
    </div>
  );

  return (
    <Dialog open={open} onClose={onClose} label="Search and commands" position="top" className="max-w-[640px]">
      <div className="flex items-center gap-3 border-b border-line px-4">
        <LuSearch size={18} className="shrink-0 text-fg-subtle" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search chats or type a command…"
          className="h-14 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-fg-subtle"
          aria-label="Search"
        />
        {searching && <span className="h-4 w-4 animate-spin rounded-full border-2 border-line-strong border-t-accent" />}
        <Kbd>Esc</Kbd>
      </div>

      <div ref={listRef} className="max-h-[min(60vh,440px)] overflow-y-auto p-2">
        {rows.length === 0 ? (
          <div className="px-3 py-10 text-center text-sm text-fg-subtle">
            {searching ? "Searching…" : `No results for “${query.trim()}”`}
          </div>
        ) : q ? (
          [chatSection, actionSection]
        ) : (
          [actionSection, chatSection]
        )}
      </div>

      <div className="flex items-center gap-4 border-t border-line px-4 py-2.5 text-xs text-fg-subtle">
        <span className="flex items-center gap-1.5"><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span>
        <span className="flex items-center gap-1.5"><Kbd>↵</Kbd> open</span>
        <span className="ml-auto flex items-center gap-1.5"><Shortcut keys={["mod", "K"]} /> toggle</span>
      </div>
    </Dialog>
  );
}
