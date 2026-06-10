import Link from "next/link";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { listCheckinCheckoutRequests } from "@/features/front-office/services";
import { CheckinCheckoutRequestRowActions } from "@/components/front-office/request-row-actions";

export const metadata = { title: "Check-in / check-out requests" };
export const dynamic = "force-dynamic";

type FoTone = "ok" | "warn" | "danger" | "gold" | "info" | "ink" | "soft";

const STATUS_TONES: Record<string, FoTone> = {
  requested: "warn",
  reviewing: "info",
  approved: "ok",
  rejected: "danger",
  cancelled: "soft",
  completed: "ok",
};

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const rows = await listCheckinCheckoutRequests({
    status: sp.status || undefined,
    limit: 200,
  });

  return (
    <>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/front-office">Front office</Link> / <span>Requests</span>
          </div>
          <h1>Check-in / check-out requests</h1>
        </div>
      </div>

      <p className="mt-3 mb-7 text-[15px] text-ink-3 max-w-[680px]">
        Early check-in, late check-out, expected-checkout-time updates, and
        early-checkout notices. Approve, reject, or mark completed.
      </p>

      <div className="section-heading">
        <div className="eyebrow label">Inbox</div>
        <h2>{rows.length} requests</h2>
      </div>

      {rows.length === 0 ? (
        <p className="empty m-0 text-sm text-ink-3">No requests.</p>
      ) : (
        <Card padding="none" overflowHidden>
          <table className="data">
            <thead>
              <tr>
                <th>Booking</th>
                <th>Villa</th>
                <th>Type</th>
                <th>Requested time</th>
                <th>Status</th>
                <th className="num">Fee</th>
                <th className="num">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="row-title">{r.bookingCode ?? "—"}</td>
                  <td className="text-ink-2">{r.villaCode ?? "—"}</td>
                  <td className="text-ink-2">{r.requestType.replace(/_/g, " ")}</td>
                  <td className="num text-ink-3">
                    {r.requestedTime ? r.requestedTime.slice(0, 16).replace("T", " ") : "—"}
                  </td>
                  <td>
                    <HandoffBadge tone={STATUS_TONES[r.status] ?? "soft"}>{r.status}</HandoffBadge>
                  </td>
                  <td className="num text-ink-3">
                    {r.feeAmountMinor != null ? `${(r.feeAmountMinor / 100).toFixed(2)} ${r.currency ?? ""}` : "—"}
                  </td>
                  <td className="num">
                    <CheckinCheckoutRequestRowActions id={r.id} status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
