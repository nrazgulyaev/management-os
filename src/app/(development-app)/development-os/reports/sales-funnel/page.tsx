import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import {
  computeFunnelStages,
  renderFunnelSvg,
} from "@/lib/development/server/visual-reports/funnel-helpers";

export const metadata: Metadata = { title: "Sales funnel · Development OS" };
export const dynamic = "force-dynamic";

export default async function SalesFunnelPage() {
  const stages = [
    { label: "Leads", count: 240 },
    { label: "Qualified", count: 86 },
    { label: "Reservations", count: 32 },
    { label: "Contracts", count: 14 },
    { label: "Closed", count: 9 },
  ];
  const computed = computeFunnelStages(stages);
  const svg = renderFunnelSvg(stages, { width: 600, height: 360 });

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/reports">Reports</Link> /{" "}
            <span>Sales funnel</span>
          </div>
          <h1>Sales funnel</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Stage-by-stage conversion. Hover the bars to see the drop-off.
          </p>
        </div>
      </div>
      <div>
        <div className="label mb-2.5">Funnel</div>
        <Card padding="default" className="overflow-x-auto">
          <div dangerouslySetInnerHTML={{ __html: svg }} />
        </Card>
      </div>
      <div className="mt-[18px]">
        <div className="label mb-2.5">Conversion table</div>
        <Card padding="none" overflowHidden>
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Stage</th>
                <th scope="col" className="num">Count</th>
                <th scope="col" className="num">Conv. from prev</th>
              </tr>
            </thead>
            <tbody>
              {computed.map((s) => (
                <tr key={s.label}>
                  <td className="row-title">{s.label}</td>
                  <td className="num">{s.count}</td>
                  <td className="num">
                    {s.conversionFromPrevPct.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </DevelopmentShell>
  );
}
