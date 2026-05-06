import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { MetricCard } from "@/components/ui/metric-card";
import {
  getOwnerRevenueMetrics,
  listOwnerRevenueSourceMonthly,
} from "@/features/owner-bookings/services";
import { listOwnerIdsForCurrentUser } from "@/features/notifications/services";
import {
  summarizeOwnerRevenueSourceMix,
  totalNetOwnerEffectMinor,
  type RevenueSourceMonthlyRow,
} from "@/features/owner-bookings/revenue-pure";
import { formatMoneyMinor, calculateAdrMinor } from "@/lib/money";

export const metadata = { title: "Revenue transparency" };
export const dynamic = "force-dynamic";

export default async function OwnerRevenuePage() {
  const ownerIds = await listOwnerIdsForCurrentUser();
  if (ownerIds.length === 0) {
    return (
      <div className="flex flex-col gap-10">
        <PageHeader
          breadcrumbs={[{ label: "Revenue" }]}
          title="Revenue transparency"
          description="No villas linked to your account yet."
        />
      </div>
    );
  }
  // Aggregate across every owner the user is granted access to.
  let monthly: RevenueSourceMonthlyRow[] = [];
  let metricsCurrency: string | null = null;
  let totalGross = 0n;
  let totalNet = 0n;
  let bookingCount = 0;
  let occupiedNights = 0;
  for (const ownerId of ownerIds) {
    const rows = await listOwnerRevenueSourceMonthly(ownerId);
    monthly = monthly.concat(rows);
    const m = await getOwnerRevenueMetrics(ownerId);
    if (!metricsCurrency) metricsCurrency = m.currency;
    totalGross += m.totalGrossMinor;
    totalNet += m.totalNetEffectMinor;
    bookingCount += m.bookingCount;
    occupiedNights += m.occupiedNights;
  }
  const currency = metricsCurrency ?? "USD";
  const sourceMix = summarizeOwnerRevenueSourceMix(monthly, currency);
  const adr =
    occupiedNights > 0 ? calculateAdrMinor(totalGross, occupiedNights) : 0n;

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[{ label: "Revenue" }]}
        title="Revenue transparency"
        description="Where your villa revenue came from across direct bookings, OTAs, owner stays, and guest services. Owner statements remain the canonical record; this page makes the source mix legible at a glance."
      />
      <div className="rounded-md border border-line-soft bg-canvas px-5 py-4 text-xs text-ink-secondary leading-relaxed">
        <span className="font-medium text-ink">Read this view as:</span> a
        revenue-source breakdown, not a ledger. Money is shown in IDR (Rupiah)
        only — currency conversion is not applied yet. The owner statement
        remains the legal / accounting record once issued and approved.
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          label="Gross revenue"
          value={formatMoneyMinor(totalGross, currency)}
        />
        <MetricCard
          label="Net owner effect"
          value={formatMoneyMinor(totalNet, currency)}
        />
        <MetricCard label="Bookings" value={String(bookingCount)} />
        <MetricCard label="Occupied nights" value={String(occupiedNights)} />
      </div>
      <Section
        eyebrow="Source mix"
        title="Direct vs OTA vs other"
        description="Direct bookings carry no OTA commission but still include payment, admin, or management fees that may appear on your statement."
      >
        {sourceMix.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-8 text-sm text-ink-tertiary">
            No revenue rows yet for this period.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {sourceMix.map((s) => (
              <div
                key={s.bucket}
                className="rounded-md border border-line-soft bg-surface p-5 flex flex-col gap-2"
              >
                <div className="text-label">{s.label}</div>
                <div className="text-display text-[24px] font-medium tabular-nums">
                  {formatMoneyMinor(s.netOwnerEffectMinor, currency)}
                </div>
                <div className="text-xs text-ink-tertiary">
                  {s.bookingCount} booking{s.bookingCount === 1 ? "" : "s"} ·{" "}
                  {s.occupiedNights} night{s.occupiedNights === 1 ? "" : "s"}
                </div>
                <div className="text-[11px] text-ink-tertiary">
                  ADR{" "}
                  {s.occupiedNights > 0
                    ? formatMoneyMinor(s.averageRevenuePerNightMinor, currency)
                    : "—"}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
      <Section
        eyebrow="Monthly buckets"
        title="By month and source"
        description="One row per month / source. Check-in date determines the bucket."
      >
        {monthly.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-8 text-sm text-ink-tertiary">
            No bucket rows. Run the projection rebuild from the admin panel to seed.
          </p>
        ) : (
          <div className="rounded-md border border-line-soft bg-surface overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-canvas/50 text-left">
                <tr className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                  <th className="px-4 py-3">Month</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Gross</th>
                  <th className="px-4 py-3">Net effect</th>
                  <th className="px-4 py-3">Nights</th>
                </tr>
              </thead>
              <tbody>
                {monthly.map((r, i) => (
                  <tr
                    key={`${r.periodMonth}-${r.sourceType}-${i}`}
                    className="border-t border-line-soft"
                  >
                    <td className="px-4 py-3 font-mono tabular-nums text-xs">
                      {r.periodMonth.slice(0, 7)}
                    </td>
                    <td className="px-4 py-3 text-xs">{r.sourceType}</td>
                    <td className="px-4 py-3 font-mono tabular-nums text-xs">
                      {formatMoneyMinor(r.grossRevenueMinor, r.currency)}
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums text-xs">
                      {formatMoneyMinor(r.netOwnerEffectMinor, r.currency)}
                    </td>
                    <td className="px-4 py-3 text-xs">{r.occupiedNights}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-ink-tertiary">
          Total monthly net owner effect:{" "}
          {formatMoneyMinor(totalNetOwnerEffectMinor(monthly, currency), currency)}.
          ADR (gross / occupied nights):{" "}
          {occupiedNights > 0 ? formatMoneyMinor(adr, currency) : "—"}.
        </p>
      </Section>
      <p className="text-xs text-ink-tertiary">
        Statements are the canonical financial record; revenue projections on
        this page are for operational transparency. Currency conversion is not
        applied in this view yet — original currencies are shown as posted. Use{" "}
        <Link href="/owner/statements" className="underline">
          your statements
        </Link>{" "}
        for the canonical net payout.
      </p>
    </div>
  );
}
