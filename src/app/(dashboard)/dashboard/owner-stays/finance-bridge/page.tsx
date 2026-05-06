import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/ui/metric-card";
import { Section } from "@/components/ui/section";
import { listFinanceLinks } from "@/features/owner-stays/finance-bridge";
import { listOwnerStayRequests } from "@/features/owner-stays/services";
import { BridgePendingButton } from "@/components/owner-stays/bridge-pending-button";

export const metadata = { title: "Owner stay finance bridge" };
export const dynamic = "force-dynamic";

const STATUS_TONES: Record<string, "neutral" | "info" | "warning" | "success" | "danger"> = {
  pending: "info",
  bridged: "success",
  skipped_no_charge: "neutral",
  skipped_locked_period: "warning",
  failed: "danger",
  reversed: "neutral",
};

function formatMoney(minor: number, currency: string) {
  return `${(minor / 100).toFixed(2)} ${currency}`;
}

export default async function FinanceBridgePage() {
  const [bridged, skippedLocked, skippedNoCharge, failed, pendingApproved] =
    await Promise.all([
      listFinanceLinks({ status: "bridged", limit: 50 }),
      listFinanceLinks({ status: "skipped_locked_period", limit: 50 }),
      listFinanceLinks({ status: "skipped_no_charge", limit: 50 }),
      listFinanceLinks({ status: "failed", limit: 50 }),
      listOwnerStayRequests({
        status: ["approved", "completed"],
        limit: 200,
      }),
    ]);
  const pendingBridge = pendingApproved.filter(
    (r) =>
      r.status === "approved" || r.status === "completed",
  );

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Owner stays", href: "/dashboard/owner-stays" },
          { label: "Finance bridge" },
        ]}
        title="Owner stay finance bridge"
        description="Bridge approved/completed owner stays into management_fee_lines (compensation) + expense_lines (operational cost). Idempotent — re-running never duplicates rows. Locked statement periods are skipped automatically."
        actions={<BridgePendingButton />}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Approved / completed" value={String(pendingBridge.length)} />
        <MetricCard label="Bridged" value={String(bridged.length)} />
        <MetricCard
          label="Skipped — locked"
          value={String(skippedLocked.length)}
          accent={skippedLocked.length > 0}
        />
        <MetricCard
          label="Failed"
          value={String(failed.length)}
          accent={failed.length > 0}
        />
      </div>

      <Section eyebrow="Pending" title={`${pendingBridge.length} approved/completed stays`}>
        {pendingBridge.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            No approved or completed owner stays awaiting the bridge.
          </p>
        ) : (
          <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-ink-tertiary text-[11px] uppercase tracking-widest">
                <tr>
                  <th className="text-left px-3 py-2">Owner</th>
                  <th className="text-left px-3 py-2">Villa</th>
                  <th className="text-left px-3 py-2">Dates</th>
                  <th className="text-right px-3 py-2">Owner charge</th>
                  <th className="text-left px-3 py-2">Bridge state</th>
                  <th className="text-right px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {pendingBridge.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2 text-ink font-medium">{r.ownerName ?? r.ownerId}</td>
                    <td className="px-3 py-2 text-ink-secondary">{r.villaCode ?? "—"}</td>
                    <td className="px-3 py-2 text-ink-tertiary tabular-nums">
                      {r.requestedStart} → {r.requestedEnd}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatMoney(r.estimatedTotalOwnerChargeMinor, r.currency)}
                    </td>
                    <td className="px-3 py-2 text-ink-tertiary text-xs">
                      {/* `financeBridgeStatus` lives on the request row */}
                      {/* but our row mapper doesn't surface it; admin can */}
                      {/* drill into the request detail to see the link state. */}
                      see request detail →
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/dashboard/owner-stays/requests/${r.id}`}
                        className="text-xs text-ink hover:underline underline-offset-4"
                      >
                        Detail →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section eyebrow="Bridged" title={`${bridged.length} rows`}>
        {bridged.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            No bridged rows yet.
          </p>
        ) : (
          <BridgeTable rows={bridged} statusTones={STATUS_TONES} />
        )}
      </Section>

      <Section
        eyebrow="Skipped — locked period"
        title={`${skippedLocked.length} rows`}
        description="Waiting for the statement period to reopen, or for an admin to record a finance_adjustment manually. Re-running the bridge will retry once the period is open again."
      >
        {skippedLocked.length === 0 ? (
          <p className="text-sm text-ink-tertiary">None.</p>
        ) : (
          <BridgeTable rows={skippedLocked} statusTones={STATUS_TONES} />
        )}
      </Section>

      <Section eyebrow="Skipped — no charge" title={`${skippedNoCharge.length} rows`}>
        {skippedNoCharge.length === 0 ? (
          <p className="text-sm text-ink-tertiary">None.</p>
        ) : (
          <BridgeTable rows={skippedNoCharge} statusTones={STATUS_TONES} />
        )}
      </Section>

      {failed.length > 0 && (
        <Section eyebrow="Failed" title={`${failed.length} rows`}>
          <BridgeTable rows={failed} statusTones={STATUS_TONES} />
        </Section>
      )}
    </div>
  );
}

function BridgeTable({
  rows,
  statusTones,
}: {
  rows: Awaited<ReturnType<typeof listFinanceLinks>>;
  statusTones: Record<string, "neutral" | "info" | "warning" | "success" | "danger">;
}) {
  return (
    <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/30 text-ink-tertiary text-[11px] uppercase tracking-widest">
          <tr>
            <th className="text-left px-3 py-2">Owner</th>
            <th className="text-left px-3 py-2">Villa</th>
            <th className="text-right px-3 py-2">Amount</th>
            <th className="text-left px-3 py-2">Status</th>
            <th className="text-left px-3 py-2">Reason</th>
            <th className="text-right px-3 py-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line-soft">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="px-3 py-2 text-ink font-medium">{r.ownerName ?? r.ownerId}</td>
              <td className="px-3 py-2 text-ink-secondary">{r.villaCode ?? "—"}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {(r.amountMinor / 100).toFixed(2)} {r.currency}
              </td>
              <td className="px-3 py-2">
                <Badge tone={statusTones[r.bridgeStatus] ?? "neutral"}>
                  {r.bridgeStatus.replace(/_/g, " ")}
                </Badge>
              </td>
              <td className="px-3 py-2 text-ink-tertiary text-xs">
                {r.reason ?? "—"}
              </td>
              <td className="px-3 py-2 text-right">
                <Link
                  href={`/dashboard/owner-stays/requests/${r.ownerStayRequestId}`}
                  className="text-xs text-ink hover:underline underline-offset-4"
                >
                  Request →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
