"use client";

import React, { memo, useEffect, useRef, useState } from "react";
import {
  LuBrain,
  LuCheck,
  LuChevronRight,
  LuCircleAlert,
  LuCopy,
  LuPencil,
  LuRefreshCw,
  LuThumbsDown,
  LuThumbsUp,
  LuVolume2,
  LuVolumeX,
} from "react-icons/lu";
import type { Message } from "../../types/chat";
import { modelLabel } from "../../lib/models";
import Markdown from "./Markdown";
import { AttachmentChip } from "./AttachmentChip";
import { IrisMark } from "../ui/brand";
import { Button, cn, Tooltip } from "../ui/primitives";

interface MessageItemProps {
  message: Message;
  index: number;
  isLast: boolean;
  isGenerating: boolean;
  showReasoning: boolean;
  onEdit: (index: number, text: string) => void;
  onRegenerate: (index: number) => void;
  onOpenMemory: () => void;
}

// Rough Markdown → plain text for speech
const toSpeech = (md: string) =>
  md
    .replace(/```[\s\S]*?```/g, " Code block omitted. ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_~|-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function ActionButton({
  label,
  onClick,
  children,
  active,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={cn(
          "inline-flex h-8 w-8 items-center justify-center rounded-lg text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg",
          active && "text-fg"
        )}
      >
        {children}
      </button>
    </Tooltip>
  );
}

function Reasoning({ text, live }: { text: string; live: boolean }) {
  const [open, setOpen] = useState(false);
  const startRef = useRef<number | null>(null);
  const [seconds, setSeconds] = useState<number | null>(null);

  useEffect(() => {
    if (live && startRef.current === null) startRef.current = Date.now();
    if (!live && startRef.current !== null && seconds === null) {
      setSeconds(Math.max(1, Math.round((Date.now() - startRef.current) / 1000)));
    }
  }, [live, seconds]);

  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-lg py-1 text-sm text-fg-muted hover:text-fg"
        aria-expanded={open}
      >
        <span className={live ? "shimmer-text font-medium" : ""}>
          {live ? "Thinking" : seconds ? `Thought for ${seconds}s` : "Thought process"}
        </span>
        <LuChevronRight size={14} className={cn("transition-transform", open && "rotate-90")} />
      </button>
      {open && (
        <div className="animate-fade-in mt-1.5 whitespace-pre-wrap border-l-2 border-line-strong pl-4 text-[13.5px] leading-6 text-fg-subtle">
          {text}
        </div>
      )}
    </div>
  );
}

