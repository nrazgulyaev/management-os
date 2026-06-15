import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import {
  buildBurnPoints,
  renderBurnChartSvg,
} from "@/lib/development/server/visual-reports/burn-chart-helpers";

export const metadata: Metadata = { title: "Budget burn · Development OS" };
export const dynamic = "force-dynamic";

export default async function BudgetBurnPage() {
  // Demo data — wires to per-project burn rollup once 5.E lands.
  const points = buildBurnPoints([
    { label: "Jan", committedDeltaMinor: 50_000_000_00, actualDeltaMinor: 32_000_000_00 },
    { label: "Feb", committedDeltaMinor: 80_000_000_00, actualDeltaMinor: 70_000_000_00 },
    { label: "Mar", committedDeltaMinor: 110_000_000_00, actualDeltaMinor: 95_000_000_00 },
    { label: "Apr", committedDeltaMinor: 90_000_000_00, actualDeltaMinor: 85_000_000_00 },
  ]);
  const svg = renderBurnChartSvg(points, {
    width: 800,
    height: 360,
    budgetMinor: 500_000_000_00,
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
            Cumulative committed (orange) and actual (red) against the total budget
            reference line.
          </p>
        </div>
      </div>
      <div>
        <div className="label mb-2.5">Chart</div>
        <Card padding="default" className="overflow-x-auto">
          <div dangerouslySetInnerHTML={{ __html: svg }} />
        </Card>
      </div>
    </DevelopmentShell>
  );
}
