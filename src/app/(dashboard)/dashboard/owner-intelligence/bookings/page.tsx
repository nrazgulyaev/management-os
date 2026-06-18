import Link from "next/link";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { listOwnerBookingSummariesForCurrentUser } from "@/features/owner-bookings/services";
import {
  publicStatusLabel,
  type OwnerBookingPublicStatus,
} from "@/features/owner-bookings/calendar-pure";
import { formatMoneyMinor } from "@/lib/money";
import {
  RebuildAllProjectionsButton,
  RebuildBookingProjectionButton,
  RebuildDirectRequestProjectionButton,
} from "@/components/owner-bookings/projection-buttons";
import { requireCabinetAccess } from "@/features/keystone/access";
import { CabinetGate } from "@/components/keystone/cabinet-gate";

export const metadata = { title: "Owner booking projection" };
export const dynamic = "force-dynamic";

const STATUS_TONES: Record<
  OwnerBookingPublicStatus,
  "soft" | "info" | "warn" | "ok" | "danger" | "gold"
> = {
  inquiry: "soft",
  under_review: "info",
  deposit_pending: "warn",
  confirmed: "info",
  in_house: "ok",
  completed: "ok",
  cancelled: "soft",
  expired: "soft",
  blocked: "soft",
  maintenance: "warn",
  owner_stay: "gold",
};

export default async function AdminOwnerBookingProjectionPage() {
  const { allowed } = await requireCabinetAccess("owners");
  if (!allowed) return <CabinetGate cabinet="Owner intelligence" />;
  const summaries = await listOwnerBookingSummariesForCurrentUser();
  const recent = summaries.slice(0, 200);
  return (
    <div className="flex flex-col gap-10">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/owner-intelligence">Owner intelligence</Link>{" "}
            / <span>Booking projection</span>
          </div>
          <h1>Owner booking projection</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Owner-safe projection table that backs /owner/bookings,
            /owner/calendar, and /owner/revenue. Rebuild after manual booking
            edits or finance reconciliation events.
          </p>
        </div>
        <div className="actions">
          <RebuildAllProjectionsButton />
        </div>
      </div>
      <div>
        <div className="label mb-2.5">
          {summaries.length} projection rows · sorted by check-in (most recent
          first). Statement linkage shown when issued/approved/paid.
        </div>
        <Card padding="none" overflowHidden>
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Owner / villa</th>
                <th scope="col">Source</th>
                <th scope="col">Status</th>
                <th scope="col">Dates</th>
                <th scope="col" className="num">Revenue</th>
                <th scope="col">Statement</th>
                <th scope="col">Updated</th>
                <th scope="col">Rebuild</th>
                <th scope="col"></th>
              </tr>
            </thead>
            <tbody>
              {recent.map((s) => (
                <tr key={s.id}>
                  <td>
                    <div className="row-title">
                      {s.villaName ?? s.villaCode ?? "—"}
                    </div>
                    <div className="text-[11px] text-ink-tertiary">
                      Owner {s.ownerId.slice(0, 8)}…
                    </div>
                  </td>
                  <td className="text-xs">{s.ownerLabel}</td>
                  <td>
                    <HandoffBadge tone={STATUS_TONES[s.publicStatus]}>
                      {publicStatusLabel(s.publicStatus)}
                    </HandoffBadge>
                  </td>
                  <td className="mono text-xs">
                    {s.checkIn} → {s.checkOut}
                  </td>
                  <td className="num mono text-xs">
                    {s.revenuePosted && s.ownerRevenueMinor !== null && s.currency
                      ? formatMoneyMinor(s.ownerRevenueMinor, s.currency)
                      : s.totalAmountMinor !== null && s.currency
                        ? `${formatMoneyMinor(s.totalAmountMinor, s.currency)} (est)`
                        : "—"}
                  </td>
                  <td className="text-xs">
                    {s.statementHref ? (
                      <Link
                        href={s.statementHref}
                        className="text-ink hover:underline underline-offset-4"
                      >
                        Open →
                      </Link>
                    ) : s.revenuePosted ? (
                      <span className="text-info">Posted</span>
                    ) : (
                      <span className="text-ink-tertiary">—</span>
                    )}
                  </td>
                  <td className="text-[11px] text-ink-tertiary">
                    {s.sourceUpdatedAt
                      ? new Date(s.sourceUpdatedAt)
                          .toISOString()
                          .slice(0, 10)
                      : "—"}
                  </td>
                  <td>
                    {s.bookingId ? (
                      <RebuildBookingProjectionButton bookingId={s.bookingId} />
                    ) : s.directBookingRequestId ? (
                      <RebuildDirectRequestProjectionButton
                        requestId={s.directBookingRequestId}
                      />
                    ) : (
                      <span className="text-[11px] text-ink-tertiary">—</span>
                    )}
                  </td>
                  <td className="text-right">
                    <Link
                      href={`/dashboard/owner-intelligence/bookings/${s.id}`}
                      className="text-xs text-ink hover:underline underline-offset-4"
                    >
                      Open →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
