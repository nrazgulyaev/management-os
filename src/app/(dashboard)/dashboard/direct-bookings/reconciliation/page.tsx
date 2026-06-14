import Link from "next/link";
import { Kpi, HandoffBadge } from "@/components/dashboard/primitives";
import {
  getReconciliationMetrics,
  listDirectBookingFinanceLinks,
} from "@/features/direct-booking/finance-reconciliation";
import { directBookingFinanceStatusLabel } from "@/features/direct-booking/finance-pure";
import { ReconcilePendingButton } from "@/components/direct-booking/reconcile-buttons";

export const metadata = { title: "Direct booking reconciliation" };
export const dynamic = "force-dynamic";

/** Map the finance status-label tones onto handoff badge tones. */
const BADGE_TONE: Record<
  "info" | "success" | "warning" | "neutral" | "danger",
  "info" | "ok" | "warn" | "soft" | "danger"
> = {
  info: "info",
  success: "ok",
  warning: "warn",
  neutral: "soft",
  danger: "danger",
};

export default async function ReconciliationHub({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  type LinkStatus = Parameters<typeof directBookingFinanceStatusLabel>[0];
  const status = (sp.status as LinkStatus | undefined) || undefined;
  const [metrics, rows] = await Promise.all([
    getReconciliationMetrics(),
    listDirectBookingFinanceLinks({ status, limit: 200 }),
  ]);
  return (
    <div className="flex flex-col gap-10">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/direct-bookings">Direct bookings</Link> /{" "}
            <span>Reconciliation</span>
          </div>
          <h1>Direct booking reconciliation</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Idempotent finance bridge per request: deposit + booking + revenue
            line + statement period.
          </p>
        </div>
        <div className="actions">
          <ReconcilePendingButton />
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi
          label="Converted but unposted"
          value={String(metrics.unposted)}
          tone={metrics.unposted > 0 ? "accent" : undefined}
        />
        <Kpi label="Posted revenue" value={String(metrics.posted)} />
        <Kpi
          label="Skipped (locked period)"
          value={String(metrics.skippedLocked)}
          tone={metrics.skippedLocked > 0 ? "accent" : undefined}
        />
        <Kpi
          label="Failed"
          value={String(metrics.failed)}
          tone={metrics.failed > 0 ? "accent" : undefined}
        />
        <Kpi
          label="Balance due (posted)"
          value={`${(metrics.totalBalanceDueMinor / 100n).toString()}.${String(metrics.totalBalanceDueMinor % 100n).padStart(2, "0")} ${metrics.currency ?? ""}`}
        />
      </div>
      <div>
        <div className="label mb-2.5">{`${rows.length} finance links`}</div>
        <table className="data">
          <thead>
            <tr>
              <th scope="col">Code</th>
              <th scope="col">Request</th>
              <th scope="col">Booking</th>
              <th scope="col" className="num">Gross</th>
              <th scope="col" className="num">Balance due</th>
              <th scope="col">Status</th>
              <th scope="col">Posted</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-ink-3">
                  No finance links yet. Click "Reconcile pending" to sweep
                  converted requests.
                </td>
              </tr>
            )}
            {rows.map(({ link, requestCode, bookingCode }) => {
              const lab = directBookingFinanceStatusLabel(
                link.status as LinkStatus,
              );
              return (
                <tr key={link.id}>
                  <td className="mono text-[12px]">
                    <Link
                      href={`/dashboard/direct-bookings/reconciliation/${link.id}`}
                      className="text-ink hover:text-terra"
                    >
                      {link.linkCode}
                    </Link>
                  </td>
                  <td className="mono text-[12px]">{requestCode ?? "—"}</td>
                  <td className="mono text-[12px]">{bookingCode ?? "—"}</td>
                  <td className="num mono text-[12px]">
                    {(link.grossAmountMinor / 100n).toString()}.
                    {String(link.grossAmountMinor % 100n).padStart(2, "0")}{" "}
                    {link.currency}
                  </td>
                  <td className="num mono text-[12px]">
                    {(link.balanceDueMinor / 100n).toString()}.
                    {String(link.balanceDueMinor % 100n).padStart(2, "0")}
                  </td>
                  <td>
                    <HandoffBadge tone={BADGE_TONE[lab.tone]}>
                      {lab.label}
                    </HandoffBadge>
                  </td>
                  <td className="mono text-[11px] text-ink-3">
                    {link.postedAt?.toISOString() ?? "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink-tertiary">
        Owner-side projection of these bookings lives at{" "}
        <Link
          href="/dashboard/owner-intelligence/bookings"
          className="underline"
        >
          owner intelligence → booking projection
        </Link>
        . Owners never see the raw finance link rows; they see only the
        owner-safe summary backed by it.
      </p>
    </div>
  );
}
