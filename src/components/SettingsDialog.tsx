"use client";

import React, { useEffect, useState } from "react";
import type { Session } from "next-auth";
import {
  LuBrain,
  LuCheck,
  LuDatabase,
  LuDownload,
  LuKeyboard,
  LuLogOut,
  LuMonitor,
  LuMoon,
  LuPencil,
  LuPlus,
  LuSettings,
  LuSun,
  LuTrash2,
  LuUser,
  LuUserPen,
  LuX,
} from "react-icons/lu";
import type { Memory } from "../types/chat";
import { ACCENTS, FontSize, ThemeMode, useSettings } from "./providers/settings";
import { useToast } from "./providers/toast";
import { Avatar } from "./ui/brand";
import { Button, cn, Dialog, IconButton, Shortcut, Switch } from "./ui/primitives";

export type SettingsTab = "general" | "personalization" | "memory" | "data" | "shortcuts" | "account";

const TABS: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  { id: "general", label: "General", icon: <LuSettings size={16} /> },
  { id: "personalization", label: "Personalization", icon: <LuUserPen size={16} /> },
  { id: "memory", label: "Memory", icon: <LuBrain size={16} /> },
  { id: "data", label: "Data controls", icon: <LuDatabase size={16} /> },
  { id: "shortcuts", label: "Shortcuts", icon: <LuKeyboard size={16} /> },
  { id: "account", label: "Account", icon: <LuUser size={16} /> },
];

interface Prefs {
  aboutYou: string;
  responseStyle: string;
  memoryEnabled: boolean;
  memoryAutoSave: boolean;
}

interface SettingsDialogProps {
  open: boolean;
  tab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
  onClose: () => void;
  session: Session | null;
  onLogout: () => void;
  onAllChatsDeleted: () => void;
  confirm: (opts: { title: string; body: string; action: string }) => Promise<boolean>;
}

function Row({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-line py-4 last:border-b-0">
      <div className="min-w-0">
        <div className="text-sm font-medium text-fg">{title}</div>
        {description && <div className="mt-0.5 text-[13px] leading-5 text-fg-subtle">{description}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { id: T; label: string; icon?: React.ReactNode }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-xl border border-line bg-surface p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-[10px] px-3 text-[13px] font-medium transition-colors",
            value === o.id ? "bg-elevated text-fg shadow-sm ring-1 ring-line" : "text-fg-muted hover:text-fg"
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

function GeneralTab() {
  const { settings, update } = useSettings();
  return (
    <div>
      <Row title="Theme" description="Match your system or pick a mode.">
        <Segmented<ThemeMode>
          value={settings.theme}
          onChange={(theme) => update({ theme })}
          options={[
            { id: "light", label: "Light", icon: <LuSun size={14} /> },
            { id: "dark", label: "Dark", icon: <LuMoon size={14} /> },
            { id: "system", label: "Auto", icon: <LuMonitor size={14} /> },
          ]}
        />
      </Row>
      <Row title="Accent color" description="Used for buttons, highlights and links.">
        <div className="flex gap-2">
          {ACCENTS.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => update({ accent: a.id })}
              aria-label={a.label}
              title={a.label}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full ring-offset-2 ring-offset-elevated transition-shadow",
                settings.accent === a.id ? "ring-2 ring-fg/60" : "hover:ring-2 hover:ring-line-strong"
              )}
              style={{ background: a.swatch }}
            >
              {settings.accent === a.id && <LuCheck size={14} className="text-white drop-shadow" />}
            </button>
          ))}
        </div>
      </Row>
      <Row title="Text size" description="Size of messages in conversations.">
        <Segmented<FontSize>
          value={settings.fontSize}
          onChange={(fontSize) => update({ fontSize })}
          options={[
            { id: "sm", label: "Small" },
            { id: "md", label: "Default" },
            { id: "lg", label: "Large" },
          ]}
        />
      </Row>
      <Row title="Wide layout" description="Use more of the screen for conversations.">
        <Switch label="Wide layout" checked={settings.wide} onChange={(wide) => update({ wide })} />
      </Row>
      <Row title="Enter to send" description="When off, press Ctrl/⌘ + Enter to send.">
        <Switch label="Enter to send" checked={settings.sendOnEnter} onChange={(sendOnEnter) => update({ sendOnEnter })} />
      </Row>
      <Row title="Show thought process" description="Display the model's reasoning when available.">
        <Switch label="Show thought process" checked={settings.showReasoning} onChange={(showReasoning) => update({ showReasoning })} />
      </Row>
    </div>
  );
}

