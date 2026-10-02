"use client";

import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  LuArrowUp,
  LuAudioLines,
  LuCamera,
  LuCheck,
  LuChevronDown,
  LuFileCode,
  LuFileSpreadsheet,
  LuFileText,
  LuFiles,
  LuFileType,
  LuImage,
  LuImagePlus,
  LuX,
  LuMic,
  LuMicOff,
  LuPlus,
  LuPresentation,
  LuSquare,
} from "react-icons/lu";
import { MODELS, modelLabel } from "../../lib/models";
import { useSettings } from "../providers/settings";
import { useToast } from "../providers/toast";
import { AttachmentChip } from "./AttachmentChip";
import { cn, IconButton, Portal, Tooltip, useIsMac } from "../ui/primitives";
import { useVoiceInput } from "../../hooks/useVoiceInput";

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
  onSend: (text: string, files: PendingFile[], options?: { image?: boolean }) => void;
  onStop: () => void;
  onVoiceMode?: () => void;
  isGenerating: boolean;
  placeholder?: string;
  autoFocus?: boolean;
}

interface AttachOption {
  /** Special action instead of opening the file picker */
  action?: "image";
  label: string;
  description: string;
  icon: React.ComponentType<{ size?: number }>;
  tone: string;
  accept: string;
  capture?: boolean;
  touchOnly?: boolean;
  separatorBefore?: boolean;
}

const ATTACH_OPTIONS: AttachOption[] = [
  {
    action: "image",
    label: "Create image",
    description: "Describe it and Iris will draw it",
    icon: LuImagePlus,
    tone: "text-fuchsia-500 bg-fuchsia-500/12",
    accept: "",
  },
  {
    label: "Photos & images",
    description: "Text and visuals are read by AI",
    icon: LuImage,
    tone: "text-violet-500 bg-violet-500/12",
    accept: "image/*",
    separatorBefore: true,
  },
  {
    label: "Take photo",
    description: "Snap a document or whiteboard",
    icon: LuCamera,
    tone: "text-pink-500 bg-pink-500/12",
    accept: "image/*",
    capture: true,
    touchOnly: true,
  },
  {
    label: "PDF",
    description: "Scanned PDFs are OCR'd",
    icon: LuFileType,
    tone: "text-red-500 bg-red-500/12",
    accept: ".pdf,application/pdf",
  },
  {
    label: "Documents",
    description: "Word, text, Markdown",
    icon: LuFileText,
    tone: "text-blue-500 bg-blue-500/12",
    accept: ".doc,.docx,.txt,.md,.markdown,.rtf,.odt,.html,.htm",
  },
  {
    label: "Spreadsheets",
    description: "Excel, CSV, TSV",
    icon: LuFileSpreadsheet,
    tone: "text-emerald-500 bg-emerald-500/12",
    accept: ".xlsx,.xls,.csv,.tsv",
  },
  {
    label: "Presentations",
    description: "PowerPoint slides",
    icon: LuPresentation,
    tone: "text-orange-500 bg-orange-500/12",
    accept: ".pptx,.ppt",
  },
  {
    label: "Code",
    description: "Source and config files",
    icon: LuFileCode,
    tone: "text-sky-500 bg-sky-500/12",
    accept:
      ".js,.jsx,.ts,.tsx,.py,.java,.kt,.c,.h,.cpp,.cs,.go,.rs,.rb,.php,.swift,.html,.css,.scss,.json,.xml,.yaml,.yml,.toml,.sql,.sh,.ipynb",
  },
  {
    label: "Any file",
    description: `Up to ${MAX_FILES} files · ${MAX_FILE_MB} MB each`,
    icon: LuFiles,
    tone: "text-fg-muted bg-surface-2",
    accept: "*/*",
    separatorBefore: true,
  },
];