const MessageItem = memo(function MessageItem({
  message,
  index,
  isLast,
  isGenerating,
  showReasoning,
  onEdit,
  onRegenerate,
  onOpenMemory,
}: MessageItemProps) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const [speaking, setSpeaking] = useState(false);
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) {
      const el = editRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
        el.style.height = "0px";
        el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
      }
    }
  }, [editing, draft]);

  useEffect(() => () => {
    if (speaking) window.speechSynthesis?.cancel();
  }, [speaking]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {}
  };

  const speak = () => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    synth.cancel();
    const u = new SpeechSynthesisUtterance(toSpeech(message.content));
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    synth.speak(u);
    setSpeaking(true);
  };

  // ---------- User ----------
  if (message.role === "user") {
    return (
      <div className="group/msg flex flex-col items-end gap-2">
        {!!message.attachments?.length && (
          <div className="flex max-w-[85%] flex-wrap justify-end gap-2">
            {message.attachments.map((a, i) => (
              <AttachmentChip
                key={`${a.name}-${i}`}
                name={a.name}
                size={a.size}
                type={a.type}
                previewUrl={a.previewUrl}
                readable={a.readable}
              />
            ))}
          </div>
        )}

        {editing ? (
          <div className="w-full rounded-3xl border border-line-strong bg-elevated p-3 shadow-composer">
            <textarea
              ref={editRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setEditing(false);
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  if (draft.trim()) {
                    setEditing(false);
                    onEdit(index, draft.trim());
                  }
                }
              }}
              className="block w-full resize-none bg-transparent px-1 text-[length:var(--chat-font-size)] leading-7 text-fg outline-none"
            />
            <div className="mt-2 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={!draft.trim() || draft.trim() === message.content}
                onClick={() => {
                  setEditing(false);
                  onEdit(index, draft.trim());
                }}
              >
                Send
              </Button>
            </div>
          </div>
        ) : (
          message.content && (
            <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-3xl rounded-br-lg bg-surface-2 px-4 py-2.5 text-[length:var(--chat-font-size)] leading-7 text-fg">
              {message.content}
            </div>
          )
        )}

        {!editing && message.content && (
          <div className="flex gap-0.5 opacity-100 transition-opacity md:opacity-0 md:group-hover/msg:opacity-100 md:focus-within:opacity-100">
            <ActionButton label={copied ? "Copied" : "Copy"} onClick={copy}>
              {copied ? <LuCheck size={15} /> : <LuCopy size={15} />}
            </ActionButton>
            {!isGenerating && (
              <ActionButton
                label="Edit"
                onClick={() => {
                  setDraft(message.content);
                  setEditing(true);
                }}
              >
                <LuPencil size={15} />
              </ActionButton>
            )}
          </div>
        )}
      </div>
    );
  }

  // ---------- Assistant ----------
  const streaming = !!message.pending;
  const hasContent = message.content.length > 0;
  const thinking = streaming && !hasContent;

  return (
    <div className="group/msg flex gap-4">
      <div className="hidden pt-1 sm:block">
        <span
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-full border border-line bg-elevated text-accent",
            streaming && "animate-pulse"
          )}
        >
          <IrisMark size={14} />
        </span>
      </div>

      <div className="min-w-0 flex-1">
        {showReasoning && message.reasoning && (
          <Reasoning text={message.reasoning} live={thinking} />
        )}

        {thinking && !message.reasoning && (
          <div className="flex h-7 items-center gap-1" aria-label="Iris is thinking">
            <span className="typing-dot h-1.5 w-1.5 rounded-full bg-fg-muted" />
            <span className="typing-dot h-1.5 w-1.5 rounded-full bg-fg-muted" />
            <span className="typing-dot h-1.5 w-1.5 rounded-full bg-fg-muted" />
          </div>
        )}

        {hasContent && <Markdown content={message.content} />}

        {message.error && (
          <div className="mt-1 flex flex-wrap items-center gap-3 rounded-xl border border-danger/25 bg-danger/8 px-3.5 py-2.5 text-sm text-danger">
            <LuCircleAlert size={16} className="shrink-0" />
            <span className="min-w-0 flex-1">{message.error}</span>
            {isLast && !isGenerating && (
              <Button variant="secondary" className="h-8" onClick={() => onRegenerate(index)}>
                <LuRefreshCw size={14} /> Retry
              </Button>
            )}
          </div>
        )}

        {message.interrupted && !streaming && (
          <div className="mt-2 text-xs text-fg-subtle">{hasContent ? "Stopped" : "Response stopped"}</div>
        )}

        {!!message.memoriesAdded?.length && (
          <button
            type="button"
            onClick={onOpenMemory}
            title={message.memoriesAdded.join("\n")}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-xs text-fg-muted hover:text-fg"
          >
            <LuBrain size={13} className="text-accent" />
            Memory updated
          </button>
        )}

        {!streaming && !message.error && (hasContent || message.interrupted) && (
          <div
            className={cn(
              "mt-2 flex items-center gap-0.5 transition-opacity",
              !isLast && "md:opacity-0 md:group-hover/msg:opacity-100 md:focus-within:opacity-100"
            )}
          >
            {hasContent && (
              <ActionButton label={copied ? "Copied" : "Copy"} onClick={copy}>
                {copied ? <LuCheck size={15} /> : <LuCopy size={15} />}
              </ActionButton>
            )}
            {hasContent && (
              <ActionButton label={speaking ? "Stop reading" : "Read aloud"} onClick={speak} active={speaking}>
                {speaking ? <LuVolumeX size={15} /> : <LuVolume2 size={15} />}
              </ActionButton>
            )}
            <ActionButton label="Good response" onClick={() => setFeedback(feedback === "up" ? null : "up")} active={feedback === "up"}>
              <LuThumbsUp size={15} fill={feedback === "up" ? "currentColor" : "none"} />
            </ActionButton>
            <ActionButton label="Bad response" onClick={() => setFeedback(feedback === "down" ? null : "down")} active={feedback === "down"}>
              <LuThumbsDown size={15} fill={feedback === "down" ? "currentColor" : "none"} />
            </ActionButton>
            {isLast && !isGenerating && (
              <ActionButton label="Regenerate" onClick={() => onRegenerate(index)}>
                <LuRefreshCw size={15} />
              </ActionButton>
            )}
            {message.model && (
              <span className="ml-2 text-xs text-fg-subtle">{modelLabel(message.model)}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

export default MessageItem;
