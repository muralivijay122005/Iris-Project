"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "next-auth";
import {
  LuEllipsis,
  LuKeyboard,
  LuLogOut,
  LuMoon,
  LuPanelLeftClose,
  LuPanelLeftOpen,
  LuPencil,
  LuPin,
  LuPinOff,
  LuSearch,
  LuSettings,
  LuSquarePen,
  LuSun,
  LuTrash2,
  LuX,
} from "react-icons/lu";
import type { ChatSummary } from "../types/chat";
import { Avatar, IrisMark } from "./ui/brand";
import { cn, IconButton, Menu, MenuItem, Shortcut, Tooltip } from "./ui/primitives";
import { useSettings } from "./providers/settings";

interface SidebarProps {
  chats: ChatSummary[];
  chatsLoading: boolean;
  activeChatId: string | null;
  session: Session | null;
  collapsed: boolean;
  mobileOpen: boolean;
  isDesktop: boolean;
  onToggleCollapsed: () => void;
  onCloseMobile: () => void;
  onNewChat: () => void;
  onSelectChat: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onTogglePin: (chat: ChatSummary) => void;
  onDelete: (chat: ChatSummary) => void;
  onOpenSearch: () => void;
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
  onOpenSettings: (tab?: string) => void;
  onLogout: () => void;
}

// Buckets chats into Pinned / Today / Yesterday / Previous 7 days / … / month
function groupChats(chats: ChatSummary[]) {
  const groups: { label: string; items: ChatSummary[] }[] = [];
  const push = (label: string, c: ChatSummary) => {
    let g = groups.find((x) => x.label === label);
    if (!g) groups.push((g = { label, items: [] }));
    g.items.push(c);
  };
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const day = 86_400_000;

  for (const c of chats) {
    if (c.pinned) {
      push("Pinned", c);
      continue;
    }
    const t = new Date(c.updatedAt || c.createdAt).getTime();
    const diff = startOfToday.getTime() - t;
    if (t >= startOfToday.getTime()) push("Today", c);
    else if (diff < day) push("Yesterday", c);
    else if (diff < 7 * day) push("Previous 7 days", c);
    else if (diff < 30 * day) push("Previous 30 days", c);
    else
      push(
        new Date(t).toLocaleDateString(undefined, { month: "long", year: "numeric" }),
        c
      );
  }
  // Pinned always first; others keep chronological insertion order
  return groups.sort((a, b) => (a.label === "Pinned" ? -1 : b.label === "Pinned" ? 1 : 0));
}

function NavButton({
  icon,
  label,
  onClick,
  shortcut,
  collapsed,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  shortcut?: string[];
  collapsed: boolean;
}) {
  if (collapsed) {
    return (
      <Tooltip label={label} side="right" shortcut={shortcut}>
        <IconButton onClick={onClick} aria-label={label}>
          {icon}
        </IconButton>
      </Tooltip>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="group/nav flex h-9 w-full items-center gap-3 rounded-lg px-2.5 text-sm text-fg hover:bg-surface-2"
    >
      <span className="text-fg-muted group-hover/nav:text-fg">{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      {shortcut && (
        <Shortcut keys={shortcut} className="opacity-0 transition-opacity group-hover/nav:opacity-100" />
      )}
    </button>
  );
}

function SearchBar({
  collapsed,
  query,
  onQuery,
  onOpenSearch,
  onSubmit,
  isDesktop,
  inputRef,
}: {
  collapsed: boolean;
  query: string;
  onQuery: (q: string) => void;
  onOpenSearch: () => void;
  onSubmit: () => void;
  isDesktop: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const [focused, setFocused] = useState(false);

  if (collapsed) {
    return (
      <Tooltip label="Search chats" side="right" shortcut={["mod", "K"]}>
        <IconButton onClick={onOpenSearch} aria-label="Search chats">
          <LuSearch size={17} />
        </IconButton>
      </Tooltip>
    );
  }
  return (
    <div
      className={cn(
        "flex h-9 w-full items-center gap-2 rounded-lg border bg-bg px-2.5 text-sm transition-colors",
        focused ? "border-[color-mix(in_oklch,var(--accent)_50%,var(--border-strong))]" : "border-line hover:border-line-strong"
      )}
      onClick={() => inputRef?.current?.focus()}
    >
      <LuSearch size={15} className={cn("shrink-0", focused ? "text-fg-muted" : "text-fg-subtle")} />
      <input
        ref={inputRef}
        type="text"
        role="searchbox"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            if (query) onQuery("");
            else e.currentTarget.blur();
          } else if (e.key === "Enter") {
            e.preventDefault();
            onSubmit();
          }
        }}
        placeholder="Search chats"
        aria-label="Search chats"
        spellCheck={false}
        className="min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:text-fg-subtle"
      />
      {query ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onQuery("");
            inputRef?.current?.focus();
          }}
          aria-label="Clear search"
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-fg-subtle hover:text-fg"
        >
          <LuX size={14} />
        </button>
      ) : (
        isDesktop && <Shortcut keys={["mod", "K"]} className="shrink-0" />
      )}
    </div>
  );
}

