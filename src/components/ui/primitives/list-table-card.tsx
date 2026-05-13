/**
 * Stage 10.6.C.2 — ListTableCard primitive.
 *
 * Wraps any table (or list body) in the modern rounded-3xl card
 * shell with soft-card shadow. Optional header (title + count +
 * right-aligned actions) sits above the table inside the same card.
 *
 * Reference: PPC dashboard "Highest ACoS campaigns" card +
 * recruiting candidates list. The card look (vs raw table on canvas)
 * is the dominant visual upgrade for list pages.
 */

import * as React from "react";
import { cn } from "@/lib/utils";

export interface ListTableCardProps {
  /** Optional header title shown at the top of the card. */
  title?: string;
  /** Optional small label (e.g. "12 results") shown next to the title. */
  count?: string | number;
  /** Optional eyebrow above the title. */
  eyebrow?: string;
  /** Optional right-aligned actions (e.g. download button, filter chip). */
  actions?: React.ReactNode;
  /** The table or list body. */
  children: React.ReactNode;
  /** Optional empty-state body shown when `isEmpty` is true. */
  emptyState?: React.ReactNode;
  isEmpty?: boolean;
  className?: string;
  /** When true, removes inner padding so a Table can flush to the edges. */
  flushBody?: boolean;
}

export function ListTableCard({
  title,
  count,
  eyebrow,
  actions,
  children,
  emptyState,
  isEmpty = false,
  className,
  flushBody = true,
}: ListTableCardProps) {
  const hasHeader = Boolean(title || eyebrow || actions);
  return (
    <section
      className={cn(
        "rounded-3xl bg-surface border border-line-soft shadow-soft-card overflow-hidden",
        className,
      )}
      data-stage10="list-table-card"
    >
      {hasHeader && (
        <header className="flex items-center justify-between gap-4 px-6 py-5 border-b border-line-soft">
          <div className="flex flex-col gap-1 min-w-0">
            {eyebrow && (
              <span className="text-[11px] uppercase tracking-[0.16em] text-ink-tertiary font-medium">
                {eyebrow}
              </span>
            )}
            {title && (
              <h2 className="text-display text-[20px] md:text-[24px] leading-tight font-medium text-ink">
                {title}
                {count !== undefined && (
                  <span className="ml-2 text-ink-tertiary font-mono tabular-nums text-base">
                    {count}
                  </span>
                )}
              </h2>
            )}
          </div>
          {actions && (
            <div className="flex items-center gap-2 shrink-0">{actions}</div>
          )}
        </header>
      )}
      <div className={cn(flushBody ? "" : "p-6")}>
        {isEmpty && emptyState ? emptyState : children}
      </div>
    </section>
  );
}
