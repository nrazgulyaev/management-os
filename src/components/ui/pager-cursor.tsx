"use client";

/**
 * Phase 2.1 PR 1 — pager-cursor primitive (template 03 · variant C).
 *
 * Cursor-only pager for very large or stream-y tables (BOQ lines,
 * Procurement RFQs) where counting is expensive or jumping is less
 * useful than continuous browse. Renders:
 *
 *   Lines WP-04.18 – WP-04.21 · cursor: eyJpZCI…   Jump to [____]  ‹ Prev  Next ›
 *
 * Caller owns the cursor state; this primitive is presentational +
 * emits onPrev/onNext/onJump callbacks.
 */

import * as React from "react";

export interface PagerCursorProps {
  /** Human-readable range hint (e.g. "WP-04.18 – WP-04.21"). */
  rangeLabel: string;
  /** Opaque cursor token shown next to the range (debug-y / power
   *  user breadcrumb). */
  cursor?: string;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  /** Optional direct-address jump; omit to hide the input. */
  onJump?: (code: string) => void;
  jumpPlaceholder?: string;
  /** Label for prev/next buttons. Default "Prev 20" / "Next 20". */
  prevLabel?: string;
  nextLabel?: string;
}

export function PagerCursor({
  rangeLabel,
  cursor,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  onJump,
  jumpPlaceholder,
  prevLabel = "‹ Prev 20",
  nextLabel = "Next 20 ›",
}: PagerCursorProps) {
  const [jumpValue, setJumpValue] = React.useState("");

  function handleJumpSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = jumpValue.trim();
    if (!trimmed || !onJump) return;
    onJump(trimmed);
  }

  return (
    <div className="pager cursor">
      <div className="summary">
        Range <b>{rangeLabel}</b>
        {cursor && (
          <>
            {" "}· cursor: <span className="mono">{cursor}</span>
          </>
        )}
      </div>
      <div className="grow" />
      {onJump && (
        <form className="jump" onSubmit={handleJumpSubmit}>
          <label>
            Jump to{" "}
            <input
              value={jumpValue}
              onChange={(e) => setJumpValue(e.target.value)}
              placeholder={jumpPlaceholder}
              aria-label="Jump to row"
            />
          </label>
        </form>
      )}
      <div className="nav" role="navigation" aria-label="Cursor pagination">
        <button
          className="pg"
          onClick={onPrev}
          disabled={!hasPrev}
          aria-label="Previous page"
        >
          {prevLabel}
        </button>
        <button
          className="pg"
          onClick={onNext}
          disabled={!hasNext}
          aria-label="Next page"
        >
          {nextLabel}
        </button>
      </div>
    </div>
  );
}
