"use client";

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { LuArrowDown, LuBrain, LuUpload } from "react-icons/lu";
import type { Attachment, ChatSummary, Message } from "../types/chat";
import Sidebar from "./Sidebar";
import CommandPalette from "./CommandPalette";
import SettingsDialog, { SettingsTab } from "./SettingsDialog";
import Splash from "./Splash";
import ChatHeader from "./chat/ChatHeader";
import Composer, { ComposerHandle, PendingFile } from "./chat/Composer";
import EmptyState from "./chat/EmptyState";
import VoiceMode from "./chat/VoiceMode";
import MessageItem from "./chat/MessageItem";
import { useSettings } from "./providers/settings";
import { useToast } from "./providers/toast";
import { RenameDialog, useConfirm } from "./ui/dialogs";
import { useMediaQuery } from "./ui/primitives";

type Mode = "send" | "edit" | "regenerate";

interface TurnOptions {
  /** Streams the reply text as it grows */
  onDelta?: (content: string) => void;
  /** Reply for speech: no Markdown, tables or emojis */
  voice?: boolean;
  /** Generate an image instead of a text reply */
  image?: boolean;
}

const SIDEBAR_KEY = "iris-sidebar-collapsed";

const sortChats = (list: ChatSummary[]) =>
  [...list].sort(
    (a, b) =>
      Number(b.pinned) - Number(a.pinned) ||
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

const newId = () => crypto.randomUUID();

// Keeps the URL in sync without a Next.js navigation round-trip
const setUrl = (chatId: string | null, replace = false) => {
  const url = chatId ? `/?chatId=${chatId}` : "/";
  if (window.location.pathname + window.location.search === url) return;
  window.history[replace ? "replaceState" : "pushState"](null, "", url);
};

export default function ChatApp() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlChatId = searchParams.get("chatId");
  const { data: session, status } = useSession();
  const { settings, update, resolvedTheme } = useSettings();
  const toast = useToast();
  const { confirm, element: confirmElement } = useConfirm();
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingChat, setLoadingChat] = useState(false);
  const [loadedTitle, setLoadedTitle] = useState<string | null>(null);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [chatsLoading, setChatsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [temporary, setTemporary] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("general");
  const [renameOpen, setRenameOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [showJump, setShowJump] = useState(false);

  const composerRef = useRef<ComposerHandle>(null);
  const sidebarSearchRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  const loadedChatId = useRef<string | null>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const generatingRef = useRef(false);
  const temporaryRef = useRef(temporary);
  temporaryRef.current = temporary;

  // ---------- Auth ----------
  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  // ---------- Chat list ----------
  const fetchChats = useCallback(async () => {
    try {
      const res = await fetch("/api/chat");
      if (res.ok) setChats(sortChats(await res.json()));
    } catch {
      /* offline; keep what we have */
    } finally {
      setChatsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") fetchChats();
  }, [status, fetchChats]);

  const patchChat = (id: string, patch: Partial<ChatSummary>) =>
    setChats((prev) => sortChats(prev.map((c) => (c._id === id ? { ...c, ...patch } : c))));

  // ---------- Navigation ----------
  const stop = useCallback(() => abortRef.current?.abort(), []);

  const resetToNewChat = useCallback(() => {
    stop();
    loadedChatId.current = null;
    setChatId(null);
    setMessages([]);
    setLoadedTitle(null);
    setLoadingChat(false);
  }, [stop]);

  const newChat = useCallback(
    (opts?: { temporary?: boolean }) => {
      resetToNewChat();
      setTemporary(!!opts?.temporary);
      setUrl(null);
      requestAnimationFrame(() => composerRef.current?.focus());
    },
    [resetToNewChat]
  );

  const selectChat = useCallback((id: string) => {
    setUrl(id);
  }, []);

  // Load whichever chat the URL points at (also handles back/forward)
  useEffect(() => {
    if (status !== "authenticated") return;
    if (!urlChatId) {
      if (loadedChatId.current) resetToNewChat();
      return;
    }
    if (urlChatId === loadedChatId.current) return;

    stop();
    loadedChatId.current = urlChatId;
    setChatId(urlChatId);
    setTemporary(false);
    setMessages([]);
    setLoadingChat(true);
    const ctrl = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/api/chat?chatId=${urlChatId}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error(res.status === 404 ? "Chat not found" : "Couldn't load chat");
        const data = await res.json();
        if (loadedChatId.current !== urlChatId) return;
        stickToBottom.current = true;
        setLoadedTitle(data.title);
        setMessages(
          (data.messages as Message[]).map((m, i) => ({ ...m, id: `${urlChatId}-${i}` }))
        );
      } catch (err: any) {
        if (err.name === "AbortError") return;
        toast(err.message || "Couldn't load chat", { kind: "error" });
        loadedChatId.current = null;
        setChatId(null);
        setUrl(null, true);
      } finally {
        if (!ctrl.signal.aborted) setLoadingChat(false);
      }
    })();
    return () => ctrl.abort();
  }, [urlChatId, status, stop, resetToNewChat, toast]);

  // ---------- Scrolling ----------
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    stickToBottom.current = near;
    setShowJump(!near);
  };

  const jumpToBottom = () => {
    stickToBottom.current = true;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  };

  // ---------- Sending ----------
  const runTurn = useCallback(
    async (
      mode: Mode,
      text: string,
      files: PendingFile[],
      index = -1,
      opts: TurnOptions = {}
    ): Promise<string | null> => {
      const { onDelta } = opts;
      if (generatingRef.current) return null;

      // Failed replies were never saved; drop them so indexes match the server
      const base = messagesRef.current.filter((m) => !m.error);
      const isTemp = temporaryRef.current;
      const assistantId = newId();
      const assistant: Message = {
        id: assistantId,
        role: "assistant",
        content: "",
        pending: true,
        model: settings.model,
      };

      let next: Message[];
      let userId: string | null = null;
      let historyForTemp: Message[] = [];
      if (mode === "send") {
        userId = newId();
        const attachments: Attachment[] = files.map((f) => ({
          name: f.file.name,
          size: f.file.size,
          type: f.file.type,
          previewUrl: f.previewUrl,
        }));
        next = [...base, { id: userId, role: "user", content: text, attachments }, assistant];
        historyForTemp = base;
      } else if (mode === "edit") {
        const original = base[index];
        userId = newId();
        next = [
          ...base.slice(0, index),
          { ...original, id: userId, content: text },
          assistant,
        ];
        historyForTemp = base.slice(0, index);
      } else {
        index = Math.min(index, base.length);
        next = [...base.slice(0, index), assistant];
        historyForTemp = base.slice(0, index);
      }

      const form = new FormData();
      form.append("prompt", text);
      form.append("mode", mode);
      form.append("editIndex", String(index));
      form.append("model", settings.model);
      form.append("temporary", String(isTemp));
      if (opts.voice) form.append("voice", "true");
      // Regenerating an image reply draws a new image
      const regeneratingImage = mode === "regenerate" && !!base[index]?.images?.length;
      if (opts.image || regeneratingImage) form.append("image", "true");
      if (!isTemp && loadedChatId.current) form.append("chatId", loadedChatId.current);
      if (isTemp) {
        form.append(
          "history",
          JSON.stringify(
            historyForTemp.map((m) => ({
              role: m.role,
              content: m.content,
              attachments: m.attachments?.map((a) => ({ name: a.name, type: a.type, content: a.content })),
              images: m.images?.map((im) => ({ prompt: im.prompt })),
            }))
          )
        );
        // Editing in a temporary chat resends the original attachment text
        const original = mode === "edit" ? base[index] : null;
        if (original?.attachments?.length) {
          form.append(
            "editAttachments",
            JSON.stringify(
              original.attachments.map((a) => ({ name: a.name, size: a.size, type: a.type, content: a.content }))
            )
          );
        }
      }
      for (const f of files) form.append("files", f.file, f.file.name);

      const patchAssistant = (patch: Partial<Message>) =>
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, ...patch } : m)));

      generatingRef.current = true;
      setIsGenerating(true);
      stickToBottom.current = true;
      setMessages(next);

      const ctrl = new AbortController();
      abortRef.current = ctrl;
      let content = "";
      let reasoning = "";
      let flushTimer: ReturnType<typeof setTimeout> | null = null;
      const flush = () => {
        flushTimer = null;
        patchAssistant({ content, reasoning: reasoning || undefined });
      };
      const schedule = () => {
        if (!flushTimer) flushTimer = setTimeout(flush, 32);
      };

      try {
        const res = await fetch("/api/chat", { method: "POST", body: form, signal: ctrl.signal });

        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => ({}));
          const error =
            res.status === 413
              ? "Those files are too large to upload. Try smaller files."
              : data.error || "Couldn't send your message.";
          if (mode === "send") {
            // Nothing was saved: restore the draft so it isn't lost
            setMessages(base);
            composerRef.current?.setText(text);
            if (files.length) composerRef.current?.addFiles(files.map((f) => f.file));
            toast(error, { kind: "error" });
          } else {
            patchAssistant({ pending: false, error });
          }
          return null;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let streamError: string | null = null;

        const handle = (ev: any) => {
          switch (ev.t) {
            case "meta": {
              if (ev.chatId && loadedChatId.current !== ev.chatId) {
                loadedChatId.current = ev.chatId;
                setChatId(ev.chatId);
                setUrl(ev.chatId, true);
                const now = new Date().toISOString();
                const title = (text || files[0]?.file.name || "New chat").slice(0, 60);
                setLoadedTitle(title);
                setChats((prev) =>
                  sortChats([{ _id: ev.chatId, title, pinned: false, createdAt: now, updatedAt: now }, ...prev])
                );
              }
              if (userId && ev.userAttachments?.length) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === userId
                      ? {
                          ...m,
                          attachments: ev.userAttachments.map((a: Attachment, i: number) => ({
                            ...a,
                            previewUrl: m.attachments?.[i]?.previewUrl,
                          })),
                        }
                      : m
                  )
                );
              }
              break;
            }
            case "status":
              patchAssistant({ status: ev.d });
              break;
            case "image":
              patchAssistant({ images: ev.images, status: undefined });
              break;
            case "reasoning":
              reasoning += ev.d;
              schedule();
              break;
            case "delta":
              content += ev.d;
              schedule();
              onDelta?.(content);
              break;
            case "title":
              if (loadedChatId.current) {
                patchChat(loadedChatId.current, { title: ev.title });
                setLoadedTitle(ev.title);
              }
              break;
            case "memory":
              patchAssistant({ memoriesAdded: ev.added });
              toast("Memory updated", { icon: <LuBrain size={16} /> });
              break;
            case "error":
              streamError = ev.error;
              break;
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (line) {
              try {
                handle(JSON.parse(line));
              } catch {
                /* ignore malformed line */
              }
            }
          }
        }

        if (flushTimer) clearTimeout(flushTimer);
        patchAssistant({
          content,
          reasoning: reasoning || undefined,
          pending: false,
          error: streamError || (!content ? "Iris returned an empty response. Try again." : undefined),
        });
        return streamError ? null : content || null;
      } catch (err: any) {
        if (flushTimer) clearTimeout(flushTimer);
        if (err?.name === "AbortError") {
          patchAssistant({ content, reasoning: reasoning || undefined, pending: false, interrupted: true });
        } else {
          patchAssistant({
            content,
            pending: false,
            error: "Connection lost. Check your network and try again.",
          });
        }
        return null;
      } finally {
        generatingRef.current = false;
        setIsGenerating(false);
        if (abortRef.current === ctrl) abortRef.current = null;
        if (!isTemp && loadedChatId.current) {
          patchChat(loadedChatId.current, { updatedAt: new Date().toISOString() });
        }
      }
    },
    [settings.model, toast]
  );

  const onSend = (text: string, files: PendingFile[], options?: { image?: boolean }) =>
    runTurn("send", text, files, -1, { image: options?.image });
  const askByVoice = useCallback(
    (text: string, onDelta: (content: string) => void) => runTurn("send", text, [], -1, { onDelta, voice: true }),
    [runTurn]
  );
  const onEdit = useCallback((i: number, text: string) => runTurn("edit", text, [], i), [runTurn]);
  const onRegenerate = useCallback((i: number) => runTurn("regenerate", "", [], i), [runTurn]);

  // ---------- Chat operations ----------
  const renameChat = async (id: string, title: string) => {
    const prev = chats.find((c) => c._id === id)?.title;
    patchChat(id, { title });
    if (id === chatId) setLoadedTitle(title);
    const res = await fetch(`/api/chat/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    }).catch(() => null);
    if (!res?.ok) {
      if (prev) patchChat(id, { title: prev });
      toast("Couldn't rename chat", { kind: "error" });
    }
  };

  const togglePin = async (c: ChatSummary) => {
    patchChat(c._id, { pinned: !c.pinned });
    const res = await fetch(`/api/chat/${c._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: !c.pinned }),
    }).catch(() => null);
    if (res?.ok) toast(c.pinned ? "Unpinned" : "Pinned to top");
    else {
      patchChat(c._id, { pinned: c.pinned });
      toast("Couldn't update pin", { kind: "error" });
    }
  };

  const deleteChat = async (c: ChatSummary) => {
    const ok = await confirm({
      title: "Delete chat?",
      body: `“${c.title}” will be permanently deleted.`,
      action: "Delete",
    });
    if (!ok) return;
    const res = await fetch(`/api/chat/${c._id}/delete`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      toast("Couldn't delete chat", { kind: "error" });
      return;
    }
    setChats((prev) => prev.filter((x) => x._id !== c._id));
    if (c._id === chatId) newChat();
    toast("Chat deleted");
  };

  const currentSummary = chats.find((c) => c._id === chatId) ?? null;
  const title = currentSummary?.title ?? (chatId ? loadedTitle : null);

  const exportMarkdown = () => {
    const md =
      `# ${title || "Chat"}\n\n` +
      messages
        .map((m) => {
          const files = m.attachments?.length
            ? m.attachments.map((a) => `> 📎 ${a.name}`).join("\n") + "\n\n"
            : "";
          return `### ${m.role === "user" ? "You" : "Iris"}\n\n${files}${m.content}`;
        })
        .join("\n\n---\n\n");
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(title || "chat").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "chat"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyLink = async () => {
    if (!chatId) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/?chatId=${chatId}`);
      toast("Link copied");
    } catch {
      toast("Couldn't copy link", { kind: "error" });
    }
  };

  const toggleSidebar = useCallback(() => {
    if (window.matchMedia("(min-width: 1024px)").matches) {
      setCollapsed((c) => {
        try {
          localStorage.setItem(SIDEBAR_KEY, c ? "0" : "1");
        } catch {}
        return !c;
      });
    } else {
      setMobileOpen((o) => !o);
    }
  }, []);

  const openSettings = useCallback((tab: string = "general") => {
    setSettingsTab(tab as SettingsTab);
    setSettingsOpen(true);
  }, []);

  const toggleTheme = useCallback(
    () => update({ theme: resolvedTheme === "dark" ? "light" : "dark" }),
    [update, resolvedTheme]
  );

  const logout = () => signOut({ callbackUrl: "/login" });

  // ---------- Keyboard shortcuts ----------
  const dialogOpen = paletteOpen || settingsOpen || renameOpen || voiceOpen;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (mod && key === "k") {
        e.preventDefault();
        // Focus the sidebar search when it's visible; a second press opens the palette
        const input = sidebarSearchRef.current;
        if (input && isDesktop && !collapsed && !paletteOpen && document.activeElement !== input) {
          input.focus();
          input.select();
        } else {
          setPaletteOpen((o) => !o);
        }
      } else if (mod && e.shiftKey && key === "o") {
        e.preventDefault();
        newChat();
      } else if (mod && !e.shiftKey && key === "b") {
        e.preventDefault();
        toggleSidebar();
      } else if (mod && key === ",") {
        e.preventDefault();
        openSettings("general");
      } else if (mod && key === "/") {
        e.preventDefault();
        openSettings("shortcuts");
      } else if (e.key === "Escape" && generatingRef.current && !dialogOpen) {
        stop();
      } else if (e.key === "/" && !mod && !dialogOpen) {
        const t = e.target as HTMLElement;
        if (!t.closest("input, textarea, [contenteditable]")) {
          e.preventDefault();
          composerRef.current?.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [newChat, toggleSidebar, openSettings, stop, dialogOpen, isDesktop, collapsed, paletteOpen]);

  // ---------- Drag & drop ----------
  const dragDepth = useRef(0);
  const dropHandlers = {
    onDragEnter: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      dragDepth.current++;
      setDragging(true);
    },
    onDragOver: (e: React.DragEvent) => {
      if (e.dataTransfer.types.includes("Files")) e.preventDefault();
    },
    onDragLeave: () => {
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      if (e.dataTransfer.files.length) composerRef.current?.addFiles(e.dataTransfer.files);
    },
  };

  if (status !== "authenticated") return <Splash />;

  const firstName = (session?.user?.name || "there").trim().split(/\s+/)[0];
  const hasMessages = messages.length > 0;
  const showEmpty = !hasMessages && !loadingChat;
  const lastIndex = messages.length - 1;

  const composer = (
    <Composer
      ref={composerRef}
      onSend={onSend}
      onStop={stop}
      onVoiceMode={() => setVoiceOpen(true)}
      isGenerating={isGenerating}
      autoFocus
      placeholder={temporary ? "Message Iris (temporary)" : hasMessages ? "Reply to Iris" : "Ask anything"}
    />
  );

  return (
    <div className="flex h-dvh overflow-hidden bg-bg text-fg">
      <Sidebar
        chats={chats}
        chatsLoading={chatsLoading}
        activeChatId={chatId}
        session={session}
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        isDesktop={isDesktop}
        onToggleCollapsed={toggleSidebar}
        onCloseMobile={() => setMobileOpen(false)}
        onNewChat={() => newChat()}
        onSelectChat={selectChat}
        onRename={renameChat}
        onTogglePin={togglePin}
        onDelete={deleteChat}
        onOpenSearch={() => setPaletteOpen(true)}
        searchInputRef={sidebarSearchRef}
        onOpenSettings={openSettings}
        onLogout={logout}
      />

      <div className="relative flex min-w-0 flex-1 flex-col" {...dropHandlers}>
        <ChatHeader
          title={title}
          pinned={!!currentSummary?.pinned}
          temporary={temporary}
          hasMessages={hasMessages}
          isDesktop={isDesktop}
          sidebarCollapsed={collapsed}
          isDark={resolvedTheme === "dark"}
          onOpenSidebar={toggleSidebar}
          onNewChat={() => newChat()}
          onToggleTemporary={() => setTemporary((t) => !t)}
          onToggleTheme={toggleTheme}
          onRename={() => setRenameOpen(true)}
          onTogglePin={() => currentSummary && togglePin(currentSummary)}
          onExport={exportMarkdown}
          onCopyLink={copyLink}
          onDelete={() => currentSummary && deleteChat(currentSummary)}
        />

        <main ref={scrollRef} onScroll={onScroll} className="relative min-h-0 flex-1 overflow-y-auto">
          {showEmpty ? (
            <EmptyState
              firstName={firstName}
              temporary={temporary}
              onPick={(p) => composerRef.current?.setText(p)}
              onAttach={() => composerRef.current?.openFilePicker()}
            >
              {composer}
            </EmptyState>
          ) : loadingChat ? (
            <div className="mx-auto w-full max-w-[var(--chat-width)] space-y-8 px-4 py-10 sm:px-6" aria-label="Loading conversation">
              <div className="ml-auto h-10 w-1/2 animate-pulse rounded-3xl bg-surface-2" />
              <div className="space-y-2.5">
                {[92, 84, 88, 60].map((w, i) => (
                  <div key={i} className="h-4 animate-pulse rounded bg-surface-2" style={{ width: `${w}%` }} />
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto w-full max-w-[var(--chat-width)] space-y-8 px-4 pb-10 pt-6 sm:px-6">
              {messages.map((m, i) => (
                <MessageItem
                  key={m.id ?? i}
                  message={m}
                  index={i}
                  isLast={i === lastIndex}
                  isGenerating={isGenerating}
                  showReasoning={settings.showReasoning}
                  onEdit={onEdit}
                  onRegenerate={onRegenerate}
                  onOpenMemory={() => openSettings("memory")}
                />
              ))}
            </div>
          )}
        </main>

        {!showEmpty && (
          <div className="relative shrink-0 px-3 pb-3 sm:px-6">
            <div className="pointer-events-none absolute inset-x-0 -top-8 h-8 bg-gradient-to-t from-bg to-transparent" />
            {showJump && hasMessages && (
              <button
                type="button"
                onClick={jumpToBottom}
                aria-label="Scroll to bottom"
                className="animate-fade-in absolute -top-12 left-1/2 z-10 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-line-strong bg-elevated text-fg-muted shadow-pop hover:text-fg"
              >
                <LuArrowDown size={17} />
              </button>
            )}
            <div className="mx-auto w-full max-w-[var(--chat-width)]">
              {composer}
              <p className="mt-2 text-center text-xs text-fg-subtle">
                {temporary
                  ? "Temporary chat · not saved to history · memory off"
                  : "Iris can make mistakes. Check important info."}
              </p>
            </div>
          </div>
        )}

        {dragging && (
          <div className="animate-fade-in pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-bg/80 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-accent/60 px-16 py-12 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/15 text-accent">
                <LuUpload size={22} />
              </span>
              <div className="text-base font-semibold text-fg">Drop files to attach</div>
              <div className="text-sm text-fg-muted">Any file type · up to 5 files · 10 MB each</div>
            </div>
          </div>
        )}
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        chats={chats}
        onSelectChat={selectChat}
        onNewChat={() => newChat()}
        onTemporaryChat={() => newChat({ temporary: true })}
        onOpenSettings={openSettings}
        onToggleSidebar={toggleSidebar}
        onToggleTheme={toggleTheme}
        isDark={resolvedTheme === "dark"}
      />

      <SettingsDialog
        open={settingsOpen}
        tab={settingsTab}
        onTabChange={setSettingsTab}
        onClose={() => setSettingsOpen(false)}
        session={session}
        onLogout={logout}
        onAllChatsDeleted={() => {
          setChats([]);
          newChat();
        }}
        confirm={confirm}
      />

      <RenameDialog
        open={renameOpen}
        initial={title || ""}
        onClose={() => setRenameOpen(false)}
        onSave={(t) => chatId && renameChat(chatId, t)}
      />

      <VoiceMode open={voiceOpen} onClose={() => setVoiceOpen(false)} ask={askByVoice} />

      {confirmElement}
    </div>
  );
}
