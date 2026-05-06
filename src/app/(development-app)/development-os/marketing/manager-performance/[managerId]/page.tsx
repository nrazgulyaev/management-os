import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { DevelopmentShell } from "@/components/development/development-shell";
import { listManagerPerformance } from "@/lib/development/server/conversation-review/conversation-queries";

export const metadata: Metadata = {
  title: "Manager detail · Marketing",
};
export const dynamic = "force-dynamic";

export default async function ManagerDetailPage({
  params,
}: {
  params: Promise<{ managerId: string }>;
}) {
  const { managerId } = await params;
  const rows = await listManagerPerformance({ managerId, limit: 100 });
  return (
    <DevelopmentShell>
      <PageHeader
        title={`Manager ${managerId.slice(0, 8)}…`}
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Marketing" },
          {
            label: "Manager performance",
            href: "/development-os/marketing/manager-performance",
          },
          { label: managerId.slice(0, 8) },
        ]}
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/marketing/manager-performance">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Back
            </Link>
          </Button>
        }
      />
      <Section title={`${rows.length} period snapshot(s)`}>
        {rows.length === 0 ? (
          <EmptyState
            title="No snapshots for this manager"
            description="Snapshots are created weekly by the cron job."
          />
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-ink-tertiary border-b border-line-soft">
                <th className="py-2">Period</th>
                <th>Type</th>
                <th>Leads</th>
                <th>Active</th>
                <th>Reservations</th>
                <th>Contracts</th>
                <th>Lost</th>
                <th>Avg resp (m)</th>
                <th>Quality</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id} className="border-b border-line-soft">
                  <td className="py-2 text-xs">
                    {m.periodStart} → {m.periodEnd}
                  </td>
                  <td className="text-xs">{m.periodType}</td>
                  <td className="font-mono tabular-nums">{m.totalLeadsAssigned}</td>
                  <td className="font-mono tabular-nums">{m.totalConversationsActive}</td>
                  <td className="font-mono tabular-nums">{m.reservationsSecured}</td>
                  <td className="font-mono tabular-nums">{m.contractsSigned}</td>
                  <td className="font-mono tabular-nums">{m.leadsLost}</td>
                  <td className="font-mono tabular-nums">
                    {m.averageResponseTimeMinutes ?? "—"}
                  </td>
                  <td className="font-mono tabular-nums">
                    {m.aiQualityScore ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </DevelopmentShell>
  );
}
