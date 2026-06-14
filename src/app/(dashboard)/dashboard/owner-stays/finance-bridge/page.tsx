import Link from "next/link";
import { Kpi, Card, HandoffBadge } from "@/components/dashboard/primitives";
import { listFinanceLinks } from "@/features/owner-stays/finance-bridge";
import { listOwnerStayRequests } from "@/features/owner-stays/services";
import { BridgePendingButton } from "@/components/owner-stays/bridge-pending-button";

export const metadata = { title: "Owner stay finance bridge" };
export const dynamic = "force-dynamic";

const STATUS_TONES: Record<string, "soft" | "info" | "warn" | "ok" | "danger"> = {
  pending: "info",
  bridged: "ok",
  skipped_no_charge: "soft",
  skipped_locked_period: "warn",
  failed: "danger",
  reversed: "soft",
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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/owner-stays">Owner stays</Link> /{" "}
            <span>Finance bridge</span>
          </div>
          <h1>Owner stay finance bridge</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Bridge approved/completed owner stays into management_fee_lines
            (compensation) + expense_lines (operational cost). Idempotent —
            re-running never duplicates rows. Locked statement periods are
            skipped automatically.
          </p>
        </div>
        <div className="actions">
          <BridgePendingButton />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Approved / completed" value={String(pendingBridge.length)} />
        <Kpi label="Bridged" value={String(bridged.length)} />
        <Kpi
          label="Skipped — locked"
          value={String(skippedLocked.length)}
          tone={skippedLocked.length > 0 ? "accent" : undefined}
        />
        <Kpi
          label="Failed"
          value={String(failed.length)}
          tone={failed.length > 0 ? "accent" : undefined}
        />
      </div>

      <div>
        <div className="label mb-2.5">
          Pending · {pendingBridge.length} approved/completed stays
        </div>
        {pendingBridge.length === 0 ? (
          <Card padding="default">
            <p className="text-[13px] text-ink-3 italic m-0">
              No approved or completed owner stays awaiting the bridge.
            </p>
          </Card>
        ) : (
          <Card padding="none" overflowHidden>
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Owner</th>
                  <th scope="col">Villa</th>
                  <th scope="col">Dates</th>
                  <th scope="col" className="num">Owner charge</th>
                  <th scope="col">Bridge state</th>
                  <th scope="col"></th>
                </tr>
              </thead>
              <tbody>
                {pendingBridge.map((r) => (
                  <tr key={r.id}>
                    <td className="row-title">{r.ownerName ?? r.ownerId}</td>
                    <td>{r.villaCode ?? "—"}</td>
                    <td className="tabular-nums">
                      {r.requestedStart} → {r.requestedEnd}
                    </td>
                    <td className="num">
                      {formatMoney(r.estimatedTotalOwnerChargeMinor, r.currency)}
                    </td>
                    <td className="text-ink-3 text-xs">
                      {/* `financeBridgeStatus` lives on the request row */}
                      {/* but our row mapper doesn't surface it; admin can */}
                      {/* drill into the request detail to see the link state. */}
                      see request detail →
                    </td>
                    <td className="text-right">
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
          </Card>
        )}
      </div>

      <div>
        <div className="label mb-2.5">Bridged · {bridged.length} rows</div>
        {bridged.length === 0 ? (
          <Card padding="default">
            <p className="text-[13px] text-ink-3 italic m-0">
              No bridged rows yet.
            </p>
          </Card>
        ) : (
          <BridgeTable rows={bridged} statusTones={STATUS_TONES} />
        )}
      </div>

      <div>
        <div className="label mb-2.5">
          Skipped — locked period · {skippedLocked.length} rows
        </div>
        <p className="text-[13px] text-ink-3 mt-2 mb-2.5 max-w-[680px]">
          Waiting for the statement period to reopen, or for an admin to record
          a finance_adjustment manually. Re-running the bridge will retry once
          the period is open again.
        </p>
        {skippedLocked.length === 0 ? (
          <p className="text-[13px] text-ink-3">None.</p>
        ) : (
          <BridgeTable rows={skippedLocked} statusTones={STATUS_TONES} />
        )}
      </div>

      <div>
        <div className="label mb-2.5">
          Skipped — no charge · {skippedNoCharge.length} rows
        </div>
        {skippedNoCharge.length === 0 ? (
          <p className="text-[13px] text-ink-3">None.</p>
        ) : (
          <BridgeTable rows={skippedNoCharge} statusTones={STATUS_TONES} />
        )}
      </div>

      {failed.length > 0 && (
        <div>
          <div className="label mb-2.5">Failed · {failed.length} rows</div>
          <BridgeTable rows={failed} statusTones={STATUS_TONES} />
        </div>
      )}
    </div>
  );
}

function BridgeTable({
  rows,
  statusTones,
}: {
  rows: Awaited<ReturnType<typeof listFinanceLinks>>;
  statusTones: Record<string, "soft" | "info" | "warn" | "ok" | "danger">;
}) {
  return (
    <Card padding="none" overflowHidden>
      <table className="data">
        <thead>
          <tr>
            <th scope="col">Owner</th>
            <th scope="col">Villa</th>
            <th scope="col" className="num">Amount</th>
            <th scope="col">Status</th>
            <th scope="col">Reason</th>
            <th scope="col"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="row-title">{r.ownerName ?? r.ownerId}</td>
              <td>{r.villaCode ?? "—"}</td>
              <td className="num">
                {(r.amountMinor / 100).toFixed(2)} {r.currency}
              </td>
              <td>
                <HandoffBadge tone={statusTones[r.bridgeStatus] ?? "soft"}>
                  {r.bridgeStatus.replace(/_/g, " ")}
                </HandoffBadge>
              </td>
              <td className="text-ink-3 text-xs">{r.reason ?? "—"}</td>
              <td className="text-right">
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
    </Card>
  );
}
