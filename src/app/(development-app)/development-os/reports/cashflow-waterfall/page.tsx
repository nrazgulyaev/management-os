import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb, rowsOf } from "@/lib/db/client";
import {
  computeWaterfallSteps,
  renderWaterfallSvg,
  type WaterfallBar,
} from "@/lib/development/server/visual-reports/cashflow-waterfall-helpers";
import { sql } from "drizzle-orm";
import { requireOrgId } from "@/features/auth/require-org";

export const metadata: Metadata = {
  title: "Cashflow waterfall · Development OS",
};
export const dynamic = "force-dynamic";

export default async function CashflowWaterfallPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <div className="crumb">
              <Link href="/development-os">Development OS</Link> /{" "}
              <Link href="/development-os/reports">Reports</Link> /{" "}
              <span>Cashflow waterfall</span>
            </div>
            <h1>Cashflow waterfall</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }

  // Build bars from the latest active forecast (org-scoped).
  const organizationId = await requireOrgId();
  const row = await db.execute<{ projections: unknown }>(sql`
    SELECT monthly_projections AS projections
      FROM cashflow_forecasts
     WHERE status = 'active'
       AND organization_id = ${organizationId}
     ORDER BY created_at DESC
     LIMIT 1
  `);
  const proj = rowsOf<{ projections: Array<{ inflow: number; outflow: number; cumulativeCash: number }> }>(row)[0]?.projections;

  let bars: WaterfallBar[] = [];
  if (proj && proj.length > 0) {
    const totalInflow = proj.reduce((a, p) => a + (p.inflow ?? 0), 0);
    const totalOutflow = proj.reduce((a, p) => a + (p.outflow ?? 0), 0);
    const start = proj[0].cumulativeCash - (proj[0].inflow - proj[0].outflow);
    const end = proj[proj.length - 1].cumulativeCash;
    bars = [
      { label: "Start", amountMinor: start, kind: "starting" },
      { label: "+ Inflow", amountMinor: totalInflow, kind: "in" },
      { label: "− Outflow", amountMinor: totalOutflow, kind: "out" },
      { label: "End", amountMinor: end, kind: "ending" },
    ];
  }

  const steps = computeWaterfallSteps(bars);
  const svg = renderWaterfallSvg(bars, { width: 800, height: 360 });

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/reports">Reports</Link> /{" "}
            <span>Cashflow waterfall</span>
          </div>
          <h1>Cashflow waterfall</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Aggregated from the latest active 12-month cashflow forecast.
          </p>
        </div>
      </div>
      <div>
        <div className="label mb-2.5">Chart</div>
        {bars.length === 0 ? (
          <EmptyState
            title="No active forecast"
            description="Generate or activate a cashflow forecast to populate this chart."
          />
        ) : (
          <Card padding="default" className="overflow-x-auto">
            <div dangerouslySetInnerHTML={{ __html: svg }} />
          </Card>
        )}
      </div>
      {steps.length > 0 && (
        <div className="mt-[18px]">
          <div className="label mb-2.5">Underlying steps</div>
          <Card padding="none" overflowHidden>
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Label</th>
                  <th scope="col" className="num">Amount</th>
                  <th scope="col" className="num">Cumulative</th>
                </tr>
              </thead>
              <tbody>
                {steps.map((s, i) => (
                  <tr key={i}>
                    <td className="row-title">{s.label}</td>
                    <td className="num">{s.amountMinor.toLocaleString()}</td>
                    <td className="num">{s.cumulativeMinor.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </DevelopmentShell>
  );
}
