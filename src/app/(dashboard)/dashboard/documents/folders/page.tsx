import Link from "next/link";
import { SourceBadge } from "@/components/ui/source-badge";
import { DbStatusNotice } from "@/components/admin/db-status";
import { isDbConfigured } from "@/lib/env";
import {
  listDocsForApp,
  getDocCategoryCounts,
} from "@/features/documents/app-services";
import { DocumentsFolderTree } from "@/components/documents/documents-folder-tree";

export const metadata = { title: "Documents · Folders" };
export const dynamic = "force-dynamic";

/**
 * `/dashboard/documents/folders` — folder-TREE browser variant of the
 * documents vault (mockup variant B). Read-only; reuses the existing
 * `listDocsForApp` org-scoped fetch and derives the tree from each
 * document's `documentType` (top folder) + `entityType` (sub-folder).
 * No new tables.
 */
export default async function DocumentFoldersPage() {
  const [docs, counts] = await Promise.all([
    listDocsForApp(),
    getDocCategoryCounts(),
  ]);
  const source = isDbConfigured() ? "db" : "mock";
  const folderCount = Object.values(counts.byType).filter((n) => n > 0).length;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mono text-[10.5px] uppercase tracking-wide text-ink-tertiary">
              workspace / documents / folders
            </p>
            <h1 className="mt-1.5 text-display text-[30px] font-normal leading-tight text-ink">
              Folder tree
            </h1>
            <p className="mt-1 text-sm text-ink-tertiary">
              {counts.all} docs across {folderCount} categories ·{" "}
              {counts.expiringSoon} expiring
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
          <span className="rounded-md border border-ink bg-ink px-3 py-1.5 font-mono text-[11px] text-ink-inverse">
            folders
          </span>
          <Link
            href="/dashboard/documents/timeline"
            className="rounded-md border border-line bg-surface px-3 py-1.5 font-mono text-[11px] text-ink-secondary hover:bg-cream-warm"
          >
            timeline
          </Link>
        </nav>
      </header>
      <DbStatusNotice />

      <DocumentsFolderTree docs={docs} />
    </div>
  );
}
