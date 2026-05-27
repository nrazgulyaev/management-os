import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { DevelopmentShell } from "@/components/development/development-shell";
import { CashflowForecast, type ForecastMonth } from "@/components/cfo/cashflow-forecast";

/**
 * Phase 2.2 dev-02 — Cashflow forecast (12-month rolling).
 *
 * Today the page renders a synthesized series so the surface is
 * visible end-to-end; the real materialized `cashflow_forecasts`
 * view + `cashflow-forecaster` agent wiring land in the 2.2 data
 * slice.
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
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "CFO", href: "/development-os/cfo" },
          { label: "Cashflow" },
        ]}
        eyebrow="12-month rolling · refreshed daily 06:00"
        title="Cashflow forecast"
        description="Net cashflow per month + cumulative cash on hand. Sparkline traces against the zero axis. Real series lands once the cashflow-forecaster agent runs against live BOQ + capital-call data."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/cfo">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              CFO console
            </Link>
          </Button>
        }
      />
      <CashflowForecast months={months} />
    </DevelopmentShell>
  );
}