const Composer = forwardRef<ComposerHandle, ComposerProps>(function Composer(
  { onSend, onStop, onVoiceMode, isGenerating, placeholder = "Message Iris", autoFocus },
  ref
) {
  const { settings, update } = useSettings();
  const toast = useToast();
  const isMac = useIsMac();
  const [text, setText] = useState("");
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [modelOpen, setModelOpen] = useState(false);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [imageMode, setImageMode] = useState(false);

  const onVoiceResult = useCallback((transcript: string) => {
    setText((prev) => {
      const separator = prev && !prev.endsWith(" ") ? " " : "";
      return prev + separator + transcript;
    });
  }, []);

  const voice = useVoiceInput({ onResult: onVoiceResult });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modelBtnRef = useRef<HTMLButtonElement>(null);
  const attachBtnRef = useRef<HTMLButtonElement>(null);
  const [fileAccept, setFileAccept] = useState("*/*");
  const [fileCapture, setFileCapture] = useState(false);

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
    openFilePicker: () => {
      setFileAccept("*/*");
      setFileCapture(false);
      requestAnimationFrame(() => fileInputRef.current?.click());
    },
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

  // Image mode needs a description to draw
  const canSend = (imageMode ? text.trim().length > 0 : text.trim().length > 0 || files.length > 0) && !isGenerating;

  const submit = () => {
    if (!canSend) return;
    onSend(text.trim(), files, { image: imageMode });
    setText("");
    setFiles([]);
    setImageMode(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Backspace" && imageMode && !text) {
      setImageMode(false);
      return;
    }
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

  const openAttachOption = (opt: AttachOption) => {
    if (opt.action === "image") {
      setAttachMenuOpen(false);
      setImageMode(true);
      requestAnimationFrame(() => textareaRef.current?.focus());
      return;
    }
    setFileAccept(opt.accept);
    setFileCapture(!!opt.capture);
    setAttachMenuOpen(false);
    requestAnimationFrame(() => fileInputRef.current?.click());
  };

  return (
    <div className="w-full">
      <div
        className={cn(
          "rounded-[22px] border border-line-strong bg-elevated shadow-composer transition-[border-color,box-shadow]",
          "focus-within:border-[color-mix(in_oklch,var(--accent)_45%,var(--border-strong))]"
        )}
      >
        {imageMode && (
          <div className="flex px-3 pt-3">
            <span className="animate-pop-in inline-flex h-7 items-center gap-1.5 rounded-full bg-fuchsia-500/12 pl-2.5 pr-1 text-xs font-medium text-fuchsia-600 dark:text-fuchsia-300">
              <LuImagePlus size={14} />
              Create image
              <button
                type="button"
                onClick={() => setImageMode(false)}
                aria-label="Turn off image mode"
                className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-fuchsia-500/20"
              >
                <LuX size={12} />
              </button>
            </span>
          </div>
        )}

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
          placeholder={imageMode ? "Describe the image you want…" : placeholder}
          aria-label="Message"
          className="block max-h-[260px] w-full resize-none bg-transparent px-4 pb-1 pt-3.5 text-[15px] leading-6 text-fg outline-none placeholder:text-fg-subtle"
        />

        {voice.listening && voice.interim && (
          <div className="mx-4 mb-1 flex items-center gap-2 text-xs text-fg-subtle">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-danger" />
            <span className="italic opacity-70">{voice.interim}</span>
          </div>
        )}

        <div className="flex items-center gap-1 p-2 pt-1">
          <Tooltip label="Attach" side="top">
            <IconButton
              ref={attachBtnRef}
              onClick={() => setAttachMenuOpen((o) => !o)}
              aria-label="Attach"
              aria-haspopup="menu"
              aria-expanded={attachMenuOpen}
              className={cn("rounded-full", attachMenuOpen && "bg-surface-2 text-fg")}
            >
              <LuPlus size={18} className={cn("transition-transform duration-200", attachMenuOpen && "rotate-45")} />
            </IconButton>
          </Tooltip>

          {voice.supported && (
            <Tooltip label={voice.listening ? "Stop dictation" : "Dictate"} side="top">
              <IconButton
                onClick={voice.toggle}
                aria-label={voice.listening ? "Stop dictation" : "Dictate"}
                className={cn(
                  "rounded-full transition-colors",
                  voice.listening && "bg-danger/15 text-danger hover:bg-danger/25 hover:text-danger mic-pulse"
                )}
              >
                {voice.listening ? <LuMicOff size={18} /> : <LuMic size={18} />}
              </IconButton>
            </Tooltip>
          )}

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
            ) : !canSend && onVoiceMode ? (
              <Tooltip label="Voice chat" side="top">
                <button
                  type="button"
                  onClick={onVoiceMode}
                  aria-label="Start voice chat"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-fg text-bg transition-opacity hover:opacity-85"
                >
                  <LuAudioLines size={18} />
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
        accept={fileAccept}
        {...(fileCapture ? { capture: "environment" } : {})}
        className="hidden"
        onChange={(e) => {
          if (e.target.files) addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {attachMenuOpen && (
        <AttachMenu
          anchor={attachBtnRef.current}
          onPick={openAttachOption}
          onClose={() => setAttachMenuOpen(false)}
        />
      )}

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

function AttachMenu({
  anchor,
  onPick,
  onClose,
}: {
  anchor: HTMLElement | null;
  onPick: (opt: AttachOption) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null);

  useEffect(() => {
    if (!anchor) return;
    const place = () => {
      const r = anchor.getBoundingClientRect();
      setPos({
        left: Math.max(8, Math.min(r.left, window.innerWidth - 260)),
        bottom: window.innerHeight - r.top + 8,
      });
    };
    place();
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return onClose();
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const items = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ?? []);
      const i = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = e.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
      items[next]?.focus();
    };
    window.addEventListener("resize", place);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", place);
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [anchor, onClose]);

  // The camera option only makes sense on phones and tablets
  const touch = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
  const options = ATTACH_OPTIONS.filter((o) => !o.touchOnly || touch);

  return (
    <Portal>
      <div
        ref={ref}
        role="menu"
        aria-label="Attach"
        style={{ left: pos?.left ?? -9999, bottom: pos?.bottom ?? -9999 }}
        className="animate-pop-in fixed z-[600] w-[260px] rounded-2xl border border-line bg-elevated p-1.5 shadow-pop"
      >
        <div className="px-2.5 pb-1 pt-1.5 text-xs font-medium text-fg-subtle">Add to chat</div>
        {options.map((opt) => (
          <React.Fragment key={opt.label}>
            {opt.separatorBefore && <div className="mx-2 my-1 h-px bg-line" role="separator" />}
            <button
              type="button"
              role="menuitem"
              onClick={() => onPick(opt)}
              className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left outline-none hover:bg-surface-2 focus-visible:bg-surface-2"
            >
              <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", opt.tone)}>
                <opt.icon size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-fg">{opt.label}</div>
                <div className="truncate text-xs text-fg-subtle">{opt.description}</div>
              </div>
            </button>
          </React.Fragment>
        ))}
      </div>
    </Portal>
  );
}

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
