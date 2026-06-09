import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * STATE-KIT — ComingSoon affordance (closing the "disabled button" debt).
 *
 * Principle: "no disabled button without a reason." Instead of a silently
 * greyed-out button (which reads as broken), wrap the control so the
 * not-yet-available state is SELF-EXPLAINING: a hover/focus tooltip plus a
 * "Soon" tag, and the trigger is rendered non-interactive but legible.
 *
 *   <ComingSoon note="Export is coming soon.">
 *     <button className="btn btn-ghost btn-sm">Export</button>
 *   </ComingSoon>
 *
 * The child should be a real, on-token control; ComingSoon makes it inert
 * (pointer-events off, aria-disabled) and explains why on hover/focus —
 * never use this for AI-cabinet buttons (owned by the ai-cabinet block).
 *
 * Pure CSS tooltip (group-hover / focus-within) — no JS, no portal, works
 * in Server Components.
 */

export interface ComingSoonProps {
  children: React.ReactNode;
  /** The tooltip / accessible explanation. */
  note: string;
  /** Show the small "Soon" pill beside the control. */
  showTag?: boolean;
  /** Tooltip position relative to the control. */
  side?: "top" | "bottom";
  className?: string;
}

export function ComingSoon({
  children,
  note,
  showTag = true,
  side = "top",
  className,
}: ComingSoonProps) {
  return (
    <span
      className={cn(
        "group relative inline-flex items-center gap-1.5 align-middle",
        className
      )}
    >
      {/* Trigger: kept legible but inert. tabIndex 0 so the tooltip is
          reachable by keyboard even though the action is unavailable. */}
      <span
        className="inline-flex cursor-not-allowed opacity-60 outline-none [&_*]:pointer-events-none"
        aria-disabled="true"
        tabIndex={0}
        title={note}
      >
        {children}
      </span>

      {showTag ? (
        <span className="inline-flex items-center rounded-full border border-line-soft bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-tertiary">
          Soon
        </span>
      ) : null}

      {/* Tooltip — revealed on hover or keyboard focus within the group. */}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute left-1/2 z-20 w-max max-w-[220px] -translate-x-1/2 rounded-md border border-line-soft bg-surface px-2.5 py-1.5 text-xs leading-snug text-ink-secondary shadow-soft-card",
          "opacity-0 transition-opacity duration-150",
          "group-hover:opacity-100 group-focus-within:opacity-100",
          side === "top" ? "bottom-full mb-2" : "top-full mt-2"
        )}
      >
        {note}
      </span>
    </span>
  );
}
