"use client";

import * as React from "react";
import { Section } from "@/components/ui/section";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import type { DocAppRow, TemplateRow } from "@/features/documents/app-services";
import { DocumentPreviewPane } from "./documents-preview-pane";
import { GenerateFromTemplateButton } from "./documents-template-modals";

type Counts = {
  all: number;
  byType: Record<string, number>;
  expiringSoon: number;
  aiKnowledge: number;
};

const CATEGORY_ORDER = [
  "contract",
  "invoice",
  "receipt",
  "statement",
  "kyc",
  "certificate",
  "guide",
  "policy",
  "photo",
  "other",
];

type Tab = string; // "all" | "expiring" | "ai" | documentType

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function DocumentsApp({
  docs,
  templates,
  counts,
}: {
  docs: DocAppRow[];
  templates: TemplateRow[];
  counts: Counts;
}) {
  const [tab, setTab] = React.useState<Tab>("all");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const categories = CATEGORY_ORDER.filter((c) => (counts.byType[c] ?? 0) > 0);

  const filtered = React.useMemo(() => {
    const active = docs.filter((d) => d.status === "active");
    if (tab === "all") return active;
    if (tab === "expiring") return active.filter((d) => d.expiringSoon || d.expired);
    if (tab === "ai") return active.filter((d) => !!d.aiFedAt);
    return active.filter((d) => d.documentType === tab);
  }, [docs, tab]);

  const selected = React.useMemo(
    () => docs.find((d) => d.id === selectedId) ?? null,
    [docs, selectedId],
  );

  const tabs: { id: Tab; label: string; count: number; tone?: "warn" }[] = [
    { id: "all", label: "All", count: counts.all },
    ...categories.map((c) => ({
      id: c,
      label: c.charAt(0).toUpperCase() + c.slice(1),
      count: counts.byType[c] ?? 0,
    })),
    { id: "expiring", label: "Expiring soon", count: counts.expiringSoon, tone: "warn" as const },
    { id: "ai", label: "AI knowledge", count: counts.aiKnowledge },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Category tabs */}
      <div
        role="tablist"
        aria-label="Document categories"
        className="flex flex-wrap items-center gap-2 border-b border-line-soft pb-3"
      >
        {tabs.map((t) => {
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={isActive}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                isActive
                  ? "border-ink bg-ink text-ink-inverse"
                  : "border-line-soft bg-surface text-ink-secondary hover:bg-muted/50",
                t.tone === "warn" && !isActive && t.count > 0 && "text-warning",
              )}
            >
              <span>{t.label}</span>
              <span
                className={cn(
                  "rounded-full px-1.5 text-[10px] tabular-nums",
                  isActive ? "bg-ink-inverse/20" : "bg-muted text-ink-tertiary",
                )}
              >
                {t.count}
              </span>
            </button>
          );
        })}
        <div className="ml-auto">
          <GenerateFromTemplateButton templates={templates} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Table */}
        <div className="min-w-0">
          {filtered.length === 0 ? (
            <div className="rounded-md border border-line-soft p-10">
              <EmptyState
                variant={tab === "all" ? "first-run" : "no-results"}
                title={tab === "all" ? "No documents yet" : "Nothing in this view"}
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
            <Table>
              <THead>
                <TR>
                  <TH>Title</TH>
                  <TH>Type</TH>
                  <TH>Visibility</TH>
                  <TH>Sign</TH>
                  <TH>Expiry</TH>
                  <TH>AI</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((d) => {
                  const isSel = d.id === selectedId;
                  return (
                    <TR
                      key={d.id}
                      data-state={isSel ? "selected" : undefined}
                      className="cursor-pointer"
                      onClick={() => setSelectedId(d.id)}
                    >
                      <TD className="text-ink font-medium">
                        <div className="flex items-center gap-2">
                          {d.title}
                          {d.versionCount > 1 && (
                            <Badge tone="outline">v{d.versionCount}</Badge>
                          )}
                        </div>
                      </TD>
                      <TD>
                        <Badge tone="outline">{d.documentType}</Badge>
                      </TD>
                      <TD>
                        <Badge tone={d.visibility === "internal" ? "neutral" : "gold"}>
                          {d.visibility}
                        </Badge>
                      </TD>
                      <TD>
                        {d.signatureStatus ? (
                          <Badge
                            tone={
                              d.signatureStatus === "countersigned" ||
                              d.signatureStatus === "signed"
                                ? "success"
                                : "warning"
                            }
                          >
                            {d.signatureStatus}
                          </Badge>
                        ) : d.signedAt ? (
                          <Badge tone="success">signed</Badge>
                        ) : (
                          <span className="text-xs text-ink-tertiary">unsigned</span>
                        )}
                      </TD>
                      <TD className="text-xs">
                        {d.expiresAt ? (
                          <span
                            className={cn(
                              d.expired
                                ? "text-danger font-medium"
                                : d.expiringSoon
                                  ? "text-warning font-medium"
                                  : "text-ink-tertiary",
                            )}
                          >
                            {formatDate(d.expiresAt)}
                          </span>
                        ) : (
                          <span className="text-ink-tertiary">—</span>
                        )}
                      </TD>
                      <TD>
                        {d.aiFedAt ? (
                          <Badge tone="accent">fed</Badge>
                        ) : (
                          <span className="text-xs text-ink-tertiary">—</span>
                        )}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </div>

        {/* Preview pane */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          {selected ? (
            <DocumentPreviewPane
              doc={selected}
              onClose={() => setSelectedId(null)}
            />
          ) : (
            <Section variant="panel" className="text-center">
              <p className="text-sm text-ink-tertiary py-8">
                Select a document to preview it, manage signatures, versions, and
                AI knowledge.
              </p>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}
