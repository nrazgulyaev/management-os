import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { listUsageMetricsAcrossOrgs } from "@/lib/development/server/usage/usage-queries";

export const metadata: Metadata = { title: "Usage metrics · Platform" };
export const dynamic = "force-dynamic";

export default async function UsageMetricsPage() {
  const metrics = await listUsageMetricsAcrossOrgs({ limit: 100 });

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <span>Platform</span> / <span>Usage</span>
          </div>
          <h1>Usage metrics</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Per-tenant snapshots of activity, AI consumption, API traffic, and
            storage. Aggregated by the dev_os_usage_metrics_aggregation cron.
          </p>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">{metrics.length} snapshot(s)</div>
        {metrics.length === 0 ? (
          <EmptyState
            title="No usage data yet"
            description="The dev_os_usage_metrics_aggregation cron will populate this once it has run."
          />
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Period</th>
                <th scope="col">Type</th>
                <th scope="col" className="num">Users</th>
                <th scope="col" className="num">Projects</th>
                <th scope="col" className="num">Tx</th>
                <th scope="col" className="num">Invoices</th>
                <th scope="col" className="num">AI calls</th>
                <th scope="col" className="num">API req</th>
                <th scope="col" className="num">Webhooks ok/fail</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((m) => (
                <tr key={m.id}>
                  <td className="text-xs">
                    {m.metricPeriodStart}
                    {m.metricPeriodEnd !== m.metricPeriodStart
                      ? ` → ${m.metricPeriodEnd}`
                      : ""}
                  </td>
                  <td className="text-xs text-ink-3">{m.metricType}</td>
                  <td className="num mono text-xs">{m.activeUsersCount}</td>
                  <td className="num mono text-xs">{m.activeProjectsCount}</td>
                  <td className="num mono text-xs">
                    {m.totalTransactionsCount}
                  </td>
                  <td className="num mono text-xs">{m.totalInvoicesCount}</td>
                  <td className="num mono text-xs">{m.aiInvocationsCount}</td>
                  <td className="num mono text-xs">{m.apiRequestsCount}</td>
                  <td className="num mono text-xs">
                    {m.webhooksDispatchedCount}/{m.webhooksFailedCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </DevelopmentShell>
  );
}
