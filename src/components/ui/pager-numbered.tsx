"use client";

/**
 * Phase 2.1 PR 1 — pager-numbered primitive (template 03 · variant A).
 *
 * Numbered pagination for finite, bounded lists (Bookings, Owners,
 * Statements). Renders:
 *
 *   Showing 41–60 of 248       Per page [20 ▾]   ‹ 1 2 [3] 4 5 … 12 ›
 *
 * Always shows first, current ±1, last; gap-fills the middle with …
 * so the row stays ≤ ~9 buttons regardless of total count.
 *
 * URL sync (optional) — when `urlKeyPrefix` is provided, page +
 * perPage write to query string keys `{prefix}page` and `{prefix}per`
 * via `useRouter().replace(..., { scroll: false })`. The parent
 * server page reads from `searchParams` for SSR.
 *
 * perPage default persists per `routeKey` (= first 2 path segments)
 * in localStorage at `arconique.pager.perPage.{routeKey}`.
 */

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export interface PagerNumberedProps {
  total: number;
  page: number;
  perPage: number;
  perPageOptions?: number[];
  /** Called when user picks a different page or per-page count.
   *  When `urlKeyPrefix` is set, URL is already updated when this fires. */
  onChange?: (next: { page: number; perPage: number }) => void;
  /** Optional URL sync. When set, ?{prefix}page= and ?{prefix}per=
   *  are written via shallow router.replace. Empty string = no prefix. */
  urlKeyPrefix?: string;
}

const DEFAULT_PER_PAGE_OPTIONS = [20, 50, 100];

/** Compute the page-button window with truncation gaps. */
function buildWindow(page: number, totalPages: number): (number | "gap")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const out: (number | "gap")[] = [];
  const window = new Set<number>([1, totalPages, page - 1, page, page + 1]);
  let last = 0;
  for (let i = 1; i <= totalPages; i++) {
    if (!window.has(i)) continue;
    if (i - last > 1) out.push("gap");
    out.push(i);
    last = i;
  }
  return out;
}

export function PagerNumbered({
  total,
  page,
  perPage,
  perPageOptions = DEFAULT_PER_PAGE_OPTIONS,
  onChange,
  urlKeyPrefix,
}: PagerNumberedProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, perPage)));
  const clampedPage = Math.min(Math.max(1, page), totalPages);
  const start = total === 0 ? 0 : (clampedPage - 1) * perPage + 1;
  const end = Math.min(total, clampedPage * perPage);
  const pageWindow = buildWindow(clampedPage, totalPages);

  function commit(next: { page: number; perPage: number }) {
    onChange?.(next);
    if (urlKeyPrefix !== undefined) {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.set(`${urlKeyPrefix}page`, String(next.page));
      params.set(`${urlKeyPrefix}per`, String(next.perPage));
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }
    // Persist per-page choice keyed by first 2 path segments.
    if (typeof window !== "undefined" && pathname) {
      try {
        const segs = pathname.split("/").filter(Boolean).slice(0, 2);
        const routeKey = segs.length ? segs.join(".") : "root";
        localStorage.setItem(
          `arconique.pager.perPage.${routeKey}`,
          String(next.perPage),
        );
      } catch {
        // localStorage unavailable — non-fatal
      }
    }
  }

  function goPage(p: number) {
    if (p < 1 || p > totalPages || p === clampedPage) return;
    commit({ page: p, perPage });
  }

  function setPer(per: number) {
    commit({ page: 1, perPage: per });
  }

  return (
    <div className="pager">
      <div className="summary">
        Showing <b>{start}–{end}</b> of <b>{total}</b>
      </div>
      <div className="grow" />
      <label className="perpage">
        Per page{" "}
        <select
          value={perPage}
          onChange={(e) => setPer(Number(e.target.value))}
          aria-label="Per page"
        >
          {perPageOptions.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </label>
      <div className="nav" role="navigation" aria-label="Pagination">
        <button
          className="pg"
          onClick={() => goPage(clampedPage - 1)}
          disabled={clampedPage <= 1}
          aria-label="Previous page"
        >
          ‹
        </button>
        {pageWindow.map((entry, i) =>
          entry === "gap" ? (
            <button key={`gap-${i}`} className="pg gap" tabIndex={-1} aria-hidden>
              …
            </button>
          ) : (
            <button
              key={entry}
              className={`pg${entry === clampedPage ? " on" : ""}`}
              onClick={() => goPage(entry)}
              aria-current={entry === clampedPage ? "page" : undefined}
              aria-label={`Page ${entry}`}
            >
              {entry}
            </button>
          ),
        )}
        <button
          className="pg"
          onClick={() => goPage(clampedPage + 1)}
          disabled={clampedPage >= totalPages}
          aria-label="Next page"
        >
          ›
        </button>
      </div>
    </div>
  );
}
