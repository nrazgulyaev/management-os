/**
 * Stage 10.B — DrillDownPanel primitive.
 *
 * Right-side slide-over panel for surfacing source detail without a
 * page reload. Pattern from research-summary.md theme 3 (CFO drill
 * down to tx, owner IRR → source, QS BoQ → stroke).
 *
 * Accessible: focus-trapped, ESC closes, backdrop click closes.
 *
 * Used by: 10.G CFO, 10.J Owner, 10.C Bookkeeper period-close, 10.E QS,
 * 10.H Procurement variance review.
 *
 * Client component (state + key handlers).
 */
"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

export interface DrillDownPanelProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: "sm" | "md" | "lg";
  className?: string;
}

const WIDTH: Record<NonNullable<DrillDownPanelProps["width"]>, string> = {
  sm: "w-full sm:max-w-md",
  md: "w-full sm:max-w-lg",
  lg: "w-full sm:max-w-2xl",
};

export function DrillDownPanel({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = "md",
  className,
}: DrillDownPanelProps) {
  const closeRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="drill-down-title"
      className="fixed inset-0 z-50 flex"
    >
      <button
        type="button"
        aria-label="Close panel"
        onClick={onClose}
        className="flex-1 bg-ink/40 backdrop-blur-[2px] cursor-default"
      />
      <aside
        className={cn(
          "h-full bg-surface shadow-[var(--shadow-floating)] flex flex-col",
          WIDTH[width],
          className,
        )}
      >
        <header className="flex items-start justify-between gap-2 px-5 py-4 border-b border-line-soft">
          <div className="min-w-0">
            <h2
              id="drill-down-title"
              className="text-base font-medium text-ink truncate"
            >
              {title}
            </h2>
            {subtitle && (
              <p className="text-xs text-ink-tertiary mt-0.5 truncate">
                {subtitle}
              </p>
            )}
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-ink-tertiary hover:text-ink p-1 rounded-sm focus-visible:outline-2 focus-visible:outline-line-strong"
          >
            <X className="w-4 h-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <footer className="px-5 py-3 border-t border-line-soft bg-muted/40">
            {footer}
          </footer>
        )}
      </aside>
    </div>
  );
}
