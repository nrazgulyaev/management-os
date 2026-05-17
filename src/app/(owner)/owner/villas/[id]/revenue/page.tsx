import { notFound } from "next/navigation";
import { SectionHeading, Kpi } from "@/components/dashboard/primitives";
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
      <SectionHeading
        eyebrow={`Portfolio · villas · ${villa.villaName ?? villa.villaCode ?? "Villa"} · revenue`}
        title={`${villa.villaName ?? villa.villaCode ?? "Villa"} — revenue`}
        subtitle="Per-villa direct vs OTA breakdown across the rolling window."
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 18 }}>
        <Kpi label="Gross" value={formatMoneyMinor(metrics.totalGrossMinor, currency)} />
        <Kpi label="Net effect" value={formatMoneyMinor(metrics.totalNetEffectMinor, currency)} tone="success" />
        <Kpi label="Bookings" value={String(metrics.bookingCount)} />
        <Kpi label="Nights" value={String(metrics.occupiedNights)} />
      </div>
      <section>
        <div className="label">Source mix</div>
        <h2 className="display" style={{ fontSize: 22, marginTop: 6, marginBottom: 14, fontWeight: 500 }}>
          Direct vs OTA
        </h2>
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
      </section>
    </div>
  );
}
