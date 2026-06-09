import type { Metadata } from "next";
import Link from "next/link";
import {
  Kpi,
  SectionHeading,
} from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { listAllProductivityLogs } from "@/lib/development/server/productivity/productivity-queries";
import { aggregateProductivityByTrade } from "@/lib/development/server/productivity/productivity-helpers";
import { safeQuery } from "@/lib/development/safe-query";

/**
 * Dev OS /productivity — pixel redesign to cabinets/dev-p3/Dev Ops.html
 * (Productivity screen): SectionHeading hero · 4-KPI strip · a single
 * "Per-trade aggregations" card built on table.data. Data wiring is
 * preserved: the log fetch (listAllProductivityLogs) + the pure
 * aggregateProductivityByTrade roll-up are unchanged; only the markup is
 * restyled to the engineering palette under data-surface="development-os".
 */

export const metadata: Metadata = { title: "Productivity · Schedule" };
export const dynamic = "force-dynamic";

export default async function ProductivityPage() {
  const logs = await safeQuery(
    "productivityLogs",
    listAllProductivityLogs(500),
    [],
  );
  const aggregated = aggregateProductivityByTrade(
    logs
      .filter((l) => l.tradeCategory)
      .map((l) => ({
        trade: l.tradeCategory!,
        actualHours: Number(l.actualHours),
        quantityCompleted: l.quantityCompleted ? Number(l.quantityCompleted) : 0,
        unit: l.unitOfMeasure ?? "units",
      })),
  );

  // KPI roll-ups derived from the same aggregation — no extra queries.
  // "Best rate" = trade with the highest avg output rate; "Below median"
  // = trades whose avg rate sits under the dataset median (a lightweight
  // lagging signal until per-trade BOQ benchmarks are wired in).
  const rates = aggregated.map((a) => a.averageRate).sort((x, y) => x - y);
  const medianRate =
    rates.length > 0 ? rates[Math.floor((rates.length - 1) / 2)] : 0;
  const bestTrade = aggregated.reduce<(typeof aggregated)[number] | null>(
    (best, a) => (best == null || a.averageRate > best.averageRate ? a : best),
    null,
  );
  const belowMedianCount = aggregated.filter(
    (a) => a.averageRate < medianRate,
  ).length;

  return (
    <>
      <SectionHeading
        eyebrow="operations · time + output"
        title={
          <>
            Per-trade <span className="text-amber italic">productivity</span>.
          </>
        }
        subtitle="Logged hours and quantities aggregate into a rate per trade — the input that calibrates BOQ labour estimates on the next project."
        actions={
          <Link
            href="/development-os/productivity/log"
            prefetch={false}
            className="btn btn-accent btn-sm"
          >
            + Log entry
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 mb-5 lg:grid-cols-4">
        <Kpi label="Log rows" value={String(logs.length)} sub="last 90d" />
        <Kpi
          label="Trades tracked"
          value={String(aggregated.length)}
          sub="aggregated"
        />
        <Kpi
          label="Best rate"
          value={bestTrade ? bestTrade.averageRate.toFixed(3) : "—"}
          sub={bestTrade ? `${bestTrade.trade} · ${bestTrade.unit}` : "no trades"}
          tone={bestTrade ? "success" : undefined}
        />
        <Kpi
          label="Below median"
          value={String(belowMedianCount)}
          sub="trades lagging"
          tone={belowMedianCount > 0 ? "warn" : undefined}
        />
      </div>

      <div className="card card-pad">
        <div className="flex items-center gap-2.5 mb-3.5">
          <h3 className="font-display text-[19px] font-medium leading-none tracking-[-0.02em] text-ink m-0">
            Per-trade aggregations
          </h3>
          <span className="ml-auto font-mono text-[10.5px] tracking-[0.04em] text-ink-tertiary uppercase">
            {aggregated.length} trade{aggregated.length === 1 ? "" : "s"}
          </span>
        </div>
        {aggregated.length === 0 ? (
          <EmptyState
            title="No productivity data"
            description="Log time + quantities to start tracking."
          />
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Trade</th>
                <th className="num">Total hours</th>
                <th className="num">Total qty</th>
                <th className="num">Avg rate</th>
                <th>Unit</th>
              </tr>
            </thead>
            <tbody>
              {aggregated.map((a) => (
                <tr key={a.trade}>
                  <td className="capitalize">{a.trade.replace(/_/g, " ")}</td>
                  <td className="num">{a.totalHours.toFixed(1)}</td>
                  <td className="num">{a.totalQuantity.toFixed(2)}</td>
                  <td className="num">{a.averageRate.toFixed(3)}</td>
                  <td className="text-ink-tertiary">{a.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