// Filters chats by title locally and by message content on the server
function useChatSearch(chats: ChatSummary[], query: string) {
  const [remote, setRemote] = useState<ChatSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const q = query.trim();

  useEffect(() => {
    setRemote(null);
    if (!q) return;
    setLoading(true);
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?query=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        if (res.ok) setRemote((await res.json()).chats || []);
      } catch {
        /* aborted or offline: title matches still show */
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const results = useMemo(() => {
    if (!q) return null;
    const needle = q.toLowerCase();
    const local = chats.filter((c) => c.title.toLowerCase().includes(needle));
    const seen = new Set(local.map((c) => c._id));
    const snippets = new Map((remote || []).map((c) => [c._id, c.snippet]));
    return [
      ...local.map((c) => ({ ...c, snippet: snippets.get(c._id) ?? null })),
      ...(remote || []).filter((c) => !seen.has(c._id)),
    ];
  }, [chats, remote, q]);

  return { results, loading: loading && !!q };
}

function Highlight({ text, query }: { text: string; query: string }) {
  const i = text.toLowerCase().indexOf(query.toLowerCase());
  if (!query || i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-sm bg-accent/20 text-fg">{text.slice(i, i + query.length)}</mark>
      {text.slice(i + query.length)}
    </>
  );
}

function ChatRow({
  chat,
  active,
  onSelect,
  onRename,
  onTogglePin,
  onDelete,
}: {
  chat: ChatSummary;
  active: boolean;
  onSelect: () => void;
  onRename: (title: string) => void;
  onTogglePin: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(chat.title);
  const btnRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const t = draft.trim();
    if (t && t !== chat.title) onRename(t);
    else setDraft(chat.title);
  };

  const items: MenuItem[] = [
    {
      label: "Rename",
      icon: <LuPencil size={15} />,
      onSelect: () => {
        setDraft(chat.title);
        setEditing(true);
      },
    },
    {
      label: chat.pinned ? "Unpin" : "Pin",
      icon: chat.pinned ? <LuPinOff size={15} /> : <LuPin size={15} />,
      onSelect: onTogglePin,
    },
    { label: "Delete", icon: <LuTrash2 size={15} />, onSelect: onDelete, danger: true, separatorBefore: true },
  ];

  return (
    <li className="relative">
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setDraft(chat.title);
              setEditing(false);
            }
          }}
          maxLength={100}
          className="h-9 w-full rounded-lg border border-accent/60 bg-elevated px-2.5 text-sm text-fg outline-none"
          aria-label="Chat title"
        />
      ) : (
        <div
          className={cn(
            "group/row flex h-9 items-center rounded-lg text-sm transition-colors",
            active ? "bg-surface-2 text-fg" : "text-fg/85 hover:bg-surface-2/70 hover:text-fg",
            menuOpen && "bg-surface-2/70"
          )}
        >
          <button
            type="button"
            onClick={onSelect}
            onDoubleClick={() => setEditing(true)}
            className="h-full min-w-0 flex-1 truncate pl-2.5 text-left"
            title={chat.title}
            aria-current={active ? "page" : undefined}
          >
            {chat.title}
          </button>
          <button
            ref={btnRef}
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={`Options for ${chat.title}`}
            aria-haspopup="menu"
            className={cn(
              "mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-fg-muted hover:bg-line hover:text-fg",
              menuOpen || active ? "opacity-100" : "opacity-100 md:opacity-0 md:group-hover/row:opacity-100"
            )}
          >
            <LuEllipsis size={16} />
          </button>
        </div>
      )}
      <Menu anchor={btnRef.current} open={menuOpen} onClose={() => setMenuOpen(false)} items={items} width={180} />
    </li>
  );
}

