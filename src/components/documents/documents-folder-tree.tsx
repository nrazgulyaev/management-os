"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { DocAppRow } from "@/features/documents/app-services";
import {
  CATEGORY_ORDER,
  entityTypeLabel,
  metaFor,
} from "@/features/documents/category-meta";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * Folder-tree browser variant of the documents vault (mockup variant B).
 *
 * Read-only. The tree is *derived* from the existing documents — no folder
 * table exists, so `documentType` is the top-level folder and `entityType`
 * is the sub-folder. Counts + an "expiring" tint roll up from the leaf docs.
 * Selecting a folder reveals its documents inline; each doc links back to the
 * main vault (there is no per-document detail route yet).
 */

interface LeafDoc {
  id: string;
  title: string;
  fileName: string | null;
  expiresAt: string | null;
  expired: boolean;
  expiringSoon: boolean;
  entityType: string;
}

interface SubFolder {
  key: string;
  label: string;
  docs: LeafDoc[];
  expiringCount: number;
}

interface TopFolder {
  type: string;
  label: string;
  glyph: string;
  meta: string;
  count: number;
  expiringCount: number;
  subFolders: SubFolder[];
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  });
}

function buildTree(docs: DocAppRow[]): TopFolder[] {
  const active = docs.filter((d) => d.status === "active");
  const byType = new Map<string, DocAppRow[]>();
  for (const d of active) {
    const list = byType.get(d.documentType) ?? [];
    list.push(d);
    byType.set(d.documentType, list);
  }

  // Keep the canonical order first, then any unknown types alphabetically.
  const known = CATEGORY_ORDER.filter((t) => byType.has(t));
  const unknown = [...byType.keys()]
    .filter((t) => !CATEGORY_ORDER.includes(t as (typeof CATEGORY_ORDER)[number]))
    .sort();

  return [...known, ...unknown].map((type) => {
    const rows = byType.get(type) ?? [];
    const meta = metaFor(type);

    const bySub = new Map<string, LeafDoc[]>();
    for (const r of rows) {
      const key = r.entityType || "unlinked";
      const list = bySub.get(key) ?? [];
      list.push({
        id: r.id,
        title: r.title,
        fileName: r.fileName,
        expiresAt: r.expiresAt,
        expired: r.expired,
        expiringSoon: r.expiringSoon,
        entityType: r.entityType,
      });
      bySub.set(key, list);
    }

    const subFolders: SubFolder[] = [...bySub.entries()]
      .map(([key, leafDocs]) => ({
        key,
        label: entityTypeLabel(key === "unlinked" ? "" : key),
        docs: leafDocs.sort((a, b) => a.title.localeCompare(b.title)),
        expiringCount: leafDocs.filter((d) => d.expired || d.expiringSoon).length,
      }))
      .sort((a, b) => b.docs.length - a.docs.length);

    return {
      type,
      label: meta.label,
      glyph: meta.glyph,
      meta: meta.meta,
      count: rows.length,
      expiringCount: rows.filter((d) => d.expired || d.expiringSoon).length,
      subFolders,
    };
  });
}

function FolderIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden
      className="shrink-0"
    >
      {open ? (
        <path d="M3 7a1 1 0 0 1 1-1h5l2 2h8a1 1 0 0 1 1 1v1H6l-2 8a1 1 0 0 1-1-1V7z" />
      ) : (
        <path d="M3 7a1 1 0 0 1 1-1h5l2 2h8a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7z" />
      )}
    </svg>
  );
}

function DocLeaf({ doc }: { doc: LeafDoc }) {
  const tone = doc.expired
    ? "danger"
    : doc.expiringSoon
      ? "warn"
      : "none";
  return (
    <Link
      href={`/dashboard/documents?doc=${doc.id}`}
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] hover:bg-cream-warm",
        tone === "danger" && "text-danger",
        tone === "warn" && "text-warn",
        tone === "none" && "text-ink-secondary",
      )}
    >
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        aria-hidden
        className="shrink-0 text-ink-tertiary"
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
      <span className="truncate">{doc.title}</span>
      {doc.expiresAt && (
        <span className="ml-auto whitespace-nowrap font-mono text-[10.5px] text-ink-tertiary">
          {formatDate(doc.expiresAt)}
        </span>
      )}
    </Link>
  );
}

function TopFolderRow({ folder }: { folder: TopFolder }) {
  const [open, setOpen] = React.useState(false);
  const hasExpiring = folder.expiringCount > 0;
  return (
    <div className="border-b border-line-soft last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-cream-warm"
      >
        <span
          className={cn(
            "transition-transform",
            open ? "rotate-90" : "rotate-0",
            "text-ink-tertiary",
          )}
          aria-hidden
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
          >
            <polyline points="9 6 15 12 9 18" />
          </svg>
        </span>
        <span
          className={cn(
            "text-terra",
            hasExpiring && "text-danger",
          )}
        >
          <FolderIcon open={open} />
        </span>
        <span className="text-[13.5px] font-medium text-ink">
          {folder.label}
        </span>
        <span className="font-mono text-[10.5px] text-ink-tertiary">
          {folder.meta}
        </span>
        <span className="ml-auto flex items-center gap-2 font-mono text-[11px]">
          {hasExpiring && (
            <span className="text-danger">{folder.expiringCount} expiring</span>
          )}
          <span className="text-ink-secondary">{folder.count}</span>
        </span>
      </button>

      {open && (
        <div className="pb-2 pl-7 pr-3">
          {folder.subFolders.map((sub) => (
            <SubFolderRow key={sub.key} sub={sub} />
          ))}
        </div>
      )}
    </div>
  );
}

function SubFolderRow({ sub }: { sub: SubFolder }) {
  const [open, setOpen] = React.useState(sub.expiringCount > 0);
  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-cream-warm"
      >
        <span className="text-ink-tertiary">
          <FolderIcon open={open} />
        </span>
        <span className="text-[12.5px] font-medium text-ink-secondary">
          {sub.label}
        </span>
        <span className="ml-auto flex items-center gap-2 font-mono text-[10.5px]">
          {sub.expiringCount > 0 && (
            <span className="text-danger">{sub.expiringCount}↯</span>
          )}
          <span className="text-ink-tertiary">{sub.docs.length}</span>
        </span>
      </button>
      {open && (
        <div className="ml-4 border-l border-line-soft pl-2">
          {sub.docs.map((doc) => (
            <DocLeaf key={doc.id} doc={doc} />
          ))}
        </div>
      )}
    </div>
  );
}

export function DocumentsFolderTree({ docs }: { docs: DocAppRow[] }) {
  const tree = React.useMemo(() => buildTree(docs), [docs]);
  const activeCount = tree.reduce((acc, f) => acc + f.count, 0);

  if (tree.length === 0) {
    return (
      <EmptyState
        variant="first-run"
        title="No documents in the vault yet"
        body="Upload contracts, permits, insurance and other records from the Documents page to populate the folder tree."
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
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex items-center gap-2 border-b border-line-soft bg-cream-warm px-3 py-2.5">
        <span className="text-terra">
          <FolderIcon open />
        </span>
        <span className="text-[13px] font-medium text-ink">Documents</span>
        <span className="ml-auto font-mono text-[10.5px] text-ink-tertiary">
          {activeCount} files · {tree.length} folders
        </span>
      </div>
      <div>
        {tree.map((folder) => (
          <TopFolderRow key={folder.type} folder={folder} />
        ))}
      </div>
    </div>
  );
}
