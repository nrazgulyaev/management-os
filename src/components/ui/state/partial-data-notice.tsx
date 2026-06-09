import * as React from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * STATE-KIT — PartialDataNotice (the "partial-data" state primitive).
 *
 * For when a view rendered successfully but is KNOWINGLY incomplete: one of
 * several queries failed, a section is still syncing, results were capped,
 * or a filter hid rows. The honest middle ground between "all good" and a
 * full ErrorState — show what you have, but flag that it isn't the whole
 * picture so the user doesn't make a decision on a half-truth.
 *
 *   <PartialDataNotice>
 *     Payout history is up to date; commission splits are still syncing.
 *   </PartialDataNotice>
 *
 *   <PartialDataNotice tone="neutral" label="Truncated">
 *     Showing the first 500 rows. Refine filters to narrow the result.
 *   </PartialDataNotice>
 *
 * Deliberately quiet (a thin banner), because a page full of loud warnings
 * trains people to ignore them.
 */

export interface PartialDataNoticeProps {
  children: React.ReactNode;
  /** Short prefix tag, e.g. "Partial data" (default) or "Truncated". */
  label?: string;
  /** warning → amber (something failed); neutral → quiet (capped/filtered). */
  tone?: "warning" | "neutral";
  className?: string;
}

export function PartialDataNotice({
  children,
  label = "Partial data",
  tone = "warning",
  className,
}: PartialDataNoticeProps) {
  return (
    <div
      role="note"
      className={cn(
        "flex items-start gap-2.5 rounded-md border px-3.5 py-2.5 text-sm leading-relaxed",
        tone === "warning"
          ? "border-warning/30 bg-warning-weak/50 text-ink"
          : "border-line-soft bg-muted/40 text-ink",
        className
      )}
    >
      <Info
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0",
          tone === "warning" ? "text-warning" : "text-ink-tertiary"
        )}
        strokeWidth={1.75}
        aria-hidden
      />
      <p className="min-w-0">
        <span className="font-medium">{label}:</span>{" "}
        <span className="text-ink-secondary">{children}</span>
      </p>
    </div>
  );
}
