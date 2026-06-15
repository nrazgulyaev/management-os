import { Kpi } from "@/components/dashboard/primitives";

export function OwnerPerformanceSummary() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <Kpi label="YTD net payouts" value="Rp 684.2M" sub="+9.2% YoY" />
      <Kpi label="Annualized yield" value="11.4 %" sub="+0.8% vs plan" />
      <Kpi label="Occupancy YTD" value="85.1 %" sub="+3.2% YoY" />
      <Kpi label="Reserves balance" value="Rp 124.8M" sub="Reno + FF&E" />
    </div>
  );
}
