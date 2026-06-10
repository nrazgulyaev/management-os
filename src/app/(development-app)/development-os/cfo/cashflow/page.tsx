import type { Metadata } from "next";
import Link from "next/link";
import { CashflowForecast, type ForecastMonth } from "@/components/cfo/cashflow-forecast";

/**
 * Phase 2.2 dev-02 — Cashflow forecast (12-month rolling).
 *
 * Today the page renders a synthesized series so the surface is
 * visible end-to-end; the real materialized `cashflow_forecasts`
 * view + `cashflow-forecaster` agent wiring land in the 2.2 data
 * slice.
 *
 * Pixel-redesign (cabinets/dev-p1/cfo.html lineage): legacy
 * PageHeader/Button/DevelopmentShell swapped for the dev `.page-header`
 * brick + `.btn` lineage so this sub-route matches the redesigned CFO
 * console landing. syntheticMonths() series wiring preserved verbatim.
 */

export const metadata: Metadata = { title: "Cashflow forecast · Development OS" };
export const dynamic = "force-dynamic";

function syntheticMonths(): ForecastMonth[] {
  const out: ForecastMonth[] = [];
  let cum = 1_200_000_00; // $1.2M starting
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    // Slight outflow trend with one capital-call spike at month 4.
    const inflow = i === 4 ? 800_000_00 : 60_000_00;
    const outflow = 220_000_00 + (i % 3) * 18_000_00;
    const net = inflow - outflow;
    cum += net;
    out.push({
      month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      netUsdMinor: BigInt(net),
      cumulativeUsdMinor: BigInt(cum),
    });
  }
  return out;
}

export default async function CashflowPage() {
  const months = syntheticMonths();
  return (
    <>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os/cfo">CFO</Link>
            <span>·</span>
            <span>12-month rolling · refreshed daily 06:00</span>
          </div>
          <h1>Cashflow forecast</h1>
          <p className="mt-2 mb-0 text-[15px] text-[var(--ink-3)] max-w-[680px]">
            Net cashflow per month + cumulative cash on hand. Sparkline traces
            against the zero axis. Real series lands once the
            cashflow-forecaster agent runs against live BOQ + capital-call
            data.
          </p>
        </div>
        <div className="actions">
          <Link href="/development-os/cfo" className="btn btn-secondary btn-sm">
            ← CFO console
          </Link>
        </div>
      </div>

      <CashflowForecast months={months} />
    </>
  );
}
