import { MetricCard } from "@/components/ui/metric-card";
import { portfolioMetrics, revenueByChannel, monthlyRevenueStrip } from "@/lib/mock/metrics";

const dataToneClass: Record<string, string> = {
  emerald: "bg-data-emerald",
  gold: "bg-data-gold",
  sage: "bg-data-sage",
  stone: "bg-data-stone",
  terracotta: "bg-data-terracotta",
};

export function PortfolioOverview() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          label="Occupancy YTD"
          value={portfolioMetrics.occupancyYTD.value.toFixed(1)}
          unit="%"
          delta={{ value: portfolioMetrics.occupancyYTD.deltaYoY, label: "YoY" }}
        />
        <MetricCard
          label="ADR"
          value={`Rp ${(portfolioMetrics.adr.value / 100_000_000).toFixed(1)}M`}
          delta={{ value: portfolioMetrics.adr.deltaYoY, label: "YoY" }}
        />
        <MetricCard
          label="RevPAR"
          value={`Rp ${(portfolioMetrics.revpar.value / 100_000_000).toFixed(1)}M`}
          delta={{ value: portfolioMetrics.revpar.deltaYoY, label: "YoY" }}
        />
        <MetricCard
          label="Gross revenue MTD"
          value={`Rp ${(portfolioMetrics.grossRevenueMTD.value / 100_000_000_000).toFixed(1)}B`}
          delta={{ value: portfolioMetrics.grossRevenueMTD.deltaYoY, label: "YoY" }}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 rounded-md bg-surface border border-line-soft p-6">
          <div className="flex items-end justify-between mb-6">
            <div>
              <span className="text-label">Revenue · last 6 months</span>
              <h3 className="text-display text-[22px] leading-tight font-medium mt-1">
                Rp 1.36B <span className="text-ink-tertiary text-sm font-normal font-sans">this month</span>
              </h3>
            </div>
            <span className="text-xs text-success font-medium tabular-nums">
              +12.4% YoY
            </span>
          </div>
          <div className="flex items-end gap-2 h-32">
            {monthlyRevenueStrip.map((m, i) => {
              const pct = (m.revenue / 1600) * 100;
              const active = i === monthlyRevenueStrip.length - 1;
              return (
                <div
                  key={m.month}
                  className="flex-1 flex flex-col items-center gap-2"
                >
                  <div className="w-full flex items-end justify-center h-full">
                    <div
                      className={`w-full rounded-sm ${
                        active ? "bg-ink" : "bg-data-sage/60"
                      }`}
                      style={{ height: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-ink-tertiary tabular-nums">
                    {m.month}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-md bg-surface border border-line-soft p-6">
          <span className="text-label">Revenue by channel · MTD</span>
          <div className="mt-5 flex flex-col gap-3">
            {revenueByChannel.map((row) => (
              <div key={row.channel} className="flex items-center gap-3">
                <div
                  className={`w-2 h-2 rounded-full ${dataToneClass[row.tone]}`}
                />
                <span className="text-sm text-ink flex-1 truncate">
                  {row.channel}
                </span>
                <div className="w-24 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full ${dataToneClass[row.tone]}`}
                    style={{ width: `${row.share * 1.5}%` }}
                  />
                </div>
                <span className="font-mono tabular-nums text-xs text-ink w-10 text-right">
                  {row.share.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
