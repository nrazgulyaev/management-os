import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { DashboardKpi, NoItemsYet } from "@/components/ui/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import {
  QueueRow,
  WaitChip,
} from "@/components/development/procurement/procurement-ui";
import { safeQuery } from "@/lib/development/safe-query";
import {
  listQuotationComparisons,
  listPurchaseRequestsAwaitingQuotations,
  summarizeQuotationComparisons,
  type ComparisonListRow,
} from "@/lib/development/server/procurement/quotation-comparison-queries";
import { loadQuotationMatrix } from "@/lib/development/server/procurement/quotation-matrix-queries";
import { QuotationMatrixIsland } from "./_matrix-island";

export const metadata: Metadata = {
  title: "Quotation comparison · Development OS",
};
export const dynamic = "force-dynamic";

const URGENCY_TONE: Record<string, "neutral" | "info" | "warning" | "danger"> = {
  low: "neutral",
  normal: "info",
  high: "warning",
  urgent: "danger",
};

function formatMoney(amountMinor: string | null, currency: string | null) {
  if (amountMinor == null || currency == null) return "—";
  const n = Number(amountMinor) / 100;
  return `${n.toLocaleString()} ${currency}`;
}

function priceSpread(row: ComparisonListRow): number | null {
  if (
    row.lowestTotalMinor == null ||
    row.highestTotalMinor == null ||
    row.lowestTotalMinor === row.highestTotalMinor
  )
    return null;
  const lo = Number(row.lowestTotalMinor);
  const hi = Number(row.highestTotalMinor);
  if (!isFinite(lo) || !isFinite(hi) || lo === 0) return null;
  return Math.round(((hi - lo) / lo) * 100);
}

