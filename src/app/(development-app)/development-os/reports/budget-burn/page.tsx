import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
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
      <PageHeader
        title="Budget burn"
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Reports", href: "/development-os/reports" },
          { label: "Budget burn" },
        ]}
        description="Cumulative committed (orange) and actual (red) against the total budget reference line."
      />
      <Section title="Chart">
        <div
          className="rounded-md border border-line-soft bg-surface p-4 overflow-x-auto"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </Section>
    </DevelopmentShell>
  );
}
