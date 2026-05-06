import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { listUsageMetricsAcrossOrgs } from "@/lib/development/server/usage/usage-queries";

export const metadata: Metadata = { title: "Usage metrics · Platform" };
export const dynamic = "force-dynamic";

export default async function UsageMetricsPage() {
  const metrics = await listUsageMetricsAcrossOrgs({ limit: 100 });

  return (
    <DevelopmentShell>
      <PageHeader
        title="Usage metrics"
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Platform" },
          { label: "Usage" },
        ]}
        description="Per-tenant snapshots of activity, AI consumption, API traffic, and storage. Aggregated by the dev_os_usage_metrics_aggregation cron."
      />

      <Section title={`${metrics.length} snapshot(s)`}>
        {metrics.length === 0 ? (
          <EmptyState
            title="No usage data yet"
            description="The dev_os_usage_metrics_aggregation cron will populate this once it has run."
          />
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-ink-tertiary border-b border-line-soft">
                <th className="py-2">Period</th>
                <th>Type</th>
                <th>Users</th>
                <th>Projects</th>
                <th>Tx</th>
                <th>Invoices</th>
                <th>AI calls</th>
                <th>API req</th>
                <th>Webhooks ok/fail</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((m) => (
                <tr key={m.id} className="border-b border-line-soft">
                  <td className="py-2 text-xs">
                    {m.metricPeriodStart}
                    {m.metricPeriodEnd !== m.metricPeriodStart
                      ? ` → ${m.metricPeriodEnd}`
                      : ""}
                  </td>
                  <td className="text-xs text-ink-tertiary">{m.metricType}</td>
                  <td className="font-mono tabular-nums text-xs">
                    {m.activeUsersCount}
                  </td>
                  <td className="font-mono tabular-nums text-xs">
                    {m.activeProjectsCount}
                  </td>
                  <td className="font-mono tabular-nums text-xs">
                    {m.totalTransactionsCount}
                  </td>
                  <td className="font-mono tabular-nums text-xs">
                    {m.totalInvoicesCount}
                  </td>
                  <td className="font-mono tabular-nums text-xs">
                    {m.aiInvocationsCount}
                  </td>
                  <td className="font-mono tabular-nums text-xs">
                    {m.apiRequestsCount}
                  </td>
                  <td className="font-mono tabular-nums text-xs">
                    {m.webhooksDispatchedCount}/{m.webhooksFailedCount}
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
