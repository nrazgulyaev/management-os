"use client";

/**
 * Phase 2.1 PR 1 — pager-loadmore primitive (template 03 · variant B).
 *
 * Append-on-click pagination for feed-style surfaces (Concierge
 * transcript, Activity log, AI agent runs). No page numbers, no
 * jumping — just "Load N more" + "Showing X of Y" summary.
 */

import * as React from "react";

export interface PagerLoadmoreProps {
  /** Items currently visible. */
  shown: number;
  /** Total available (set undefined when total is unknown/streamy). */
  total?: number;
  /** Increment per click. Default 20. */
  step?: number;
  onLoadMore: () => void;
  loading?: boolean;
}

export function PagerLoadmore({
  shown,
  total,
  step = 20,
  onLoadMore,
  loading,
}: PagerLoadmoreProps) {
  const hasMore = total === undefined || shown < total;
  return (
    <div className="pager loadmore">
      <div className="summary">
        Showing {shown}
        {total !== undefined && <> of {total}</>}
      </div>
      {hasMore && (
        <button
          className="btn btn-secondary btn-sm"
          onClick={onLoadMore}
          disabled={loading}
          aria-label={`Load ${step} more`}
        >
          {loading ? "Loading…" : `Load ${step} more →`}
        </button>
      )}
    </div>
  );
}
