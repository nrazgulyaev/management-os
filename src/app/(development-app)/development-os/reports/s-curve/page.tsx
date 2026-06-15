import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/dashboard/primitives";
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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/reports">Reports</Link> /{" "}
            <span>S-curve</span>
          </div>
          <h1>S-curve — planned vs actual</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Cumulative progress: planned (dashed) vs actual (solid).
          </p>
        </div>
      </div>
      <div>
        <div className="label mb-2.5">Chart</div>
        {planned.length === 0 ? (
          <EmptyState title="No project selected" description="Pick a project to view per-project S-curve." />
        ) : (
          <Card padding="default" className="overflow-x-auto">
            <div dangerouslySetInnerHTML={{ __html: svg }} />
          </Card>
        )}
      </div>
    </DevelopmentShell>
  );
}
