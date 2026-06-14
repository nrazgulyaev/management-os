import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { renderHeatmapSvg } from "@/lib/development/server/visual-reports/heatmap-helpers";

export const metadata: Metadata = { title: "Cost heatmap · Development OS" };
export const dynamic = "force-dynamic";

export default async function CostHeatmapPage() {
  // Demo data — Stage 5.E will wire per-villa per-category roll-up.
  const cells = [
    { rowKey: "Villa A", colKey: "Land", budgetMinor: 1_500_000_000n as unknown as number, actualMinor: 1_580_000_000 },
    { rowKey: "Villa A", colKey: "Hard", budgetMinor: 4_200_000_000, actualMinor: 4_900_000_000 },
    { rowKey: "Villa A", colKey: "Soft", budgetMinor: 280_000_000, actualMinor: 250_000_000 },
    { rowKey: "Villa B", colKey: "Land", budgetMinor: 1_500_000_000, actualMinor: 1_500_000_000 },
    { rowKey: "Villa B", colKey: "Hard", budgetMinor: 4_200_000_000, actualMinor: 3_500_000_000 },
    { rowKey: "Villa B", colKey: "Soft", budgetMinor: 280_000_000, actualMinor: 320_000_000 },
    { rowKey: "Villa C", colKey: "Land", budgetMinor: 1_500_000_000, actualMinor: 1_900_000_000 },
    { rowKey: "Villa C", colKey: "Hard", budgetMinor: 4_200_000_000, actualMinor: 4_300_000_000 },
    { rowKey: "Villa C", colKey: "Soft", budgetMinor: 280_000_000, actualMinor: 270_000_000 },
  ].map((c) => ({
    rowKey: c.rowKey,
    colKey: c.colKey,
    budgetMinor: Number(c.budgetMinor),
    actualMinor: c.actualMinor,
  }));
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
            Per-asset overage by cost category. Red = over budget, blue = under.
          </p>
        </div>
      </div>
      <div>
        <div className="label mb-2.5">Heatmap</div>
        <Card padding="default" className="overflow-x-auto">
          <div dangerouslySetInnerHTML={{ __html: svg }} />
        </Card>
      </div>
    </DevelopmentShell>
  );
}
