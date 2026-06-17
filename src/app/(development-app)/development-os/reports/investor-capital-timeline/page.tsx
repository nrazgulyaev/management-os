import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { renderCapitalTimelineSvg } from "@/lib/development/server/visual-reports/capital-timeline-helpers";
import { getInvestorCapitalTimeline } from "@/lib/development/server/visual-reports/report-data";

export const metadata: Metadata = {
  title: "Investor capital timeline · Development OS",
};
export const dynamic = "force-dynamic";

export default async function InvestorCapitalTimelinePage() {
  // Real monthly flows from the org-scoped investor-capital tables:
  // contributions (signed commitments), drawdowns (received), distributions
  // (completed).
  const rows = await getInvestorCapitalTimeline();
  const svg = renderCapitalTimelineSvg(rows, { width: 800, height: 360 });

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/reports">Reports</Link> /{" "}
            <span>Investor capital timeline</span>
          </div>
          <h1>Investor capital timeline</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Monthly stacked: contributions / drawdowns / distributions (USD).
          </p>
        </div>
      </div>
      <div>
        <div className="label mb-2.5">Chart</div>
        {rows.length === 0 ? (
          <EmptyState
            title="No capital activity yet"
            description="Record investor commitments, drawdowns, or distributions to populate the timeline."
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
