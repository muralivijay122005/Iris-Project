"use client";

import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { LuArrowUp, LuCheck, LuChevronDown, LuPaperclip, LuSquare } from "react-icons/lu";
import { MODELS, modelLabel } from "../../lib/models";
import { useSettings } from "../providers/settings";
import { useToast } from "../providers/toast";
import { AttachmentChip } from "./AttachmentChip";
import { cn, IconButton, Portal, Tooltip, useIsMac } from "../ui/primitives";

export const MAX_FILES = 5;
export const MAX_FILE_MB = 10;

export interface PendingFile {
  id: string;
  file: File;
  previewUrl?: string;
}

export interface ComposerHandle {
  focus: () => void;
  setText: (text: string) => void;
  addFiles: (files: FileList | File[]) => void;
  openFilePicker: () => void;
}

interface ComposerProps {
  onSend: (text: string, files: PendingFile[]) => void;
  onStop: () => void;
  isGenerating: boolean;
  placeholder?: string;
  autoFocus?: boolean;
}

const Composer = forwardRef<ComposerHandle, ComposerProps>(function Composer(
  { onSend, onStop, isGenerating, placeholder = "Message Iris", autoFocus },
  ref
) {
  const { settings, update } = useSettings();
  const toast = useToast();
  const isMac = useIsMac();
  const [text, setText] = useState("");
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [modelOpen, setModelOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modelBtnRef = useRef<HTMLButtonElement>(null);

  const filesRef = useRef(files);
  filesRef.current = files;

  const addFiles = (incoming: FileList | File[]) => {
    const list = Array.from(incoming);
    if (!list.length) return;
    const room = MAX_FILES - filesRef.current.length;
    if (room <= 0) {
      toast(`You can attach up to ${MAX_FILES} files`, { kind: "error" });
      return;
    }
    const accepted: PendingFile[] = [];
    for (const file of list.slice(0, room)) {
      if (file.size > MAX_FILE_MB * 1024 * 1024) {
        toast(`${file.name} is over ${MAX_FILE_MB} MB`, { kind: "error" });
        continue;
      }
      accepted.push({
        id: crypto.randomUUID(),
        file,
        previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
      });
    }
    if (list.length > room) toast(`Only ${MAX_FILES} files can be attached at once`, { kind: "info" });
    filesRef.current = [...filesRef.current, ...accepted];
    setFiles(filesRef.current);
    textareaRef.current?.focus();
  };

  useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus(),
    setText: (t: string) => {
      setText(t);
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (el) {
          el.focus();
          el.setSelectionRange(t.length, t.length);
        }
      });
    },
    addFiles,
    openFilePicker: () => fileInputRef.current?.click(),
  }));

  // Auto-grow up to a max height
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 260)}px`;
  }, [text]);

  useEffect(() => {
    if (autoFocus && window.matchMedia("(min-width: 768px)").matches) {
      textareaRef.current?.focus();
    }
  }, [autoFocus]);

  const canSend = (text.trim().length > 0 || files.length > 0) && !isGenerating;

  const submit = () => {
    if (!canSend) return;
    onSend(text.trim(), files);
    setText("");
    setFiles([]);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    const mod = e.metaKey || e.ctrlKey;
    if ((settings.sendOnEnter && !e.shiftKey) || (!settings.sendOnEnter && mod)) {
      e.preventDefault();
      submit();
    }
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const pasted = Array.from(e.clipboardData.files);
    if (pasted.length) {
      e.preventDefault();
      addFiles(pasted);
    }
  };

  return (
    <div className="w-full">
      <div
        className={cn(
          "rounded-[22px] border border-line-strong bg-elevated shadow-composer transition-[border-color,box-shadow]",
          "focus-within:border-[color-mix(in_oklch,var(--accent)_45%,var(--border-strong))]"
        )}
      >
        {files.length > 0 && (
          <div className="flex flex-wrap gap-2 px-3 pt-3">
            {files.map((f) => (
              <AttachmentChip
                key={f.id}
                name={f.file.name}
                size={f.file.size}
                type={f.file.type}
                previewUrl={f.previewUrl}
                className="w-auto min-w-[180px]"
                onRemove={() => setFiles((prev) => prev.filter((x) => x.id !== f.id))}
              />
            ))}
          </div>
        )}

        <textarea
          ref={textareaRef}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          placeholder={placeholder}
          aria-label="Message"
          className="block max-h-[260px] w-full resize-none bg-transparent px-4 pb-1 pt-3.5 text-[15px] leading-6 text-fg outline-none placeholder:text-fg-subtle"
        />

        <div className="flex items-center gap-1 p-2 pt-1">
          <Tooltip label="Attach files" side="top">
            <IconButton
              onClick={() => fileInputRef.current?.click()}
              aria-label="Attach files"
              className="rounded-full"
            >
              <LuPaperclip size={18} />
            </IconButton>
          </Tooltip>

          <button
            ref={modelBtnRef}
            type="button"
            onClick={() => setModelOpen((o) => !o)}
            className="inline-flex h-9 items-center gap-1 rounded-full px-3 text-[13px] font-medium text-fg-muted hover:bg-surface-2 hover:text-fg"
            aria-haspopup="menu"
            aria-expanded={modelOpen}
          >
            {modelLabel(settings.model)}
            <LuChevronDown size={14} />
          </button>

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-xs text-fg-subtle lg:inline">
              {settings.sendOnEnter ? "↵ send · ⇧↵ new line" : `${isMac ? "⌘" : "Ctrl"}↵ send`}
            </span>
            {isGenerating ? (
              <Tooltip label="Stop" side="top">
                <button
                  type="button"
                  onClick={onStop}
                  aria-label="Stop generating"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-fg text-bg transition-opacity hover:opacity-85"
                >
                  <LuSquare size={13} fill="currentColor" />
                </button>
              </Tooltip>
            ) : (
              <button
                type="button"
                onClick={submit}
                disabled={!canSend}
                aria-label="Send message"
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full transition-colors",
                  canSend
                    ? "bg-accent text-accent-fg hover:bg-accent-hover"
                    : "bg-surface-2 text-fg-subtle"
                )}
              >
                <LuArrowUp size={18} strokeWidth={2.4} />
              </button>
            )}
          </div>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {modelOpen && (
        <ModelMenu
          anchor={modelBtnRef.current}
          current={settings.model}
          onPick={(id) => update({ model: id })}
          onClose={() => setModelOpen(false)}
        />
      )}
    </div>
  );
});

function ModelMenu({
  anchor,
  current,
  onPick,
  onClose,
}: {
  anchor: HTMLElement | null;
  current: string;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null);

  useEffect(() => {
    if (!anchor) return;
    const place = () => {
      const r = anchor.getBoundingClientRect();
      setPos({
        left: Math.max(8, Math.min(r.left, window.innerWidth - 288)),
        bottom: window.innerHeight - r.top + 8,
      });
    };
    place();
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("resize", place);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", place);
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [anchor, onClose]);

  return (
    <Portal>
      <div
        ref={ref}
        role="menu"
        style={{ left: pos?.left ?? -9999, bottom: pos?.bottom ?? -9999 }}
        className="animate-pop-in fixed z-[600] w-[280px] rounded-2xl border border-line bg-elevated p-1.5 shadow-pop"
      >
        <div className="px-2.5 pb-1 pt-1.5 text-xs font-medium text-fg-subtle">Model</div>
        {MODELS.map((m) => (
          <button
            key={m.id}
            type="button"
            role="menuitemradio"
            aria-checked={current === m.id}
            onClick={() => {
              onPick(m.id);
              onClose();
            }}
            className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left hover:bg-surface-2"
          >
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-fg">{m.label}</div>
              <div className="truncate text-xs text-fg-subtle">{m.description}</div>
            </div>
            {current === m.id && <LuCheck size={16} className="shrink-0 text-accent" />}
          </button>
        ))}
      </div>
    </Portal>
  );
}

export default Composer;
