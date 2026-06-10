import Link from "next/link";
import { SourceBadge } from "@/components/ui/source-badge";
import { DbStatusNotice } from "@/components/admin/db-status";
import { isDbConfigured } from "@/lib/env";
import {
  listDocsForApp,
  getDocCategoryCounts,
} from "@/features/documents/app-services";
import { DocumentsTimeline } from "@/components/documents/documents-timeline";

export const metadata = { title: "Documents · Timeline" };
export const dynamic = "force-dynamic";

/**
 * `/dashboard/documents/timeline` — timeline-by-year variant of the
 * documents vault (mockup variant C, "good for audits"). Read-only; reuses
 * the existing `listDocsForApp` org-scoped fetch and groups documents by the
 * year of `createdAt`. No new tables.
 */
export default async function DocumentTimelinePage() {
  const [docs, counts] = await Promise.all([
    listDocsForApp(),
    getDocCategoryCounts(),
  ]);
  const source = isDbConfigured() ? "db" : "mock";

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mono text-[10.5px] uppercase tracking-wide text-ink-tertiary">
              workspace / documents / timeline
            </p>
            <h1 className="mt-1.5 text-display text-[30px] font-normal leading-tight text-ink">
              Audit timeline
            </h1>
            <p className="mt-1 text-sm text-ink-tertiary">
              {counts.all} docs charted by year · newest first
            </p>
          </div>
          <div className="flex items-center gap-2">
            <SourceBadge source={source} />
          </div>
        </div>
        <nav className="flex flex-wrap items-center gap-2" aria-label="Vault views">
          <Link
            href="/dashboard/documents"
            className="rounded-md border border-line bg-surface px-3 py-1.5 font-mono text-[11px] text-ink-secondary hover:bg-cream-warm"
          >
            priority
          </Link>
          <Link
            href="/dashboard/documents/folders"
            className="rounded-md border border-line bg-surface px-3 py-1.5 font-mono text-[11px] text-ink-secondary hover:bg-cream-warm"
          >
            folders
          </Link>
          <span className="rounded-md border border-ink bg-ink px-3 py-1.5 font-mono text-[11px] text-ink-inverse">
            timeline
          </span>
        </nav>
      </header>
      <DbStatusNotice />

      <DocumentsTimeline docs={docs} />
    </div>
  );
}
