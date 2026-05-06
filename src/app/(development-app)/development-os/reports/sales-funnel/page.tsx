import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
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
      <PageHeader
        title="Sales funnel"
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Reports", href: "/development-os/reports" },
          { label: "Sales funnel" },
        ]}
        description="Stage-by-stage conversion. Hover the bars to see the drop-off."
      />
      <Section title="Funnel">
        <div
          className="rounded-md border border-line-soft bg-surface p-4 overflow-x-auto"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </Section>
      <Section title="Conversion table">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-ink-tertiary border-b border-line-soft">
              <th className="py-2">Stage</th>
              <th>Count</th>
              <th>Conv. from prev</th>
            </tr>
          </thead>
          <tbody>
            {computed.map((s) => (
              <tr key={s.label} className="border-b border-line-soft">
                <td className="py-2">{s.label}</td>
                <td className="font-mono tabular-nums">{s.count}</td>
                <td className="font-mono tabular-nums">
                  {s.conversionFromPrevPct.toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </DevelopmentShell>
  );
}
