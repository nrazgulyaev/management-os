import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DbStatusNotice } from "@/components/admin/db-status";
import { listPayoutBatches, listPayoutLines } from "@/features/finance/services";
import { PayoutBatchAddButton } from "@/components/finance/payout-batch-add-button";
import { formatMoneyMinor } from "@/lib/money";

export const metadata = { title: "Payouts" };
export const dynamic = "force-dynamic";

export default async function PayoutsPage() {
  const batches = await listPayoutBatches();
  const lines = await listPayoutLines();
  const ungrouped = lines.filter((l) => !l.payoutBatchId);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[{ label: "Finance", href: "/dashboard/finance" }, { label: "Payouts" }]}
        title="Payouts"
        description="Owner payouts grouped into batches. No real payment processing in v3 — wires up in v8."
        actions={
          <div className="flex gap-2">
            <PayoutBatchAddButton />
          </div>
        }
      />
      <DbStatusNotice />

      <section>
        <h3 className="text-label mb-3">Batches</h3>
        <Table>
          <THead>
            <TR>
              <TH>Code</TH>
              <TH>Period</TH>
              <TH>Status</TH>
              <TH className="text-right">Lines</TH>
              <TH className="text-right">Total</TH>
            </TR>
          </THead>
          <TBody>
            {batches.length === 0 ? (
              <TR>
                <TD colSpan={5} className="text-center py-8 text-ink-tertiary">
                  No payout batches yet.
                </TD>
              </TR>
            ) : (
              batches.map((b) => (
                <TR key={b.id}>
                  <TD className="font-mono text-xs text-ink">{b.batchCode}</TD>
                  <TD className="text-sm text-ink-tertiary tabular-nums">
                    {b.periodStart} → {b.periodEnd}
                  </TD>
                  <TD>
                    <Badge tone={b.status === "paid" ? "success" : b.status === "approved" ? "info" : "neutral"}>
                      {b.status}
                    </Badge>
                  </TD>
                  <TDNum>{b.lineCount}</TDNum>
                  <TDNum>{formatMoneyMinor(b.totalAmountMinor, b.currency)}</TDNum>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </section>

      <section>
        <h3 className="text-label mb-3">Unbatched payout lines</h3>
        <Table>
          <THead>
            <TR>
              <TH>Owner</TH>
              <TH>Reference</TH>
              <TH>Status</TH>
              <TH className="text-right">Amount</TH>
            </TR>
          </THead>
          <TBody>
            {ungrouped.length === 0 ? (
              <TR>
                <TD colSpan={4} className="text-center py-8 text-ink-tertiary">
                  No unbatched lines.
                </TD>
              </TR>
            ) : (
              ungrouped.map((l) => (
                <TR key={l.id}>
                  <TD className="text-ink">{l.ownerName}</TD>
                  <TD className="text-xs text-ink-tertiary">{l.reference ?? "—"}</TD>
                  <TD>
                    <Badge tone={l.status === "paid" ? "success" : l.status === "pending" ? "warning" : "neutral"}>
                      {l.status}
                    </Badge>
                  </TD>
                  <TDNum>{formatMoneyMinor(l.amountMinor, l.currency)}</TDNum>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </section>
    </div>
  );
}
