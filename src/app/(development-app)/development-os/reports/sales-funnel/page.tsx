import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import {
  computeFunnelStages,
  renderFunnelSvg,
} from "@/lib/development/server/visual-reports/funnel-helpers";
import { getSalesFunnelData } from "@/lib/development/server/visual-reports/report-data";

export const metadata: Metadata = { title: "Sales funnel · Development OS" };
export const dynamic = "force-dynamic";

export default async function SalesFunnelPage() {
  // Real active-lead counts by stage from the org-scoped contact_roles table.
  const stages = await getSalesFunnelData();
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
            Stage-by-stage conversion across the active lead pipeline.
          </p>
        </div>
      </div>
      {stages.length === 0 ? (
        <div>
          <div className="label mb-2.5">Funnel</div>
          <EmptyState
            title="No active leads yet"
            description="Add leads to the Sales pipeline to populate the funnel."
          />
        </div>
      ) : (
        <>
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
        </>
      )}
    </DevelopmentShell>
  );
}
