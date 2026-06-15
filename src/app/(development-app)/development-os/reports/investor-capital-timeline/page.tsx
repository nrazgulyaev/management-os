import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { renderCapitalTimelineSvg } from "@/lib/development/server/visual-reports/capital-timeline-helpers";

export const metadata: Metadata = {
  title: "Investor capital timeline · Development OS",
};
export const dynamic = "force-dynamic";

export default async function InvestorCapitalTimelinePage() {
  const rows = [
    { monthLabel: "Jan", contributionsMinor: 1_500_000_00, drawdownsMinor: 600_000_00, distributionsMinor: 0 },
    { monthLabel: "Feb", contributionsMinor: 800_000_00, drawdownsMinor: 1_100_000_00, distributionsMinor: 0 },
    { monthLabel: "Mar", contributionsMinor: 0, drawdownsMinor: 1_400_000_00, distributionsMinor: 200_000_00 },
    { monthLabel: "Apr", contributionsMinor: 2_000_000_00, drawdownsMinor: 1_200_000_00, distributionsMinor: 0 },
    { monthLabel: "May", contributionsMinor: 0, drawdownsMinor: 900_000_00, distributionsMinor: 350_000_00 },
    { monthLabel: "Jun", contributionsMinor: 600_000_00, drawdownsMinor: 700_000_00, distributionsMinor: 0 },
  ];
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
            Monthly stacked: contributions / drawdowns / distributions.
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
