"use client";

import * as React from "react";
import { SignOutButton } from "@/components/auth/sign-out-button";

/**
 * Field-shell profile menu.
 *
 * Replaces the previously-dead "SW" avatar button in the field header.
 * Tapping the avatar opens a small sheet anchored to the header that
 * shows who's signed in and offers Sign out (the action already exists;
 * we reuse the shared SignOutButton). Closes on outside-click / Escape.
 *
 * In demo / no-DB mode there's no app_user, so initials fall back to a
 * neutral glyph and the identity line is omitted.
 */
export function FieldProfileMenu({
  initials,
  name,
  email,
}: {
  initials: string;
  name: string | null;
  email: string | null;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label="Profile and sign out"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="h-11 w-11 rounded-full bg-ink text-ink-inverse text-xs font-medium inline-flex items-center justify-center"
      >
        {initials}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-40 w-56 rounded-md border border-line-soft bg-surface shadow-lg p-1"
        >
          {(name || email) && (
            <div className="px-3 py-2 border-b border-line-soft">
              {name && <div className="text-sm text-ink font-medium truncate">{name}</div>}
              {email && (
                <div className="text-[11px] text-ink-tertiary truncate">{email}</div>
              )}
            </div>
          )}
          <div className="pt-1">
            <SignOutButton
              variant="item"
              label="Sign out"
              className="flex items-center gap-2 w-full px-3 py-2 rounded-sm text-sm text-ink-secondary hover:bg-muted hover:text-ink transition-colors"
            />
          </div>
        </div>
      )}
    </div>
  );
}
