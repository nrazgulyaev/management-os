import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { renderBurnChartSvg } from "@/lib/development/server/visual-reports/burn-chart-helpers";
import { getBudgetBurnData } from "@/lib/development/server/visual-reports/report-data";

export const metadata: Metadata = { title: "Budget burn · Development OS" };
export const dynamic = "force-dynamic";

export default async function BudgetBurnPage() {
  // Real cumulative committed (commitments ledger) + actual outflow
  // (transactions) by month, against the org's total project budget.
  const { points, budgetMinor } = await getBudgetBurnData();
  const svg = renderBurnChartSvg(points, {
    width: 800,
    height: 360,
    budgetMinor,
  });

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/reports">Reports</Link> /{" "}
            <span>Budget burn</span>
          </div>
          <h1>Budget burn</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Cumulative committed (orange) and actual (red) against the total
            budget reference line, aggregated across all projects.
          </p>
        </div>
      </div>
      <div>
        <div className="label mb-2.5">Chart</div>
        {points.length === 0 ? (
          <EmptyState
            title="No spend recorded yet"
            description="Record commitments or actual transactions to populate the burn chart."
          />
        ) : (
          <Card padding="default" className="overflow-x-auto">
            <div dangerouslySetInnerHTML={{ __html: svg }} />
          </Card>
        )}
      </div>
    </DevelopmentShell>
  );
}
