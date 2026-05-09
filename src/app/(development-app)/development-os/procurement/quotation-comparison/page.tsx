import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { DashboardKpi, NoItemsYet } from "@/components/ui/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { safeQuery } from "@/lib/development/safe-query";
import {
  listQuotationComparisons,
  listPurchaseRequestsAwaitingQuotations,
  summarizeQuotationComparisons,
  type ComparisonListRow,
} from "@/lib/development/server/procurement/quotation-comparison-queries";

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
  const [rows, awaiting] = await Promise.all([
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
  ]);
  const summary = summarizeQuotationComparisons(rows);

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Procurement" },
          { label: "Quotation comparison" },
        ]}
        eyebrow={`${summary.totalRfqsCount} RFQ${summary.totalRfqsCount === 1 ? "" : "s"} · ${summary.totalQuotationsCount} quote${summary.totalQuotationsCount === 1 ? "" : "s"}`}
        title="Quotation comparison"
        description="Every Dev-OS purchase request that has at least one quote, sorted by required-by date. Click 'Compare' to see vendor cards side-by-side and select the winner."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Command center
            </Link>
          </Button>
        }
      />

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
          status={summary.awaitingDecisionCount > 0 ? "bad" : "good"}
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

      <Section
        eyebrow="Active comparisons"
        title={`${rows.length} RFQ${rows.length === 1 ? "" : "s"} with quotations`}
      >
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
      </Section>

      {awaiting.length > 0 && (
        <Section
          eyebrow="Heads up"
          title={`${awaiting.length} approved PR${awaiting.length === 1 ? "" : "s"} awaiting quotations`}
          description="These purchase requests are submitted or approved but have no quotes yet — chase the vendor list before the required-by date slips."
        >
          <div className="rounded-md border border-warning/40 bg-warning-weak/30 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-warning-weak/50 text-ink-tertiary text-[11px] uppercase tracking-widest">
                <tr>
                  <th className="text-left px-3 py-2">PR</th>
                  <th className="text-left px-3 py-2">Material</th>
                  <th className="text-left px-3 py-2">Required by</th>
                  <th className="text-left px-3 py-2">Urgency</th>
                  <th className="text-left px-3 py-2">PR status</th>
                  <th className="text-right px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-warning/30">
                {awaiting.map((p) => (
                  <tr key={p.id}>
                    <td className="px-3 py-2 font-mono text-xs">
                      <Link
                        href={`/development-os/procurement/purchase-requests/${encodeURIComponent(p.requestCode)}`}
                        className="hover:underline"
                      >
                        {p.requestCode}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-sm">{p.materialName}</td>
                    <td className="px-3 py-2 text-xs">{p.requiredByDate}</td>
                    <td className="px-3 py-2">
                      <Badge tone={URGENCY_TONE[p.urgency] ?? "neutral"}>
                        {p.urgency}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone="info">{p.status}</Badge>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/development-os/procurement/purchase-requests/${encodeURIComponent(p.requestCode)}`}
                        className="text-xs underline underline-offset-4 text-ink hover:text-ink-secondary"
                      >
                        Add quote →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </DevelopmentShell>
  );
}
