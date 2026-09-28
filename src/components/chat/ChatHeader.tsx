"use client";

import React, { useRef, useState } from "react";
import {
  LuChevronDown,
  LuDownload,
  LuGhost,
  LuLink,
  LuMenu,
  LuMoon,
  LuPanelLeftOpen,
  LuPencil,
  LuPin,
  LuPinOff,
  LuSquarePen,
  LuSun,
  LuTrash2,
} from "react-icons/lu";
import { cn, IconButton, Menu, MenuItem, Tooltip } from "../ui/primitives";

interface ChatHeaderProps {
  title: string | null;
  pinned: boolean;
  temporary: boolean;
  hasMessages: boolean;
  isDesktop: boolean;
  sidebarCollapsed: boolean;
  isDark: boolean;
  onOpenSidebar: () => void;
  onNewChat: () => void;
  onToggleTemporary: () => void;
  onToggleTheme: () => void;
  onRename: () => void;
  onTogglePin: () => void;
  onExport: () => void;
  onCopyLink: () => void;
  onDelete: () => void;
}

export default function ChatHeader(props: ChatHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const titleRef = useRef<HTMLButtonElement>(null);
  // On desktop the collapsed rail already has open/new-chat controls
  const showRailControls = !props.isDesktop;
  const saved = !!props.title && !props.temporary;

  const items: MenuItem[] = [
    { label: "Rename", icon: <LuPencil size={15} />, onSelect: props.onRename },
    {
      label: props.pinned ? "Unpin" : "Pin",
      icon: props.pinned ? <LuPinOff size={15} /> : <LuPin size={15} />,
      onSelect: props.onTogglePin,
    },
    { label: "Copy link", icon: <LuLink size={15} />, onSelect: props.onCopyLink },
    { label: "Export as Markdown", icon: <LuDownload size={15} />, onSelect: props.onExport },
    { label: "Delete", icon: <LuTrash2 size={15} />, onSelect: props.onDelete, danger: true, separatorBefore: true },
  ];

  return (
    <header className="relative z-20 flex h-14 shrink-0 items-center gap-1 px-2 sm:px-3">
      {showRailControls && (
        <>
          <Tooltip label="Open sidebar" shortcut={props.isDesktop ? ["mod", "B"] : undefined}>
            <IconButton onClick={props.onOpenSidebar} aria-label="Open sidebar">
              {props.isDesktop ? <LuPanelLeftOpen size={18} /> : <LuMenu size={19} />}
            </IconButton>
          </Tooltip>
          {!props.isDesktop && (
            <Tooltip label="New chat">
              <IconButton onClick={props.onNewChat} aria-label="New chat">
                <LuSquarePen size={18} />
              </IconButton>
            </Tooltip>
          )}
        </>
      )}

      <div className="flex min-w-0 flex-1 items-center justify-center md:justify-start">
        {saved ? (
          <>
            <button
              ref={titleRef}
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-haspopup="menu"
              className={cn(
                "flex max-w-full min-w-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[15px] font-medium text-fg hover:bg-surface-2",
                menuOpen && "bg-surface-2"
              )}
            >
              {props.pinned && <LuPin size={13} className="shrink-0 text-fg-subtle" />}
              <span className="truncate">{props.title}</span>
              <LuChevronDown size={15} className="shrink-0 text-fg-subtle" />
            </button>
            <Menu anchor={titleRef.current} open={menuOpen} onClose={() => setMenuOpen(false)} items={items} width={210} />
          </>
        ) : props.temporary && props.hasMessages ? (
          <span className="flex items-center gap-2 rounded-lg px-2.5 text-[15px] font-medium text-fg">
            <LuGhost size={16} className="text-fg-muted" /> Temporary chat
          </span>
        ) : null}
      </div>

      <div className="flex items-center gap-0.5">
        {!props.hasMessages && (
          <Tooltip label={props.temporary ? "Turn off temporary chat" : "Temporary chat"}>
            <button
              type="button"
              onClick={props.onToggleTemporary}
              aria-pressed={props.temporary}
              aria-label="Temporary chat"
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-full px-3 text-[13px] font-medium transition-colors",
                props.temporary
                  ? "bg-fg text-bg"
                  : "text-fg-muted hover:bg-surface-2 hover:text-fg"
              )}
            >
              <LuGhost size={16} />
              <span className="hidden sm:inline">Temporary</span>
            </button>
          </Tooltip>
        )}
        <Tooltip label={props.isDark ? "Light mode" : "Dark mode"}>
          <IconButton onClick={props.onToggleTheme} aria-label="Toggle theme">
            {props.isDark ? <LuSun size={18} /> : <LuMoon size={18} />}
          </IconButton>
        </Tooltip>
      </div>
    </header>
  );
}
