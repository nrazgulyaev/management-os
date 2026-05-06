import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import {
  buildSCurvePoints,
  interpolatePlannedSCurve,
  renderSCurveSvg,
} from "@/lib/development/server/visual-reports/s-curve-helpers";

export const metadata: Metadata = { title: "S-curve · Development OS" };
export const dynamic = "force-dynamic";

export default async function SCurvePage() {
  // Stage 5.C — initial company-wide demonstration. Per-project
  // /reports/s-curve/[projectSlug] route deferred until the underlying
  // milestone progress tables are wired in 5.E.
  const start = new Date(Date.UTC(2026, 0, 1));
  const end = new Date(Date.UTC(2026, 11, 31));
  const planned = interpolatePlannedSCurve(start, end, 24);
  const actual = buildSCurvePoints([
    { date: new Date(Date.UTC(2026, 0, 31)), deltaPct: 6 },
    { date: new Date(Date.UTC(2026, 1, 28)), deltaPct: 8 },
    { date: new Date(Date.UTC(2026, 2, 31)), deltaPct: 9 },
    { date: new Date(Date.UTC(2026, 3, 30)), deltaPct: 7 },
  ]);
  const svg = renderSCurveSvg(planned, actual, { width: 800, height: 360 });

  return (
    <DevelopmentShell>
      <PageHeader
        title="S-curve — planned vs actual"
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Reports", href: "/development-os/reports" },
          { label: "S-curve" },
        ]}
        description="Cumulative progress: planned (dashed) vs actual (solid)."
      />
      <Section title="Chart">
        {planned.length === 0 ? (
          <EmptyState title="No project selected" description="Pick a project to view per-project S-curve." />
        ) : (
          <div
            className="rounded-md border border-line-soft bg-surface p-4 overflow-x-auto"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        )}
      </Section>
    </DevelopmentShell>
  );
}
