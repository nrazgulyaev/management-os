import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FileDown, FileUp } from "lucide-react";
import { Kpi, HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { GenerateRfqFromBoqButton } from "@/components/development/boq/generate-rfq-button";
import { BoqStatusControls } from "./_status-controls";
import { getDb } from "@/lib/db/client";
import {
  getBoqDocumentByCode,
  getBoqActualsByLine,
} from "@/lib/development/server/boq/boq-queries";

export const metadata: Metadata = { title: "BOQ document · Development OS" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<
  string,
  "ok" | "warn" | "danger" | "gold" | "info" | "ink" | undefined
> = {
  draft: undefined,
  under_review: "info",
  approved: "ok",
  tender: "info",
  awarded: "ok",
  superseded: undefined,
  archived: undefined,
};

function fmtMajor(minor: number | bigint | null): string {
  if (minor == null) return "—";
  return Math.round(Number(minor) / 100).toLocaleString("en-US");
}
function fmtCompact(minor: number): string {
  const major = minor / 100;
  const abs = Math.abs(major);
  const sign = major < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(0)}k`;
  return `${sign}${Math.round(abs)}`;
}

export default async function BoqDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <header className="page-header">
          <div className="left">
            <div className="crumb">Construction · estimate</div>
            <h1>BOQ document</h1>
          </div>
        </header>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const data = await getBoqDocumentByCode(decodeURIComponent(code));
  if (!data) notFound();
  const { document, sections, items } = data;

  // Real posted actuals per line (read-only fill for the variance view).
  const actuals = await getBoqActualsByLine(document.id).catch(
    () => new Map<string, { qtyActual: number; actualCostMinor: number }>(),
  );

  // Bucket items per section.
  const itemsBySection = new Map<string, typeof items>();
  for (const it of items) {
    const arr = itemsBySection.get(it.sectionId) ?? [];
    arr.push(it);
    itemsBySection.set(it.sectionId, arr);
  }
  const allItemIds = items.map((it) => it.id);

  // KPI strip — estimate (plan) vs posted actual, derived from items.
  const planMinor = items.reduce(
    (n, it) =>
      n + (it.totalMinor != null ? Number(it.totalMinor) : 0),
    0,
  );
  const actualMinor = items.reduce(
    (n, it) => n + (actuals.get(it.id)?.actualCostMinor ?? 0),
    0,
  );
  const hasActuals = actuals.size > 0;
  const varianceMinor = actualMinor - planMinor;
  const cur = document.currency;

  return (
    <DevelopmentShell>
      <header className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os/boq">BOQ</Link>
            <span>/</span>
            <span>{document.boqCode}</span>
            <span>·</span>
            <span>{document.versionLabel}</span>
          </div>
          <h1>{document.title}</h1>
        </div>
        <div className="actions">
          <Link
            href={`/development-os/boq/${encodeURIComponent(document.boqCode)}/import`}
            className="btn btn-dark btn-sm"
          >
            <FileUp className="w-4 h-4" strokeWidth={1.75} />
            Import CSV
          </Link>
          <Link
            href={`/development-os/boq/${encodeURIComponent(document.boqCode)}/export`}
            className="btn btn-dark btn-sm"
          >
            <FileDown className="w-4 h-4" strokeWidth={1.75} />
            Export CSV
          </Link>
          <GenerateRfqFromBoqButton boqItemIds={allItemIds} />
          <BoqStatusControls
            boqDocumentId={document.id}
            boqCode={document.boqCode}
            status={document.status}
          />
        </div>
      </header>

      {document.description && (
        <p className="text-ink-secondary text-sm max-w-3xl -mt-4 leading-relaxed">
          {document.description}
        </p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi
          label="Estimate (plan)"
          value={items.length ? fmtCompact(planMinor) : "—"}
          sub={`${cur} · ${items.length} line${items.length === 1 ? "" : "s"}`}
          tone={items.length ? "accent" : undefined}
        />
        <Kpi
          label="Actual"
          value={hasActuals ? fmtCompact(actualMinor) : "—"}
          sub={hasActuals ? "posted" : "no actuals yet"}
        />
        <Kpi
          label="Variance"
          value={hasActuals ? `${varianceMinor > 0 ? "+" : ""}${fmtCompact(varianceMinor)}` : "—"}
          sub="actual − plan"
          tone={
            !hasActuals
              ? undefined
              : varianceMinor > 0
                ? "warn"
                : "success"
          }
        />
        <Kpi
          label="Status"
          value={
            <HandoffBadge tone={STATUS_TONE[document.status] ?? undefined}>
              {document.status}
            </HandoffBadge>
          }
          sub={document.qsFirm ? `QS · ${document.qsFirm}` : "no QS firm"}
        />
      </div>

      {sections.length === 0 ? (
        <EmptyState
          title="No sections yet"
          description="Use 'Import CSV' to bulk-load sections + items, or add them via the API."
        />
      ) : (
        sections.map((s) => {
          const sectionItems = itemsBySection.get(s.id) ?? [];
          return (
            <section key={s.id}>
              <div className="boq-cat-head">
                <span>
                  <span className="mono text-ink-tertiary text-xs mr-2">
                    {s.sectionCode}
                  </span>
                  {s.sectionName}
                </span>
                <span className="sum">
                  {s.subtotalMinor != null
                    ? `${fmtMajor(s.subtotalMinor)} ${cur}`
                    : "—"}
                </span>
              </div>
              {sectionItems.length === 0 ? (
                <div className="card px-5 py-[18px]">
                  <p className="text-xs text-ink-tertiary">
                    No items in this section.
                  </p>
                </div>
              ) : (
                <div className="card overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="boq-est">
                      <thead>
                        <tr>
                          <th>Code</th>
                          <th>Description</th>
                          <th>Unit</th>
                          <th className="num">Qty</th>
                          <th className="num">Rate</th>
                          <th className="num">Amount</th>
                          <th className="num">Actual</th>
                          <th className="num">Var.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sectionItems.map((it) => {
                          const amount =
                            it.totalMinor != null ? Number(it.totalMinor) : 0;
                          const act = actuals.get(it.id);
                          const varMinor =
                            act != null ? act.actualCostMinor - amount : null;
                          const varClass =
                            varMinor == null
                              ? "flat"
                              : varMinor > 0
                                ? "pos"
                                : varMinor < 0
                                  ? "neg"
                                  : "flat";
                          return (
                            <tr key={it.id}>
                              <td className="code">{it.itemCode}</td>
                              <td className="desc">{it.description}</td>
                              <td className="unit">{it.unitOfMeasure}</td>
                              <td className="num">
                                {Number(it.quantity).toFixed(2)}
                              </td>
                              <td className="num">
                                {(Number(it.unitRateMinor) / 100).toLocaleString(
                                  "en-US",
                                )}
                              </td>
                              <td className="num amount">{fmtMajor(amount)}</td>
                              <td className="num">
                                {act ? fmtMajor(act.actualCostMinor) : "—"}
                              </td>
                              <td className={`num boq-var ${varClass}`}>
                                {varMinor == null
                                  ? "—"
                                  : `${varMinor > 0 ? "+" : ""}${fmtMajor(varMinor)}`}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>
          );
        })
      )}
    </DevelopmentShell>
  );
}
