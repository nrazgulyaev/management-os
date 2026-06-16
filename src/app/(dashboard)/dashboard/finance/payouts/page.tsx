import Link from "next/link";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { DbStatusNotice } from "@/components/admin/db-status";
import { listPayoutBatches, listPayoutLines } from "@/features/finance/services";
import { listOwners } from "@/features/owners/services";
import { PayoutBatchAddButton } from "@/components/finance/payout-batch-add-button";
import { PayoutLineAddButton } from "@/components/finance/payout-line-add-button";
import { PayoutLineStatusButtons } from "@/components/finance/payout-line-status-buttons";
import { formatMoneyMinor } from "@/lib/money";

export const metadata = { title: "Payouts" };
export const dynamic = "force-dynamic";

const BATCH_TONE: Record<string, "ok" | "info" | "warn" | undefined> = {
  paid: "ok",
  approved: "info",
  draft: "warn",
  cancelled: undefined,
};

const LINE_TONE: Record<string, "ok" | "warn" | "danger" | undefined> = {
  paid: "ok",
  pending: "warn",
  approved: "warn",
  failed: "danger",
  cancelled: undefined,
};

const LINE_LABEL: Record<string, string> = {
  paid: "Settled",
  pending: "Queued",
  approved: "Queued",
  failed: "Failed",
  cancelled: "Cancelled",
};

export default async function PayoutsPage() {
  const [batches, lines, owners] = await Promise.all([
    listPayoutBatches(),
    listPayoutLines(),
    listOwners(),
  ]);
  const ungrouped = lines.filter((l) => !l.payoutBatchId);

  const ownerOptions = owners
    .filter((o) => o.status !== "archived")
    .map((o) => ({ id: o.id, label: o.displayName }));
  const batchOptions = batches.map((b) => ({
    id: b.id,
    label: `${b.batchCode} · ${b.status} · ${b.currency}`,
    // Lets the line form lock its currency to the batch currency.
    currency: b.currency,
  }));

  return (
    <>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard">Dashboard</Link> /{" "}
            <Link href="/dashboard/finance">Finance</Link> / <span>Payouts</span>
          </div>
          <h1>Payouts</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Post-approval cashflow. Owner payouts schedule from approved
            statements and group into batches. Wire status updates from bank
            confirmations.
          </p>
        </div>
        <div className="actions">
          <PayoutLineAddButton owners={ownerOptions} batches={batchOptions} />
          <PayoutBatchAddButton />
        </div>
      </div>

      <DbStatusNotice />

      <h2 className="display text-[30px] mt-[18px] mb-3.5 font-normal">Batches</h2>
      <Card padding="none" overflowHidden className="mb-[18px]">
        {batches.length === 0 ? (
          <p className="p-5 text-[13px] text-ink-3 italic m-0">
            No payout batches yet.
          </p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Code</th>
                <th scope="col">Period</th>
                <th scope="col">Status</th>
                <th scope="col" className="num">Lines</th>
                <th scope="col" className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id}>
                  <td className="mono text-[12px] text-ink">{b.batchCode}</td>
                  <td className="num text-[12px] text-ink-3">
                    {b.periodStart} → {b.periodEnd}
                  </td>
                  <td>
                    <HandoffBadge tone={BATCH_TONE[b.status]}>{b.status}</HandoffBadge>
                  </td>
                  <td className="num">{b.lineCount}</td>
                  <td className="num text-terra font-medium">
                    {formatMoneyMinor(b.totalAmountMinor, b.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <h2 className="display text-[30px] mt-8 mb-3.5 font-normal">
        Unbatched payout <em>lines</em>
      </h2>
      <Card padding="none" overflowHidden className="mb-[18px]">
        {ungrouped.length === 0 ? (
          <p className="p-5 text-[13px] text-ink-3 italic m-0">
            No unbatched lines.
          </p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Owner</th>
                <th scope="col">Reference</th>
                <th scope="col">Wire date</th>
                <th scope="col">Status</th>
                <th scope="col" className="num">Amount</th>
                <th scope="col" className="num">Actions</th>
              </tr>
            </thead>
            <tbody>
              {ungrouped.map((l) => (
                <tr key={l.id}>
                  <td className="text-ink">{l.ownerName}</td>
                  <td className="mono text-[12px] text-ink-3">{l.reference ?? "—"}</td>
                  <td className="mono text-[12px] text-ink-3">{l.scheduledFor ?? "—"}</td>
                  <td>
                    <HandoffBadge tone={LINE_TONE[l.status]}>
                      {LINE_LABEL[l.status] ?? l.status}
                    </HandoffBadge>
                  </td>
                  <td className="num text-terra font-medium">
                    {formatMoneyMinor(l.amountMinor, l.currency)}
                  </td>
                  <td className="num">
                    <PayoutLineStatusButtons lineId={l.id} status={l.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
