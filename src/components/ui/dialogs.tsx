"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button, Dialog } from "./primitives";

interface ConfirmOptions {
  title: string;
  body: string;
  action: string;
}

// Promise-based confirm dialog: `const ok = await confirm({...})`
export function useConfirm() {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);

  const confirm = useCallback(
    (opts: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ ...opts, resolve })),
    []
  );

  const close = (value: boolean) => {
    state?.resolve(value);
    setState(null);
  };

  const element = (
    <Dialog open={!!state} onClose={() => close(false)} label={state?.title ?? "Confirm"} className="max-w-[420px]">
      <div className="p-6">
        <h2 className="text-lg font-semibold text-fg">{state?.title}</h2>
        <p className="mt-2 text-sm leading-6 text-fg-muted">{state?.body}</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button
            className="bg-danger text-white hover:bg-danger/90"
            onClick={() => close(true)}
          >
            {state?.action}
          </Button>
        </div>
      </div>
    </Dialog>
  );

  return { confirm, element };
}

export function RenameDialog({
  open,
  initial,
  onClose,
  onSave,
}: {
  open: boolean;
  initial: string;
  onClose: () => void;
  onSave: (title: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setValue(initial);
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }, [open, initial]);

  const submit = () => {
    const t = value.trim();
    if (t) onSave(t);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} label="Rename chat" className="max-w-[440px]">
      <form
        className="p-6"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <h2 className="text-lg font-semibold text-fg">Rename chat</h2>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={100}
          className="mt-4 h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-[15px] text-fg outline-none focus:border-accent/60"
          aria-label="Chat title"
        />
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!value.trim()}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
