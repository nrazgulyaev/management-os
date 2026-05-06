import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
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

export const metadata = { title: "Owner booking projection" };
export const dynamic = "force-dynamic";

const STATUS_TONES: Record<
  OwnerBookingPublicStatus,
  "neutral" | "info" | "warning" | "success" | "danger" | "gold" | "accent"
> = {
  inquiry: "neutral",
  under_review: "info",
  deposit_pending: "warning",
  confirmed: "info",
  in_house: "success",
  completed: "success",
  cancelled: "neutral",
  expired: "neutral",
  blocked: "neutral",
  maintenance: "warning",
  owner_stay: "accent",
};

export default async function AdminOwnerBookingProjectionPage() {
  const summaries = await listOwnerBookingSummariesForCurrentUser();
  const recent = summaries.slice(0, 200);
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Owner intelligence", href: "/dashboard/owner-intelligence" },
          { label: "Booking projection" },
        ]}
        title="Owner booking projection"
        description="Owner-safe projection table that backs /owner/bookings, /owner/calendar, and /owner/revenue. Rebuild after manual booking edits or finance reconciliation events."
        actions={<RebuildAllProjectionsButton />}
      />
      <Section
        eyebrow="Recent rows"
        title={`${summaries.length} projection rows`}
        description="Sorted by check-in (most recent first). Statement linkage shown when issued/approved/paid."
      >
        <div className="rounded-md border border-line-soft bg-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-canvas/50 text-left">
              <tr className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                <th className="px-4 py-3">Owner / villa</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Dates</th>
                <th className="px-4 py-3">Revenue</th>
                <th className="px-4 py-3">Statement</th>
                <th className="px-4 py-3">Updated</th>
                <th className="px-4 py-3">Rebuild</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {recent.map((s) => (
                <tr key={s.id} className="border-t border-line-soft">
                  <td className="px-4 py-3">
                    <div className="text-sm text-ink">
                      {s.villaName ?? s.villaCode ?? "—"}
                    </div>
                    <div className="text-[11px] text-ink-tertiary">
                      Owner {s.ownerId.slice(0, 8)}…
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs">{s.ownerLabel}</td>
                  <td className="px-4 py-3">
                    <Badge tone={STATUS_TONES[s.publicStatus]}>
                      {publicStatusLabel(s.publicStatus)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 font-mono tabular-nums text-xs">
                    {s.checkIn} → {s.checkOut}
                  </td>
                  <td className="px-4 py-3 font-mono tabular-nums text-xs">
                    {s.revenuePosted && s.ownerRevenueMinor !== null && s.currency
                      ? formatMoneyMinor(s.ownerRevenueMinor, s.currency)
                      : s.totalAmountMinor !== null && s.currency
                        ? `${formatMoneyMinor(s.totalAmountMinor, s.currency)} (est)`
                        : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs">
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
                  <td className="px-4 py-3 text-[11px] text-ink-tertiary">
                    {s.sourceUpdatedAt
                      ? new Date(s.sourceUpdatedAt)
                          .toISOString()
                          .slice(0, 10)
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
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
                  <td className="px-4 py-3 text-right">
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
        </div>
      </Section>
    </div>
  );
}