const Sidebar: React.FC<SidebarProps> = (props) => {
  const {
    chats,
    chatsLoading,
    activeChatId,
    session,
    collapsed,
    mobileOpen,
    isDesktop,
    onToggleCollapsed,
    onCloseMobile,
    onNewChat,
    onSelectChat,
    onRename,
    onTogglePin,
    onDelete,
    onOpenSearch,
    searchInputRef,
    onOpenSettings,
    onLogout,
  } = props;
  const { resolvedTheme, update } = useSettings();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userBtnRef = useRef<HTMLButtonElement>(null);
  const groups = useMemo(() => groupChats(chats), [chats]);
  const [query, setQuery] = useState("");
  const { results, loading: searching } = useChatSearch(chats, query);

  // On mobile the sidebar is always the full drawer
  const rail = isDesktop && collapsed;
  const name = session?.user?.name || "You";
  const email = session?.user?.email || "";

  const userItems: MenuItem[] = [
    { label: "Settings", icon: <LuSettings size={15} />, onSelect: () => onOpenSettings("general"), shortcut: ["mod", ","] },
    {
      label: resolvedTheme === "dark" ? "Light mode" : "Dark mode",
      icon: resolvedTheme === "dark" ? <LuSun size={15} /> : <LuMoon size={15} />,
      onSelect: () => update({ theme: resolvedTheme === "dark" ? "light" : "dark" }),
    },
    { label: "Keyboard shortcuts", icon: <LuKeyboard size={15} />, onSelect: () => onOpenSettings("shortcuts"), shortcut: ["mod", "/"] },
    { label: "Log out", icon: <LuLogOut size={15} />, onSelect: onLogout, separatorBefore: true },
  ];

  const pick = (fn: () => void) => () => {
    fn();
    if (!isDesktop) onCloseMobile();
  };

  return (
    <>
      {!isDesktop && (
        <div
          className={cn(
            "fixed inset-0 z-[90] bg-overlay backdrop-blur-[2px] transition-opacity duration-300",
            mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
          )}
          onClick={onCloseMobile}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          "z-[100] flex h-dvh shrink-0 flex-col border-r border-line bg-sidebar transition-[width,transform] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]",
          isDesktop ? "relative" : "fixed inset-y-0 left-0 w-[288px] shadow-dialog",
          isDesktop && (rail ? "w-[60px]" : "w-[272px]"),
          !isDesktop && (mobileOpen ? "translate-x-0" : "-translate-x-full")
        )}
        aria-label="Sidebar"
      >
        {/* Header */}
        <div className={cn("flex h-14 shrink-0 items-center", rail ? "justify-center" : "justify-between px-3")}>
          {rail ? (
            <Tooltip label="Open sidebar" side="right" shortcut={["mod", "B"]}>
              <IconButton onClick={onToggleCollapsed} aria-label="Open sidebar" className="group/logo">
                <IrisMark size={18} className="text-fg group-hover/logo:hidden" />
                <LuPanelLeftOpen size={18} className="hidden group-hover/logo:block" />
              </IconButton>
            </Tooltip>
          ) : (
            <>
              <button type="button" onClick={pick(onNewChat)} className="flex items-center gap-2.5 rounded-lg px-1.5 py-1">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-accent-fg">
                  <IrisMark size={15} />
                </span>
                <span className="text-[15px] font-minecraft tracking-tight">iris</span>
              </button>
              <Tooltip label="Close sidebar" shortcut={isDesktop ? ["mod", "B"] : undefined}>
                <IconButton
                  onClick={isDesktop ? onToggleCollapsed : onCloseMobile}
                  aria-label="Close sidebar"
                >
                  <LuPanelLeftClose size={18} />
                </IconButton>
              </Tooltip>
            </>
          )}
        </div>

        {/* Primary actions */}
        <nav className={cn("flex shrink-0 flex-col gap-0.5", rail ? "items-center px-0" : "px-2")}>
          <NavButton icon={<LuSquarePen size={17} />} label="New chat" onClick={pick(onNewChat)} shortcut={["mod", "shift", "O"]} collapsed={rail} />
          <div className={cn(!rail && "mt-1")}>
            <SearchBar
              collapsed={rail}
              query={query}
              onQuery={setQuery}
              onOpenSearch={pick(onOpenSearch)}
              onSubmit={() => {
                const first = results?.[0];
                if (first) pick(() => onSelectChat(first._id))();
              }}
              isDesktop={isDesktop}
              inputRef={searchInputRef}
            />
          </div>
        </nav>

        {/* History */}
        <div className={cn("mt-3 min-h-0 flex-1 overflow-y-auto px-2 pb-3", rail && "invisible")}>
          {results ? (
            <section aria-label="Search results">
              <h3 className="flex h-8 items-center justify-between px-2.5 text-xs font-medium text-fg-subtle">
                <span>{searching && !results.length ? "Searching…" : `${results.length} result${results.length === 1 ? "" : "s"}`}</span>
                {searching && results.length > 0 && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />}
              </h3>
              {results.length === 0 && !searching ? (
                <div className="px-3 py-6 text-center text-sm text-fg-subtle">No chats match “{query.trim()}”.</div>
              ) : (
                <ul className="space-y-px">
                  {results.map((c) => (
                    <li key={c._id}>
                      <button
                        type="button"
                        onClick={pick(() => onSelectChat(c._id))}
                        className={cn(
                          "w-full rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors",
                          c._id === activeChatId ? "bg-surface-2 text-fg" : "text-fg/85 hover:bg-surface-2/70 hover:text-fg"
                        )}
                      >
                        <span className="block truncate">
                          <Highlight text={c.title} query={query.trim()} />
                        </span>
                        {c.snippet && (
                          <span className="mt-0.5 block truncate text-xs text-fg-subtle">
                            <Highlight text={c.snippet} query={query.trim()} />
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : chatsLoading && chats.length === 0 ? (
            <div className="space-y-1.5 px-1 pt-2" aria-label="Loading chats">
              {[70, 55, 80, 45, 62].map((w, i) => (
                <div key={i} className="h-7 animate-pulse rounded-md bg-surface-2/70" style={{ width: `${w}%` }} />
              ))}
            </div>
          ) : chats.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-fg-subtle">
              Your conversations will appear here.
            </div>
          ) : (
            groups.map((g) => (
              <section key={g.label} className="mb-4">
                <h3 className="sticky top-0 z-10 flex h-8 items-center gap-1.5 bg-sidebar px-2.5 text-xs font-medium text-fg-subtle">
                  {g.label === "Pinned" && <LuPin size={12} />}
                  {g.label}
                </h3>
                <ul className="space-y-px">
                  {g.items.map((c) => (
                    <ChatRow
                      key={c._id}
                      chat={c}
                      active={c._id === activeChatId}
                      onSelect={pick(() => onSelectChat(c._id))}
                      onRename={(t) => onRename(c._id, t)}
                      onTogglePin={() => onTogglePin(c)}
                      onDelete={() => onDelete(c)}
                    />
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>

        {/* Account */}
        <div className={cn("shrink-0 border-t border-line p-2", rail && "flex justify-center")}>
          <button
            ref={userBtnRef}
            type="button"
            onClick={() => setUserMenuOpen((o) => !o)}
            aria-haspopup="menu"
            aria-label="Account menu"
            className={cn(
              "flex items-center gap-3 rounded-lg hover:bg-surface-2",
              rail ? "h-10 w-10 justify-center" : "w-full p-2 text-left"
            )}
          >
            <Avatar name={name} image={session?.user?.image} size={rail ? 28 : 32} />
            {!rail && (
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-fg">{name}</span>
                <span className="block truncate text-xs text-fg-subtle">{email}</span>
              </span>
            )}
          </button>
          <Menu
            anchor={userBtnRef.current}
            open={userMenuOpen}
            onClose={() => setUserMenuOpen(false)}
            items={userItems}
            width={240}
            header={
              <div className="border-b border-line px-2.5 pb-2 pt-1.5 mb-1">
                <div className="truncate text-sm font-medium">{name}</div>
                <div className="truncate text-xs text-fg-subtle">{email}</div>
              </div>
            }
          />
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
