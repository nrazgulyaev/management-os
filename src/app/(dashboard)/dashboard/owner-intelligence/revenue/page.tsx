import Link from "next/link";
import { Kpi, Card } from "@/components/dashboard/primitives";
import { listOwnerRevenueSourceMonthlyForOrg } from "@/features/owner-bookings/services";
import { listOwners } from "@/features/owners/services";
import {
  summarizeOwnerRevenueSourceMix,
  totalNetOwnerEffectMinor,
  type RevenueSourceMonthlyRow,
} from "@/features/owner-bookings/revenue-pure";
import { RebuildMonthlyButton } from "@/components/owner-bookings/projection-buttons";
import { formatMoneyMinor } from "@/lib/money";
import { requireCabinetAccess } from "@/features/keystone/access";
import { CabinetGate } from "@/components/keystone/cabinet-gate";

export const metadata = { title: "Owner revenue source mix" };
export const dynamic = "force-dynamic";

export default async function AdminOwnerRevenueMixPage() {
  const { allowed } = await requireCabinetAccess("owners");
  if (!allowed) return <CabinetGate cabinet="Owner intelligence" />;
  // Aggregate across every owner in the operator's org. `listOwners()` is
  // org-scoped (owners.organization_id via requireOrgId), so the monthly
  // rows below stay org-bounded.
  const owners = await listOwners();
  const monthly: RevenueSourceMonthlyRow[] =
    await listOwnerRevenueSourceMonthlyForOrg();
  const ownerIds = owners.map((o) => o.id);
  const currency = monthly[0]?.currency ?? "USD";
  const sourceMix = summarizeOwnerRevenueSourceMix(monthly, currency);
  const totalNet = totalNetOwnerEffectMinor(monthly, currency);
  return (
    <div className="flex flex-col gap-10">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/owner-intelligence">Owner intelligence</Link>{" "}
            / <span>Revenue source mix</span>
          </div>
          <h1>Owner revenue source mix</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Direct vs OTA vs other across every owner. Use this view to verify
            the projection before owners see it.
          </p>
        </div>
        <div className="actions">
          <RebuildMonthlyButton />
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi
          label="Net owner effect"
          value={formatMoneyMinor(totalNet, currency)}
          sub="Across every owner in scope"
        />
        <Kpi
          label="Owners"
          value={String(ownerIds.length)}
        />
        <Kpi
          label="Bucket rows"
          value={String(monthly.length)}
          tone={monthly.length === 0 ? "warn" : undefined}
          sub={monthly.length === 0 ? "Run rebuild to seed" : undefined}
        />
        <Kpi
          label="Source buckets"
          value={String(sourceMix.length)}
          sub="direct / OTA / owner-stay / etc."
        />
      </div>
      <div>
        <div className="label mb-2.5">Source mix · per source totals</div>
        <Card padding="none" overflowHidden>
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Source</th>
                <th scope="col" className="num">Gross</th>
                <th scope="col" className="num">Deductions</th>
                <th scope="col" className="num">Net effect</th>
                <th scope="col" className="num">Bookings</th>
                <th scope="col" className="num">Nights</th>
                <th scope="col" className="num">ADR</th>
              </tr>
            </thead>
            <tbody>
              {sourceMix.map((s) => (
                <tr key={s.bucket}>
                  <td className="text-xs">{s.label}</td>
                  <td className="num mono text-xs">
                    {formatMoneyMinor(s.grossRevenueMinor, currency)}
                  </td>
                  <td className="num mono text-xs">
                    {formatMoneyMinor(s.deductionsMinor, currency)}
                  </td>
                  <td className="num mono text-xs">
                    {formatMoneyMinor(s.netOwnerEffectMinor, currency)}
                  </td>
                  <td className="num text-xs">{s.bookingCount}</td>
                  <td className="num text-xs">{s.occupiedNights}</td>
                  <td className="num mono text-xs">
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
        </Card>
      </div>
    </div>
  );
}
