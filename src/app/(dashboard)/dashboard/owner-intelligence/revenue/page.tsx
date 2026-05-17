import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { DashboardKpi} from "@/components/ui/primitives";
import { listOwnerRevenueSourceMonthly } from "@/features/owner-bookings/services";
import { listOwnerVillasForCurrentUser } from "@/features/owner-intelligence/calendar-services";
import {
  summarizeOwnerRevenueSourceMix,
  totalNetOwnerEffectMinor,
  type RevenueSourceMonthlyRow,
} from "@/features/owner-bookings/revenue-pure";
import { RebuildMonthlyButton } from "@/components/owner-bookings/projection-buttons";
import { formatMoneyMinor } from "@/lib/money";

export const metadata = { title: "Owner revenue source mix" };
export const dynamic = "force-dynamic";

export default async function AdminOwnerRevenueMixPage() {
  // Aggregate across every owner the admin has access to (which, for
  // internal users, means every active owner via RLS bypass).
  const villas = await listOwnerVillasForCurrentUser();
  const ownerIds = Array.from(new Set(villas.map((v) => v.ownerId)));
  let monthly: RevenueSourceMonthlyRow[] = [];
  for (const ownerId of ownerIds) {
    monthly = monthly.concat(
      await listOwnerRevenueSourceMonthly(ownerId),
    );
  }
  const currency = monthly[0]?.currency ?? "USD";
  const sourceMix = summarizeOwnerRevenueSourceMix(monthly, currency);
  const totalNet = totalNetOwnerEffectMinor(monthly, currency);
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Owner intelligence", href: "/dashboard/owner-intelligence" },
          { label: "Revenue source mix" },
        ]}
        title="Owner revenue source mix"
        description="Direct vs OTA vs other across every owner. Use this view to verify the projection before owners see it."
        actions={<RebuildMonthlyButton />}
      />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <DashboardKpi
          label="Net owner effect"
          value={formatMoneyMinor(totalNet, currency)}
          status="neutral"
          hint="Across every owner in scope"
        />
        <DashboardKpi
          label="Owners"
          value={String(ownerIds.length)}
          status="neutral"
        />
        <DashboardKpi
          label="Bucket rows"
          value={String(monthly.length)}
          status={monthly.length === 0 ? "warn" : "neutral"}
          hint={monthly.length === 0 ? "Run rebuild to seed" : undefined}
        />
        <DashboardKpi
          label="Source buckets"
          value={String(sourceMix.length)}
          status="neutral"
          hint="direct / OTA / owner-stay / etc."
        />
      </div>
      <Section eyebrow="Source mix" title="Per source totals">
        <div className="rounded-md border border-line-soft bg-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-canvas/50 text-left">
              <tr className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Gross</th>
                <th className="px-4 py-3">Deductions</th>
                <th className="px-4 py-3">Net effect</th>
                <th className="px-4 py-3">Bookings</th>
                <th className="px-4 py-3">Nights</th>
                <th className="px-4 py-3">ADR</th>
              </tr>
            </thead>
            <tbody>
              {sourceMix.map((s) => (
                <tr key={s.bucket} className="border-t border-line-soft">
                  <td className="px-4 py-3 text-xs">{s.label}</td>
                  <td className="px-4 py-3 font-mono tabular-nums text-xs">
                    {formatMoneyMinor(s.grossRevenueMinor, currency)}
                  </td>
                  <td className="px-4 py-3 font-mono tabular-nums text-xs">
                    {formatMoneyMinor(s.deductionsMinor, currency)}
                  </td>
                  <td className="px-4 py-3 font-mono tabular-nums text-xs">
                    {formatMoneyMinor(s.netOwnerEffectMinor, currency)}
                  </td>
                  <td className="px-4 py-3 text-xs">{s.bookingCount}</td>
                  <td className="px-4 py-3 text-xs">{s.occupiedNights}</td>
                  <td className="px-4 py-3 font-mono tabular-nums text-xs">
                    {s.occupiedNights > 0
                      ? formatMoneyMinor(
                          s.averageRevenuePerNightMinor,
                          currency,
                        )
                      : "—"}
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
