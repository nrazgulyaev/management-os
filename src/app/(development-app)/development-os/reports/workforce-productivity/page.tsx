import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { renderProductivitySvg } from "@/lib/development/server/visual-reports/productivity-helpers";

export const metadata: Metadata = {
  title: "Workforce productivity · Development OS",
};
export const dynamic = "force-dynamic";

export default async function WorkforceProductivityPage() {
  const rows = [
    {
      monthLabel: "Jan",
      utilized: { pm: 280, engineer: 420, qs: 180 },
      totalCapacityHours: 1000,
    },
    {
      monthLabel: "Feb",
      utilized: { pm: 300, engineer: 460, qs: 200 },
      totalCapacityHours: 1000,
    },
    {
      monthLabel: "Mar",
      utilized: { pm: 290, engineer: 440, qs: 195 },
      totalCapacityHours: 1000,
    },
    {
      monthLabel: "Apr",
      utilized: { pm: 270, engineer: 420, qs: 170 },
      totalCapacityHours: 1000,
    },
  ];
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
            Per-role utilisation each month, with idle (gray) on top.
          </p>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Chart</div>
        <Card padding="default">
          <div
            className="overflow-x-auto"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </Card>
      </div>
    </DevelopmentShell>
  );
}
