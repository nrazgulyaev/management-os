"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { DocAppRow } from "@/features/documents/app-services";
import { metaFor } from "@/features/documents/category-meta";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * Timeline-by-year variant of the documents vault (mockup variant C —
 * "good for audits"). Read-only; reuses the existing `listDocsForApp`
 * org-scoped fetch and groups documents by the YEAR of `createdAt`, newest
 * first. Each entry shows the day, the category, and the document title,
 * linking back to the main vault. No new tables.
 */

interface TimelineEntry {
  id: string;
  title: string;
  documentType: string;
  glyph: string;
  categoryLabel: string;
  createdAt: string;
  isCurrentYear: boolean;
}

interface YearGroup {
  year: number;
  entries: TimelineEntry[];
}

function groupByYear(docs: DocAppRow[]): YearGroup[] {
  const active = docs.filter((d) => d.status === "active");
  const thisYear = new Date().getFullYear();
  const byYear = new Map<number, TimelineEntry[]>();

  for (const d of active) {
    const created = new Date(d.createdAt);
    const year = created.getFullYear();
    if (Number.isNaN(year)) continue;
    const meta = metaFor(d.documentType);
    const list = byYear.get(year) ?? [];
    list.push({
      id: d.id,
      title: d.title,
      documentType: d.documentType,
      glyph: meta.glyph,
      categoryLabel: meta.label,
      createdAt: d.createdAt,
      isCurrentYear: year === thisYear,
    });
    byYear.set(year, list);
  }

  return [...byYear.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, entries]) => ({
      year,
      entries: entries.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    }));
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  });
}

function EntryRow({ entry }: { entry: TimelineEntry }) {
  return (
    <Link
      href={`/dashboard/documents?doc=${entry.id}`}
      className={cn(
        "block rounded-md border-l-2 bg-surface px-3 py-2.5 hover:bg-cream-warm",
        entry.isCurrentYear ? "border-terra" : "border-line-strong",
      )}
    >
      <div className="flex items-baseline gap-2.5">
        <span
          className={cn(
            "font-mono text-[11px] font-medium",
            entry.isCurrentYear ? "text-ink" : "text-ink-secondary",
          )}
        >
          {formatDay(entry.createdAt)}
        </span>
        <span aria-hidden className="text-terra">
          {entry.glyph}
        </span>
        <span className="truncate text-[12.5px] text-ink-secondary">
          {entry.title}
        </span>
        <span className="ml-auto whitespace-nowrap font-mono text-[10px] uppercase tracking-wide text-ink-tertiary">
          {entry.categoryLabel}
        </span>
      </div>
    </Link>
  );
}

export function DocumentsTimeline({ docs }: { docs: DocAppRow[] }) {
  const groups = React.useMemo(() => groupByYear(docs), [docs]);

  if (groups.length === 0) {
    return (
      <EmptyState
        variant="first-run"
        title="No documents to chart yet"
        body="The audit timeline plots every document by the year it entered the vault. Upload documents to start the trail."
        actions={
          <Link
            href="/dashboard/documents"
            className="rounded-md border border-line bg-surface px-3.5 py-2 text-sm font-medium text-ink-secondary hover:bg-cream-warm"
          >
            Go to Documents
          </Link>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {groups.map((group) => (
        <section key={group.year} className="flex flex-col gap-2">
          <div className="flex items-baseline gap-3">
            <h2
              className={cn(
                "font-mono text-[12px] uppercase tracking-[0.1em]",
                group.year === new Date().getFullYear()
                  ? "text-terra"
                  : "text-ink-tertiary",
              )}
            >
              {group.year}
            </h2>
            <span className="font-mono text-[10.5px] text-ink-tertiary">
              {group.entries.length} docs
            </span>
            <span className="h-px flex-1 bg-line-soft" aria-hidden />
          </div>
          <div className="flex flex-col gap-1.5">
            {group.entries.map((entry) => (
              <EntryRow key={entry.id} entry={entry} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
