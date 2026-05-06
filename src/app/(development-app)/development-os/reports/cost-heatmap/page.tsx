import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
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
      <PageHeader
        title="Cost heatmap"
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Reports", href: "/development-os/reports" },
          { label: "Cost heatmap" },
        ]}
        description="Per-asset overage by cost category. Red = over budget, blue = under."
      />
      <Section title="Heatmap">
        <div
          className="rounded-md border border-line-soft bg-surface p-4 overflow-x-auto"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </Section>
    </DevelopmentShell>
  );
}
