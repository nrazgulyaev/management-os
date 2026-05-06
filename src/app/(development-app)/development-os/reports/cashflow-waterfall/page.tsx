import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import {
  computeWaterfallSteps,
  renderWaterfallSvg,
  type WaterfallBar,
} from "@/lib/development/server/visual-reports/cashflow-waterfall-helpers";
import { sql } from "drizzle-orm";

export const metadata: Metadata = {
  title: "Cashflow waterfall · Development OS",
};
export const dynamic = "force-dynamic";

export default async function CashflowWaterfallPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Cashflow waterfall" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }

  // Build bars from the latest active forecast.
  const row = await db.execute<{ projections: unknown }>(sql`
    SELECT monthly_projections AS projections
      FROM cashflow_forecasts
     WHERE status = 'active'
     ORDER BY created_at DESC
     LIMIT 1
  `);
  const proj = (row as unknown as { rows: Array<{ projections: Array<{ inflow: number; outflow: number; cumulativeCash: number }> }> })
    .rows?.[0]?.projections;

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
      <PageHeader
        title="Cashflow waterfall"
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Reports", href: "/development-os/reports" },
          { label: "Cashflow waterfall" },
        ]}
        description="Aggregated from the latest active 12-month cashflow forecast."
      />
      <Section title="Chart">
        {bars.length === 0 ? (
          <EmptyState
            title="No active forecast"
            description="Generate or activate a cashflow forecast to populate this chart."
          />
        ) : (
          <div
            className="rounded-md border border-line-soft bg-surface p-4 overflow-x-auto"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        )}
      </Section>
      {steps.length > 0 && (
        <Section title="Underlying steps">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-ink-tertiary border-b border-line-soft">
                <th className="py-2">Label</th>
                <th>Amount</th>
                <th>Cumulative</th>
              </tr>
            </thead>
            <tbody>
              {steps.map((s, i) => (
                <tr key={i} className="border-b border-line-soft">
                  <td className="py-2">{s.label}</td>
                  <td className="font-mono tabular-nums">{s.amountMinor.toLocaleString()}</td>
                  <td className="font-mono tabular-nums">{s.cumulativeMinor.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}
    </DevelopmentShell>
  );
}
