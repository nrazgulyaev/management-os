import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { renderSCurveSvg } from "@/lib/development/server/visual-reports/s-curve-helpers";
import { getSCurveData } from "@/lib/development/server/visual-reports/report-data";

export const metadata: Metadata = { title: "S-curve · Development OS" };
export const dynamic = "force-dynamic";

export default async function SCurvePage() {
  // Real cumulative milestone-weight from the org-scoped `milestones` table.
  // Planned curve walks target dates; actual walks completion (actual) dates.
  const { planned, actual } = await getSCurveData();
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
            Cumulative milestone completion across all projects: planned
            (dashed, by target date) vs actual (solid, by completion date).
          </p>
        </div>
      </div>
      <div>
        <div className="label mb-2.5">Chart</div>
        {planned.length === 0 ? (
          <EmptyState
            title="No milestones yet"
            description="Add milestones to a project's timeline to populate the S-curve."
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
