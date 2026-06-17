import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { renderProductivitySvg } from "@/lib/development/server/visual-reports/productivity-helpers";
import { getWorkforceProductivityData } from "@/lib/development/server/visual-reports/report-data";

export const metadata: Metadata = {
  title: "Workforce productivity · Development OS",
};
export const dynamic = "force-dynamic";

export default async function WorkforceProductivityPage() {
  // Real monthly utilised man-hours per role from site_workforce_logs, with
  // planned-headcount capacity from site_reports (idle = capacity − utilised).
  const rows = await getWorkforceProductivityData();
  const svg = renderProductivitySvg(rows, { width: 800, height: 360 });

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/reports">Reports</Link> /{" "}
            <span>Workforce productivity</span>
          </div>
          <h1>Workforce productivity</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Per-role utilised man-hours each month, with idle (gray) on top of
            planned capacity.
          </p>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Chart</div>
        {rows.length === 0 ? (
          <EmptyState
            title="No workforce logs yet"
            description="Submit site reports with workforce logs to populate utilisation."
          />
        ) : (
          <Card padding="default">
            <div
              className="overflow-x-auto"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          </Card>
        )}
      </div>
    </DevelopmentShell>
  );
}
