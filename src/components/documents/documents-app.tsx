"use client";

import * as React from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import type { DocAppRow, TemplateRow } from "@/features/documents/app-services";
import { CATEGORY_ORDER, metaFor } from "@/features/documents/category-meta";
import { DocumentAiFeedModal } from "./documents-ai-feed";
import { DocumentPreviewPane } from "./documents-preview-pane";
import { GenerateFromTemplateButton } from "./documents-template-modals";

type Counts = {
  all: number;
  byType: Record<string, number>;
  expiringSoon: number;
  aiKnowledge: number;
};

type Tab = string; // "all" | "expiring" | "ai" | documentType

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  });
}

/** Days-until-expiry suffix (e.g. "14d", "9 mo") for the expires column. */
function untilSuffix(iso: string | null): string | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const days = Math.round(ms / (24 * 60 * 60 * 1000));
  if (days < 60) return `${days}d`;
  const months = Math.round(days / 30);
  return `${months} mo`;
}

export function DocumentsApp({
  docs,
  templates,
  counts,
  initialDocId = null,
}: {
  docs: DocAppRow[];
  templates: TemplateRow[];
  counts: Counts;
  /** Deep-link target — preselects this doc's preview pane on mount.
   *  Used by the folder-tree / timeline vault variants (`?doc=<id>`). */
  initialDocId?: string | null;
}) {
  const [tab, setTab] = React.useState<Tab>("all");
  const [query, setQuery] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(
    initialDocId && docs.some((d) => d.id === initialDocId)
      ? initialDocId
      : null,
  );
  /** Doc whose "Feed to AI agent" modal is open (per-row ✦ affordance). */
  const [aiFeedDoc, setAiFeedDoc] = React.useState<DocAppRow | null>(null);

  const categories = CATEGORY_ORDER.filter((c) => (counts.byType[c] ?? 0) > 0);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    let active = docs.filter((d) => d.status === "active");
    if (tab === "expiring")
      active = active.filter((d) => d.expiringSoon || d.expired);
    else if (tab === "ai") active = active.filter((d) => !!d.aiFedAt);
    else if (tab !== "all") active = active.filter((d) => d.documentType === tab);
    if (q) {
      active = active.filter((d) =>
        [d.title, d.documentType, d.entityType, d.fileName ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(q),
      );
    }
    return active;
  }, [docs, tab, query]);

  // Priority sort — expired/expiring first, then by created date (newest).
  const sorted = React.useMemo(() => {
    return [...filtered].sort((a, b) => {
      const ap = a.expired ? 0 : a.expiringSoon ? 1 : 2;
      const bp = b.expired ? 0 : b.expiringSoon ? 1 : 2;
      if (ap !== bp) return ap - bp;
      return (
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    });
  }, [filtered]);

  const selected = React.useMemo(
    () => docs.find((d) => d.id === selectedId) ?? null,
    [docs, selectedId],
  );

  const chips: { id: Tab; label: string; count: number; tone?: "warn" }[] = [
    { id: "all", label: "all", count: counts.all },
    ...categories.map((c) => ({
      id: c,
      label: metaFor(c).label.toLowerCase(),
      count: counts.byType[c] ?? 0,
    })),
    {
      id: "expiring",
      label: "expiring",
      count: counts.expiringSoon,
      tone: "warn" as const,
    },
    { id: "ai", label: "ai knowledge", count: counts.aiKnowledge },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Filter bar — search + chips */}
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-cream-warm px-3 py-3">
        <div className="flex flex-[0_1_320px] items-center gap-2 rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink-tertiary">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, type, entity, file…"
            aria-label="Search documents"
            className="w-full bg-transparent text-sm text-ink placeholder:text-ink-tertiary focus:outline-none"
          />
        </div>
        <div
          role="tablist"
          aria-label="Document categories"
          className="flex flex-wrap items-center gap-2"
        >
          {chips.map((t) => {
            const isActive = tab === t.id;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={isActive}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "mono inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] uppercase tracking-wide transition-colors",
                  isActive
                    ? "border-ink bg-ink text-ink-inverse"
                    : "border-line bg-surface text-ink-tertiary hover:bg-muted/60",
                  t.tone === "warn" && !isActive && t.count > 0 && "text-warning",
                )}
              >
                <span>{t.label}</span>
                <span
                  className={cn(
                    "rounded-full px-1.5 text-[10px] tabular-nums",
                    isActive
                      ? "bg-ink-inverse/20 text-ink-inverse"
                      : "bg-cream-deep text-ink-tertiary",
                  )}
                >
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>
        <div className="ml-auto">
          <GenerateFromTemplateButton templates={templates} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* Priority list */}
        <div className="min-w-0">
          <h3 className="mb-3 flex items-baseline gap-2.5 text-display text-[22px] font-normal text-ink">
            Priority
            <span className="italic font-normal text-terra">
              · expiring + recent
            </span>
            <span className="ml-auto mono text-[10px] uppercase tracking-wide text-ink-tertiary">
              {sorted.length}
            </span>
          </h3>

          {sorted.length === 0 ? (
            <div className="rounded-md border border-line-soft p-10">
              <EmptyState
                variant={tab === "all" && !query ? "first-run" : "no-results"}
                title={
                  tab === "all" && !query
                    ? "No documents yet"
                    : "Nothing in this view"
                }
                body={
                  tab === "expiring"
                    ? "No active documents are expiring in the next 30 days."
                    : tab === "ai"
                      ? "No documents have been fed to the AI knowledge base yet."
                      : "Add a document or pick another category."
                }
              />
            </div>
          ) : (
            <div className="overflow-hidden rounded-md border border-line bg-surface">
              <div className="mono flex items-center border-b border-line-soft bg-cream-warm text-[9.5px] uppercase tracking-wide text-ink-tertiary">
                <div className="grid flex-1 grid-cols-[36px_1fr_76px_72px] sm:grid-cols-[36px_1fr_104px_92px_84px] items-center gap-3 px-4 py-2.5">
                  <div aria-hidden />
                  <div>document</div>
                  <div className="hidden sm:block">linked to</div>
                  <div className="text-right">expires</div>
                  <div className="text-center">status</div>
                </div>
                <div className="w-11 shrink-0 text-center">ai</div>
              </div>
              {sorted.map((d) => (
                <DocRow
                  key={d.id}
                  doc={d}
                  selected={d.id === selectedId}
                  onSelect={() => setSelectedId(d.id)}
                  onAiFeed={() => setAiFeedDoc(d)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right column — categories then preview */}
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 flex items-baseline gap-2.5 text-display text-[22px] font-normal text-ink">
              Categories
              <span className="ml-auto mono text-[10px] uppercase tracking-wide text-ink-tertiary">
                {categories.length}
              </span>
            </h3>
            <div className="flex flex-col gap-2">
              {categories.length === 0 ? (
                <p className="rounded-md border border-line-soft px-4 py-6 text-center text-sm text-ink-tertiary">
                  No categories yet.
                </p>
              ) : (
                categories.map((c) => {
                  const m = metaFor(c);
                  const isActive = tab === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setTab(isActive ? "all" : c)}
                      aria-pressed={isActive}
                      className={cn(
                        "grid grid-cols-[32px_1fr_auto] items-center gap-3 rounded-md border bg-surface px-3.5 py-3 text-left transition-colors",
                        isActive
                          ? "border-terra"
                          : "border-line hover:bg-muted/50",
                      )}
                    >
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-accent-weak text-base text-terra text-display">
                        {m.glyph}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-medium text-ink">
                          {m.label}
                        </span>
                        <span className="mono mt-0.5 block truncate text-[10.5px] text-ink-tertiary">
                          {m.meta}
                        </span>
                      </span>
                      <span className="mono text-xs tabular-nums text-ink">
                        {counts.byType[c] ?? 0}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Preview pane */}
          <div className="lg:sticky lg:top-6 lg:self-start">
            {selected ? (
              <DocumentPreviewPane
                doc={selected}
                onClose={() => setSelectedId(null)}
              />
            ) : (
              <div className="rounded-md border border-line-soft bg-surface px-4 py-10 text-center">
                <p className="text-sm text-ink-tertiary">
                  Select a document to preview it, manage signatures, versions,
                  and AI knowledge.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {aiFeedDoc && (
        <DocumentAiFeedModal
          doc={{
            id: aiFeedDoc.id,
            title: aiFeedDoc.title,
            mimeType: aiFeedDoc.mimeType,
            hasFile: aiFeedDoc.hasFile,
          }}
          open
          onOpenChange={(o) => {
            if (!o) setAiFeedDoc(null);
          }}
        />
      )}
    </div>
  );
}

function DocRow({
  doc,
  selected,
  onSelect,
  onAiFeed,
}: {
  doc: DocAppRow;
  selected: boolean;
  onSelect: () => void;
  onAiFeed: () => void;
}) {
  const tone = doc.expired ? "danger" : doc.expiringSoon ? "warn" : null;
  const suffix = untilSuffix(doc.expiresAt);
  const isPdf = (doc.mimeType ?? "").includes("pdf");
  const m = metaFor(doc.documentType);
  const isFed = !!doc.aiFedAt;

  const sigStatus = doc.signatureStatus;
  const signed = doc.signedAt || sigStatus === "signed" || sigStatus === "countersigned";
  const awaiting =
    sigStatus &&
    sigStatus !== "signed" &&
    sigStatus !== "countersigned" &&
    sigStatus !== "declined" &&
    sigStatus !== "cancelled";

  return (
    <div
      className={cn(
        "flex items-stretch border-b border-line-soft transition-colors last:border-0",
        selected
          ? "bg-muted"
          : tone === "danger"
            ? "border-l-[3px] border-l-danger bg-danger-weak/40 hover:bg-danger-weak/60"
            : tone === "warn"
              ? "border-l-[3px] border-l-warning bg-warning-weak/30 hover:bg-warning-weak/50"
              : "hover:bg-muted/40",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className={cn(
          "grid min-w-0 flex-1 grid-cols-[36px_1fr_76px_72px] sm:grid-cols-[36px_1fr_104px_92px_84px] items-center gap-3 px-4 py-3 text-left",
          tone && !selected && "pl-[13px]",
        )}
      >
        <span
          className={cn(
            "inline-flex h-11 w-9 items-center justify-center rounded-sm border border-line bg-cream-warm text-display text-[11px] font-medium",
            isPdf ? "text-danger" : "text-terra",
          )}
        >
          {isPdf ? "PDF" : "DOC"}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-medium text-ink">
            {doc.title}
          </span>
          <span className="mono mt-0.5 block truncate text-[10.5px] text-ink-tertiary">
            {doc.fileName ?? m.label}
            {doc.versionCount > 1 ? ` · v${doc.versionCount}` : ""}
            {isFed && <span className="text-terra"> · ✦ ai</span>}
          </span>
        </span>
        <span className="mono hidden text-[10.5px] leading-tight text-ink-tertiary sm:block">
          {doc.entityType}
          <span className="block text-ink-secondary">
            {doc.entityId.slice(0, 6)}
          </span>
        </span>
        <span
          className={cn(
            "mono text-right text-[11px] leading-tight",
            tone === "danger"
              ? "text-danger"
              : tone === "warn"
                ? "text-warning"
                : "text-ink-tertiary",
          )}
        >
          {doc.expiresAt ? (
            <>
              {formatDate(doc.expiresAt)}
              {suffix && (
                <span className="mt-0.5 block text-[9.5px] text-ink-tertiary">
                  {suffix}
                </span>
              )}
            </>
          ) : (
            "—"
          )}
        </span>
        <span className="flex justify-center">
          <span
            className={cn(
              "mono rounded-sm px-1.5 py-0.5 text-center text-[9.5px] uppercase tracking-wide",
              signed
                ? "bg-success-weak text-success"
                : awaiting
                  ? "bg-warning-weak text-warning"
                  : doc.expired
                    ? "bg-danger-weak text-danger"
                    : "bg-cream-deep text-ink-tertiary",
            )}
          >
            {signed
              ? "signed"
              : awaiting
                ? "awaiting"
                : doc.expired
                  ? "expired"
                  : "active"}
          </span>
        </span>
      </button>
      <span className="flex w-11 shrink-0 items-center justify-center">
        <button
          type="button"
          onClick={onAiFeed}
          title={
            isFed
              ? "In AI knowledge — manage agents"
              : "Feed to AI agent"
          }
          aria-label={
            isFed
              ? `Manage AI knowledge for ${doc.title}`
              : `Feed ${doc.title} to an AI agent`
          }
          className={cn(
            "inline-flex h-7 w-7 items-center justify-center rounded-md border text-[13px] transition-colors",
            isFed
              ? "border-terra/50 bg-accent-weak text-terra"
              : "border-line text-ink-tertiary hover:bg-accent-weak hover:text-terra",
          )}
        >
          ✦
        </button>
      </span>
    </div>
  );
}
