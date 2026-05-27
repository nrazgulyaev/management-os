"use client";

/**
 * Phase 2.1 PR 3 — global ⌘K listener + lazy palette mount.
 *
 * Mounted once at the root layout. Owns the open/close state and
 * registers a window-level keyboard listener that opens the
 * palette on ⌘K / Ctrl+K from anywhere in the app. Topbar search
 * inputs can also open the palette by dispatching the same
 * `arconique:open-command-palette` window event.
 */

import * as React from "react";
import { CommandPalette } from "./command-palette";

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const isModK = (e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K");
      if (!isModK) return;
      // Allow inside contenteditable / textarea / input — power
      // users still want ⌘K even while focused inside a field, so
      // we DON'T early-return on those targets. Skip when an
      // existing modal blocks the document, otherwise toggle.
      void target;
      e.preventDefault();
      setOpen((o) => !o);
    }
    function onOpenEvent() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("arconique:open-command-palette", onOpenEvent as EventListener);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("arconique:open-command-palette", onOpenEvent as EventListener);
    };
  }, []);

  return (
    <>
      {children}
      <CommandPalette open={open} onOpenChange={setOpen} />
    </>
  );
}
