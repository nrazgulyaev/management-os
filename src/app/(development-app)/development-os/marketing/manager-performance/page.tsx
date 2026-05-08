import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { listManagerPerformance } from "@/lib/development/server/conversation-review/conversation-queries";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = {
  title: "Manager performance · Marketing",
};
export const dynamic = "force-dynamic";

export default async function ManagerPerformancePage() {
  const rows = await safeQuery("managerPerf", listManagerPerformance({ limit: 200 }), []);
  return (
    <DevelopmentShell>
      <PageHeader
        title="Manager performance"
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Marketing" },
          { label: "Manager performance" },
        ]}
        description={`${rows.length} snapshot(s) across managers and periods.`}
      />
      <Section title="Recent snapshots">
        {rows.length === 0 ? (
          <EmptyState
            title="No snapshots yet"
            description="The Mon 04:00 cron will populate this. Run it manually from Jobs to seed."
          
          action={
            <Link href="/dashboard/jobs" className="inline-flex items-center justify-center rounded-full border border-line-soft bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-muted/40">View jobs</Link>
          }
        />
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-ink-tertiary border-b border-line-soft">
                <th className="py-2">Manager</th>
                <th>Period</th>
                <th>Type</th>
                <th>Leads</th>
                <th>Reservations</th>
                <th>Lead→Res</th>
                <th>Quality</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id} className="border-b border-line-soft">
                  <td className="py-2 font-mono text-xs">
                    <Link
                      href={`/development-os/marketing/manager-performance/${m.managerId}`}
                      className="hover:underline"
                    >
                      {m.managerId.slice(0, 8)}…
                    </Link>
                  </td>
                  <td className="text-xs">
                    {m.periodStart} → {m.periodEnd}
                  </td>
                  <td className="text-xs">{m.periodType}</td>
                  <td className="font-mono tabular-nums">{m.totalLeadsAssigned}</td>
                  <td className="font-mono tabular-nums">{m.reservationsSecured}</td>
                  <td className="font-mono tabular-nums">
                    {m.leadToReservationRate ?? "—"}%
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