function usePrefs(open: boolean) {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  useEffect(() => {
    if (!open) return;
    fetch("/api/user/preferences")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setPrefs(d.preferences))
      .catch(() => {});
  }, [open]);

  const save = async (patch: Partial<Prefs>) => {
    setPrefs((p) => (p ? { ...p, ...patch } : p));
    const res = await fetch("/api/user/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error("Failed to save");
  };
  return { prefs, save };
}

function PersonalizationTab({ prefs, save }: { prefs: Prefs | null; save: (p: Partial<Prefs>) => Promise<void> }) {
  const toast = useToast();
  const [about, setAbout] = useState("");
  const [style, setStyle] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (prefs) {
      setAbout(prefs.aboutYou);
      setStyle(prefs.responseStyle);
    }
  }, [prefs]);

  const dirty = prefs && (about !== prefs.aboutYou || style !== prefs.responseStyle);

  const field = (label: string, hint: string, value: string, set: (v: string) => void, placeholder: string) => (
    <label className="block">
      <span className="text-sm font-medium text-fg">{label}</span>
      <span className="mt-0.5 block text-[13px] text-fg-subtle">{hint}</span>
      <textarea
        value={value}
        onChange={(e) => set(e.target.value.slice(0, 1500))}
        rows={4}
        placeholder={placeholder}
        disabled={!prefs}
        className="mt-2 block w-full resize-none rounded-xl border border-line bg-surface px-3.5 py-3 text-sm leading-6 text-fg outline-none placeholder:text-fg-subtle focus:border-accent/60"
      />
      <span className="mt-1 block text-right text-xs text-fg-subtle">{value.length}/1500</span>
    </label>
  );

  return (
    <div className="space-y-5 py-2">
      {field(
        "What should Iris know about you?",
        "Your role, interests, or context that helps Iris give better answers.",
        about,
        setAbout,
        "e.g. I'm a frontend developer in Chennai learning Rust. I prefer metric units."
      )}
      {field(
        "How should Iris respond?",
        "Tone, format, length, or anything Iris should always do.",
        style,
        setStyle,
        "e.g. Be concise. Use bullet points. Show code in TypeScript by default."
      )}
      <div className="flex justify-end gap-2">
        <Button
          variant="ghost"
          disabled={!dirty}
          onClick={() => {
            setAbout(prefs?.aboutYou || "");
            setStyle(prefs?.responseStyle || "");
          }}
        >
          Reset
        </Button>
        <Button
          variant="primary"
          disabled={!dirty || saving}
          onClick={async () => {
            setSaving(true);
            try {
              await save({ aboutYou: about, responseStyle: style });
              toast("Personalization saved");
            } catch {
              toast("Couldn't save. Try again.", { kind: "error" });
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}

function MemoryTab({
  open,
  prefs,
  save,
  confirm,
}: {
  open: boolean;
  prefs: Prefs | null;
  save: (p: Partial<Prefs>) => Promise<void>;
  confirm: SettingsDialogProps["confirm"];
}) {
  const toast = useToast();
  const [memories, setMemories] = useState<Memory[] | null>(null);
  const [draft, setDraft] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  useEffect(() => {
    if (!open) return;
    fetch("/api/memory")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setMemories(Array.isArray(d) ? d : []))
      .catch(() => setMemories([]));
  }, [open]);

  const add = async () => {
    const content = draft.trim();
    if (!content) return;
    const res = await fetch("/api/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (res.ok) {
      const m = await res.json();
      setMemories((prev) => [m, ...(prev || [])]);
      setDraft("");
    } else toast("Couldn't add memory", { kind: "error" });
  };

  const saveEdit = async (id: string) => {
    const content = editText.trim();
    setEditId(null);
    if (!content) return;
    const res = await fetch(`/api/memory/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (res.ok) setMemories((prev) => prev?.map((m) => (m._id === id ? { ...m, content } : m)) ?? null);
    else toast("Couldn't update memory", { kind: "error" });
  };

  const remove = async (id: string) => {
    setMemories((prev) => prev?.filter((m) => m._id !== id) ?? null);
    const res = await fetch(`/api/memory/${id}`, { method: "DELETE" });
    if (!res.ok) toast("Couldn't delete memory", { kind: "error" });
  };

  const clearAll = async () => {
    const ok = await confirm({
      title: "Forget everything?",
      body: "Iris will permanently delete all saved memories. This can't be undone.",
      action: "Forget all",
    });
    if (!ok) return;
    const res = await fetch("/api/memory", { method: "DELETE" });
    if (res.ok) {
      setMemories([]);
      toast("All memories cleared");
    }
  };

  const toggle = (key: "memoryEnabled" | "memoryAutoSave") => async (v: boolean) => {
    try {
      await save({ [key]: v });
    } catch {
      toast("Couldn't save setting", { kind: "error" });
    }
  };

  return (
    <div>
      <Row title="Reference saved memories" description="Iris uses what it remembers to personalize replies.">
        <Switch label="Reference saved memories" checked={!!prefs?.memoryEnabled} disabled={!prefs} onChange={toggle("memoryEnabled")} />
      </Row>
      <Row title="Remember new things automatically" description="Iris saves useful facts and preferences you share in chats.">
        <Switch
          label="Remember automatically"
          checked={!!prefs?.memoryAutoSave}
          disabled={!prefs || !prefs.memoryEnabled}
          onChange={toggle("memoryAutoSave")}
        />
      </Row>

      <div className="pt-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium text-fg">
            Saved memories {memories && memories.length > 0 && <span className="text-fg-subtle">· {memories.length}</span>}
          </h3>
          {!!memories?.length && (
            <Button variant="ghost" className="h-8 text-danger hover:text-danger" onClick={clearAll}>
              Forget all
            </Button>
          )}
        </div>

        <form
          className="mb-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={500}
            placeholder="Add something for Iris to remember…"
            className="h-10 flex-1 rounded-xl border border-line bg-surface px-3.5 text-sm text-fg outline-none placeholder:text-fg-subtle focus:border-accent/60"
          />
          <Button type="submit" variant="primary" className="h-10" disabled={!draft.trim()}>
            <LuPlus size={16} /> Add
          </Button>
        </form>

        <div className="overflow-hidden rounded-xl border border-line">
          {memories === null ? (
            <div className="space-y-2 p-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-5 animate-pulse rounded bg-surface-2" />
              ))}
            </div>
          ) : memories.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
              <LuBrain size={22} className="text-fg-subtle" />
              <div className="text-sm text-fg-muted">No memories yet</div>
              <div className="max-w-xs text-[13px] text-fg-subtle">
                Tell Iris about yourself in a chat — for example, “Remember that I prefer Python.”
              </div>
            </div>
          ) : (
            <ul className="max-h-[320px] divide-y divide-line overflow-y-auto">
              {memories.map((m) => (
                <li key={m._id} className="group/mem flex items-start gap-3 px-3.5 py-3">
                  {editId === m._id ? (
                    <input
                      autoFocus
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onBlur={() => saveEdit(m._id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEdit(m._id);
                        if (e.key === "Escape") {
                          e.stopPropagation();
                          setEditId(null);
                        }
                      }}
                      maxLength={500}
                      className="h-8 flex-1 rounded-lg border border-accent/60 bg-elevated px-2.5 text-sm text-fg outline-none"
                    />
                  ) : (
                    <div className="min-w-0 flex-1">
                      <div className="text-sm leading-6 text-fg">{m.content}</div>
                      <div className="text-xs text-fg-subtle">
                        {m.source === "auto" ? "Learned from chat" : "Added by you"} ·{" "}
                        {new Date(m.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </div>
                    </div>
                  )}
                  {editId !== m._id && (
                    <div className="flex shrink-0 gap-0.5 md:opacity-0 md:group-hover/mem:opacity-100">
                      <IconButton
                        size="sm"
                        aria-label="Edit memory"
                        onClick={() => {
                          setEditId(m._id);
                          setEditText(m.content);
                        }}
                      >
                        <LuPencil size={14} />
                      </IconButton>
                      <IconButton size="sm" aria-label="Delete memory" onClick={() => remove(m._id)} className="hover:text-danger">
                        <LuTrash2 size={14} />
                      </IconButton>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="mt-3 text-xs text-fg-subtle">Memories aren&rsquo;t used or created in temporary chats.</p>
      </div>
    </div>
  );
}

function DataTab({ confirm, onAllChatsDeleted }: Pick<SettingsDialogProps, "confirm" | "onAllChatsDeleted">) {
  const toast = useToast();
  return (
    <div>
      <Row title="Export chats" description="Download all your conversations as a JSON file.">
        <a href="/api/chat/export" download>
          <Button>
            <LuDownload size={15} /> Export
          </Button>
        </a>
      </Row>
      <Row title="Delete all chats" description="Permanently remove every conversation. Memories are kept.">
        <Button
          variant="danger"
          onClick={async () => {
            const ok = await confirm({
              title: "Delete all chats?",
              body: "This permanently deletes your entire chat history. This can't be undone.",
              action: "Delete all",
            });
            if (!ok) return;
            const res = await fetch("/api/chat", { method: "DELETE" });
            if (res.ok) {
              onAllChatsDeleted();
              toast("All chats deleted");
            } else toast("Couldn't delete chats", { kind: "error" });
          }}
        >
          <LuTrash2 size={15} /> Delete all
        </Button>
      </Row>
    </div>
  );
}

const SHORTCUTS: { label: string; keys: string[] }[] = [
  { label: "Search chats & commands", keys: ["mod", "K"] },
  { label: "New chat", keys: ["mod", "shift", "O"] },
  { label: "Toggle sidebar", keys: ["mod", "B"] },
  { label: "Open settings", keys: ["mod", ","] },
  { label: "Keyboard shortcuts", keys: ["mod", "/"] },
  { label: "Focus message box", keys: ["/"] },
  { label: "Stop generating", keys: ["Esc"] },
  { label: "Send message", keys: ["↵"] },
  { label: "New line", keys: ["shift", "↵"] },
];

function ShortcutsTab() {
  return (
    <div className="py-1">
      {SHORTCUTS.map((s) => (
        <div key={s.label} className="flex items-center justify-between border-b border-line py-3 last:border-b-0">
          <span className="text-sm text-fg">{s.label}</span>
          <Shortcut keys={s.keys} />
        </div>
      ))}
    </div>
  );
}

function AccountTab({ session, onLogout }: Pick<SettingsDialogProps, "session" | "onLogout">) {
  return (
    <div>
      <div className="flex items-center gap-4 border-b border-line py-5">
        <Avatar name={session?.user?.name} image={session?.user?.image} size={52} />
        <div className="min-w-0">
          <div className="truncate text-base font-semibold text-fg">{session?.user?.name || "You"}</div>
          <div className="truncate text-sm text-fg-subtle">{session?.user?.email}</div>
        </div>
      </div>
      <Row title="Log out" description="Sign out of Iris on this device.">
        <Button onClick={onLogout}>
          <LuLogOut size={15} /> Log out
        </Button>
      </Row>
    </div>
  );
}

export default function SettingsDialog(props: SettingsDialogProps) {
  const { open, tab, onTabChange, onClose } = props;
  const { prefs, save } = usePrefs(open);
  const current = TABS.find((t) => t.id === tab) ?? TABS[0];

  return (
    <Dialog open={open} onClose={onClose} label="Settings" className="flex h-[min(640px,88dvh)] max-w-[820px] flex-col md:flex-row">
      <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-line p-2 scroll-hidden md:w-[210px] md:flex-col md:overflow-visible md:border-b-0 md:border-r md:bg-surface/50 md:p-3">
        <div className="hidden px-2.5 pb-3 pt-1 text-base font-semibold md:block">Settings</div>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onTabChange(t.id)}
            className={cn(
              "flex h-9 shrink-0 items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors",
              tab === t.id ? "bg-surface-2 font-medium text-fg" : "text-fg-muted hover:bg-surface-2/60 hover:text-fg"
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </nav>
      <section className="flex min-h-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-line pl-6 pr-3">
          <h2 className="text-base font-semibold">{current.label}</h2>
          <IconButton onClick={onClose} aria-label="Close settings">
            <LuX size={18} />
          </IconButton>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-2">
          {tab === "general" && <GeneralTab />}
          {tab === "personalization" && <PersonalizationTab prefs={prefs} save={save} />}
          {tab === "memory" && <MemoryTab open={open} prefs={prefs} save={save} confirm={props.confirm} />}
          {tab === "data" && <DataTab confirm={props.confirm} onAllChatsDeleted={props.onAllChatsDeleted} />}
          {tab === "shortcuts" && <ShortcutsTab />}
          {tab === "account" && <AccountTab session={props.session} onLogout={props.onLogout} />}
        </div>
      </section>
    </Dialog>
  );
}
