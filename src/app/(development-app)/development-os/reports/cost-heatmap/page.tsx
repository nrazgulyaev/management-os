import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { renderHeatmapSvg } from "@/lib/development/server/visual-reports/heatmap-helpers";
import { getCostHeatmapData } from "@/lib/development/server/visual-reports/report-data";

export const metadata: Metadata = { title: "Cost heatmap · Development OS" };
export const dynamic = "force-dynamic";

export default async function CostHeatmapPage() {
  // Real per-villa × {Land, Hard, Soft} roll-up from unit_cost_allocations:
  // budget = earliest allocation basis, actual = current allocation.
  const cells = await getCostHeatmapData();
  const svg = renderHeatmapSvg(cells);

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/reports">Reports</Link> /{" "}
            <span>Cost heatmap</span>
          </div>
          <h1>Cost heatmap</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Per-villa cost drift by category (Land / Hard / Soft) — current
            allocation vs the original cost basis. Red = over, blue = under.
          </p>
        </div>
      </div>
      <div>
        <div className="label mb-2.5">Heatmap</div>
        {cells.length === 0 ? (
          <EmptyState
            title="No cost allocations yet"
            description="Compute unit profitability for at least one villa to populate the heatmap."
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