export default async function QuotationComparisonListPage() {
  const [rows, awaiting, matrix] = await Promise.all([
    safeQuery(
      "quotationComparisons",
      listQuotationComparisons(),
      [] as ComparisonListRow[],
      4000,
    ),
    safeQuery(
      "prsAwaitingQuotations",
      listPurchaseRequestsAwaitingQuotations(),
      [] as Awaited<
        ReturnType<typeof listPurchaseRequestsAwaitingQuotations>
      >,
      4000,
    ),
    safeQuery(
      "quotationMatrix",
      loadQuotationMatrix(),
      { lines: [], vendors: [], cellsByPrAndVendor: {} },
      4000,
    ),
  ]);
  const summary = summarizeQuotationComparisons(rows);

  return (
    <DevelopmentShell>
      <header className="page-header">
        <div className="left">
          <div className="crumb">
            <span>Procurement</span>
            <span>·</span>
            <span>
              {summary.totalRfqsCount} RFQ
              {summary.totalRfqsCount === 1 ? "" : "s"} ·{" "}
              {summary.totalQuotationsCount} quote
              {summary.totalQuotationsCount === 1 ? "" : "s"}
            </span>
          </div>
          <h1>Quotation comparison</h1>
        </div>
        <div className="actions">
          <Link href="/development-os" className="btn btn-dark btn-sm">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Command center
          </Link>
        </div>
      </header>

      <p className="text-ink-3 text-sm max-w-3xl -mt-4 leading-relaxed">
        Every Dev-OS purchase request that has at least one quote, sorted by
        required-by date. Click &lsquo;Compare&rsquo; to see vendor cards
        side-by-side and select the winner.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <DashboardKpi
          label="RFQs total"
          value={String(summary.totalRfqsCount)}
          status="neutral"
          hint="Purchase requests with ≥ 1 quote"
        />
        <DashboardKpi
          label="Awaiting decision"
          value={String(summary.awaitingDecisionCount)}
          status={summary.awaitingDecisionCount > 0 ? "warn" : "good"}
          hint="No quote selected yet"
        />
        <DashboardKpi
          label="Decided"
          value={String(summary.decidedCount)}
          status="good"
          hint="Selected vendor on file"
        />
        <DashboardKpi
          label="Quotes received"
          value={String(summary.totalQuotationsCount)}
          status="neutral"
          hint="Across every open + decided RFQ"
        />
      </div>

      {matrix.lines.length > 0 && matrix.vendors.length > 0 && (
        <div>
          <div className="text-[10.5px] font-mono uppercase tracking-[0.16em] text-ink-4 leading-[1.5] mb-1">
            Award matrix
          </div>
          <h2 className="text-display text-[18px] font-semibold leading-tight tracking-[-0.01em] text-ink mb-1">
            Pick a winner per row, create POs in one batch
          </h2>
          <p className="text-sm text-ink-3 leading-relaxed mb-3 max-w-3xl">
            Side-by-side comparison across every PR that has at least one
            quotation. Defaults match the lowest-price highlight; click a
            different vendor radio to override.
          </p>
          <QuotationMatrixIsland
            lines={matrix.lines}
            vendors={matrix.vendors}
            cellsByPrAndVendor={matrix.cellsByPrAndVendor}
          />
        </div>
      )}

      <div>
        <div className="text-[10.5px] font-mono uppercase tracking-[0.16em] text-ink-4 leading-[1.5] mb-1">
          Active comparisons
        </div>
        <h2 className="text-display text-[18px] font-semibold leading-tight tracking-[-0.01em] text-ink mb-3">
          {rows.length} RFQ{rows.length === 1 ? "" : "s"} with quotations
        </h2>
        {rows.length === 0 ? (
          <NoItemsYet
            entityLabel="quotation comparisons"
            description="No RFQ has any quotation yet. Once vendors submit quotes (via the per-PR detail page or the addQuotation server action), they'll show up here for side-by-side comparison."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>PR</TH>
                <TH>Material</TH>
                <TH>Qty</TH>
                <TH>Required by</TH>
                <TH>Urgency</TH>
                <TH>Quotes</TH>
                <TH>Lowest price</TH>
                <TH>Spread</TH>
                <TH>Status</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => {
                const spread = priceSpread(r);
                return (
                  <TR key={r.requestId}>
                    <TD className="font-mono text-xs">
                      <Link
                        href={`/development-os/procurement/purchase-requests/${encodeURIComponent(r.requestCode)}`}
                        className="hover:underline"
                      >
                        {r.requestCode}
                      </Link>
                    </TD>
                    <TD className="text-sm">{r.materialName}</TD>
                    <TD className="text-xs text-ink-tertiary tabular-nums">
                      {r.quantity} {r.unitOfMeasure}
                    </TD>
                    <TD className="text-xs">{r.requiredByDate}</TD>
                    <TD>
                      <Badge tone={URGENCY_TONE[r.urgency] ?? "neutral"}>
                        {r.urgency}
                      </Badge>
                    </TD>
                    <TD className="text-xs">
                      <span className="text-ink">{r.quotationCount}</span>
                      {r.pendingCount > 0 && (
                        <span className="text-ink-tertiary">
                          {" "}
                          ({r.pendingCount} pending)
                        </span>
                      )}
                    </TD>
                    <TDNum>
                      {formatMoney(r.lowestTotalMinor, r.currency)}
                    </TDNum>
                    <TD className="text-xs text-ink-secondary">
                      {spread === null ? "—" : `${spread}%`}
                    </TD>
                    <TD>
                      {r.selectedVendorName ? (
                        <span className="inline-flex items-center gap-1 text-xs">
                          <Badge tone="success">selected</Badge>
                          <span className="text-ink-secondary">
                            {r.selectedVendorName}
                          </span>
                        </span>
                      ) : (
                        <Badge tone="warning">decision pending</Badge>
                      )}
                    </TD>
                    <TD className="text-right">
                      <Button asChild size="sm" variant="secondary">
                        <Link
                          href={`/development-os/procurement/quotation-comparison/${encodeURIComponent(r.requestCode)}`}
                        >
                          Compare
                          <ArrowUpRight
                            className="w-3 h-3"
                            strokeWidth={1.75}
                          />
                        </Link>
                      </Button>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </div>

      {awaiting.length > 0 && (
        <div>
          <div className="text-[10.5px] font-mono uppercase tracking-[0.16em] text-ink-4 leading-[1.5] mb-1">
            Heads up
          </div>
          <h2 className="text-display text-[18px] font-semibold leading-tight tracking-[-0.01em] text-ink mb-1">
            {awaiting.length} approved PR{awaiting.length === 1 ? "" : "s"}{" "}
            awaiting quotations
          </h2>
          <p className="text-sm text-ink-3 leading-relaxed mb-3 max-w-3xl">
            These purchase requests are submitted or approved but have no quotes
            yet — chase the vendor list before the required-by date slips.
          </p>
          <div className="rounded-[14px] border border-warning/40 bg-warning-weak/30 overflow-hidden">
            {awaiting.map((p) => (
              <QueueRow
                key={p.id}
                href={`/development-os/procurement/purchase-requests/${encodeURIComponent(p.requestCode)}`}
                className="border-warning/25 hover:bg-warning-weak/40"
                code={p.requestCode}
                title={p.materialName}
                sub={`required by ${p.requiredByDate}`}
                wait="No quotes yet"
                status={
                  <Badge tone={URGENCY_TONE[p.urgency] ?? "neutral"}>
                    {p.urgency}
                  </Badge>
                }
                amount={<Badge tone="info">{p.status}</Badge>}
                meta={<WaitChip>Add quote →</WaitChip>}
              />
            ))}
          </div>
        </div>
      )}
    </DevelopmentShell>
  );
}
