import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { DevelopmentShell } from "@/components/development/development-shell";
import { listAllProductivityLogs } from "@/lib/development/server/productivity/productivity-queries";
import { aggregateProductivityByTrade } from "@/lib/development/server/productivity/productivity-helpers";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = { title: "Productivity · Schedule" };
export const dynamic = "force-dynamic";

export default async function ProductivityPage() {
  const logs = await safeQuery(
    "productivityLogs",
    listAllProductivityLogs(500),
    [],
  );
  const aggregated = aggregateProductivityByTrade(
    logs
      .filter((l) => l.tradeCategory)
      .map((l) => ({
        trade: l.tradeCategory!,
        actualHours: Number(l.actualHours),
        quantityCompleted: l.quantityCompleted ? Number(l.quantityCompleted) : 0,
        unit: l.unitOfMeasure ?? "units",
      })),
  );
  return (
    <DevelopmentShell>
      <PageHeader
        title="Productivity"
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Productivity" },
        ]}
        description={`${logs.length} log row(s); aggregated across ${aggregated.length} trade(s).`}
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/productivity/log">+ Log entry</Link>
          </Button>
        }
      />
      <Section title="Per-trade aggregations">
        {aggregated.length === 0 ? (
          <EmptyState title="No productivity data" description="Log time + quantities to start tracking." />
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-ink-tertiary border-b border-line-soft">
                <th className="py-2">Trade</th>
                <th>Total hours</th>
                <th>Total quantity</th>
                <th>Average rate</th>
                <th>Unit</th>
              </tr>
            </thead>
            <tbody>
              {aggregated.map((a) => (
                <tr key={a.trade} className="border-b border-line-soft">
                  <td className="py-2">{a.trade}</td>
                  <td className="font-mono tabular-nums">
                    {a.totalHours.toFixed(1)}
                  </td>
                  <td className="font-mono tabular-nums">
                    {a.totalQuantity.toFixed(2)}
                  </td>
                  <td className="font-mono tabular-nums">
                    {a.averageRate.toFixed(3)}
                  </td>
                  <td className="text-xs">{a.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </DevelopmentShell>
  );
}
