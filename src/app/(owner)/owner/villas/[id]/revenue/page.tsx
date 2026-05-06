import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { MetricCard } from "@/components/ui/metric-card";
import {
  getOwnerRevenueMetrics,
  listOwnerRevenueSourceMonthly,
} from "@/features/owner-bookings/services";
import { listOwnerVillasForCurrentUser } from "@/features/owner-intelligence/calendar-services";
import {
  summarizeOwnerRevenueSourceMix,
} from "@/features/owner-bookings/revenue-pure";
import { formatMoneyMinor } from "@/lib/money";

export const metadata = { title: "Villa revenue" };
export const dynamic = "force-dynamic";

export default async function OwnerVillaRevenuePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const villas = await listOwnerVillasForCurrentUser();
  const villa = villas.find((v) => v.villaId === id);
  if (!villa) notFound();

  const monthly = await listOwnerRevenueSourceMonthly(villa.ownerId, {
    villaId: id,
  });
  const metrics = await getOwnerRevenueMetrics(villa.ownerId, { villaId: id });
  const currency = metrics.currency ?? "USD";
  const sourceMix = summarizeOwnerRevenueSourceMix(monthly, currency);

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Villas", href: "/owner/villas" },
          { label: villa.villaName ?? villa.villaCode ?? "Villa" },
          { label: "Revenue" },
        ]}
        title={`${villa.villaName ?? villa.villaCode ?? "Villa"} — revenue`}
        description="Per-villa direct vs OTA breakdown across the rolling window."
      />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          label="Gross"
          value={formatMoneyMinor(metrics.totalGrossMinor, currency)}
        />
        <MetricCard
          label="Net effect"
          value={formatMoneyMinor(metrics.totalNetEffectMinor, currency)}
        />
        <MetricCard label="Bookings" value={String(metrics.bookingCount)} />
        <MetricCard label="Nights" value={String(metrics.occupiedNights)} />
      </div>
      <Section eyebrow="Source mix" title="Direct vs OTA">
        {sourceMix.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-8 text-sm text-ink-tertiary">
            No revenue rows yet for this villa.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {sourceMix.map((s) => (
              <div
                key={s.bucket}
                className="rounded-md border border-line-soft bg-surface p-5 flex flex-col gap-2"
              >
                <div className="text-label">{s.label}</div>
                <div className="text-display text-[22px] font-medium tabular-nums">
                  {formatMoneyMinor(s.netOwnerEffectMinor, currency)}
                </div>
                <div className="text-xs text-ink-tertiary">
                  {s.bookingCount} booking{s.bookingCount === 1 ? "" : "s"} ·{" "}
                  {s.occupiedNights} night{s.occupiedNights === 1 ? "" : "s"}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
