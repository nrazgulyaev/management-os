import { MetricCard } from "@/components/ui/metric-card";

export function OwnerPerformanceSummary() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <MetricCard
        label="YTD net payouts"
        value="Rp 684.2M"
        delta={{ value: 9.2, label: "YoY" }}
      />
      <MetricCard
        label="Annualized yield"
        value="11.4"
        unit="%"
        delta={{ value: 0.8, label: "vs plan" }}
      />
      <MetricCard
        label="Occupancy YTD"
        value="85.1"
        unit="%"
        delta={{ value: 3.2, label: "YoY" }}
      />
      <MetricCard label="Reserves balance" value="Rp 124.8M" hint="Reno + FF&E" />
    </div>
  );
}
