import Link from "next/link";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { listDirectBookingDeposits } from "@/features/direct-booking/deposits";
import { adminDepositStatusLabel } from "@/features/direct-booking/deposits-pure";
import { ExpireDepositNowButton } from "@/components/direct-booking/reconcile-buttons";

export const metadata = { title: "Deposits" };
export const dynamic = "force-dynamic";

const LAB_TONE: Record<
  "info" | "success" | "warning" | "neutral" | "danger",
  "info" | "ok" | "warn" | "soft" | "danger"
> = {
  info: "info",
  success: "ok",
  warning: "warn",
  neutral: "soft",
  danger: "danger",
};

export default async function DepositsPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  type DepStatus = Parameters<typeof adminDepositStatusLabel>[0];
  const status = (sp.status as DepStatus | undefined) || undefined;
  const rows = await listDirectBookingDeposits({ status, limit: 200 });
  return (
    <>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/direct-bookings">Direct bookings</Link> /{" "}
            <span>Deposits</span>
          </div>
          <h1>Direct booking deposits</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Each deposit is the gate that lets a confirmed booking issue. Manual
            stub today; future Stripe / Xendit integrations are additive.
          </p>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Catalog · {rows.length} deposits</div>
        <Card padding="none" overflowHidden>
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Code</th>
                <th scope="col">Request</th>
                <th scope="col" className="num">Amount</th>
                <th scope="col" className="num">Balance due</th>
                <th scope="col">Expires</th>
                <th scope="col">Status</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-ink-tertiary">
                    No deposits yet.
                  </td>
                </tr>
              )}
              {rows.map(({ deposit, requestCode }) => {
                const lab = adminDepositStatusLabel(deposit.status as DepStatus);
                const isPending =
                  deposit.status === "pending" ||
                  deposit.status === "draft" ||
                  deposit.status === "requires_action";
                const isExpired =
                  deposit.expiresAt &&
                  deposit.expiresAt.getTime() <= Date.now();
                return (
                  <tr key={deposit.id}>
                    <td className="mono text-[12px]">
                      <Link
                        href={`/dashboard/direct-bookings/deposits/${deposit.id}`}
                        className="text-ink hover:text-terra"
                      >
                        {deposit.depositCode}
                      </Link>
                    </td>
                    <td className="mono text-[12px]">{requestCode ?? "—"}</td>
                    <td className="num mono text-[12px]">
                      {(deposit.amountMinor / 100n).toString()}.
                      {String(deposit.amountMinor % 100n).padStart(2, "0")}{" "}
                      {deposit.currency}
                    </td>
                    <td className="num mono text-[12px]">
                      {(deposit.balanceDueMinor / 100n).toString()}.
                      {String(deposit.balanceDueMinor % 100n).padStart(2, "0")}
                    </td>
                    <td className="mono text-[11px] text-ink-tertiary">
                      {deposit.expiresAt?.toISOString() ?? "—"}
                      {isPending && isExpired && (
                        <HandoffBadge tone="warn">expired</HandoffBadge>
                      )}
                    </td>
                    <td>
                      <HandoffBadge tone={LAB_TONE[lab.tone]}>
                        {lab.label}
                      </HandoffBadge>
                    </td>
                    <td>
                      {isPending && <ExpireDepositNowButton id={deposit.id} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}
