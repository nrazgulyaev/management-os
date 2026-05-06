import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { MetricCard } from "@/components/ui/metric-card";
import {
  getTransparencyHubMetrics,
  listTransparencyStatementRows,
} from "@/features/statement-transparency/services";
import { RebuildAllTransparencyButton } from "@/components/finance/transparency-buttons";
import { TransparencyStatusBadge } from "@/components/finance/transparency-status-badge";

export const metadata = { title: "Statement transparency" };
export const dynamic = "force-dynamic";

export default async function TransparencyHub() {
  const [metrics, rows] = await Promise.all([
    getTransparencyHubMetrics(),
    listTransparencyStatementRows({ limit: 12 }),
  ]);
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Finance", href: "/dashboard/finance" },
          { label: "Transparency" },
        ]}
        title="Statement transparency"
        description="Owner-safe statement breakdowns, source traceability, and reconciliation warnings. Mutations live in the rebuild action — accounting rows are never touched."
        actions={<RebuildAllTransparencyButton />}
      />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Total statements" value={String(metrics.totalStatements)} />
        <MetricCard
          label="Transparency-snapshotted"
          value={String(metrics.statementsWithSnapshot)}
        />
        <MetricCard
          label="Open warnings"
          value={String(metrics.openWarningTotal)}
          accent={metrics.openWarningTotal > 0}
        />
        <MetricCard
          label="Critical warnings"
          value={String(metrics.criticalWarningTotal)}
          accent={metrics.criticalWarningTotal > 0}
        />
      </div>
      <p className="text-xs text-ink-tertiary">
        Last rebuild:{" "}
        {metrics.lastRebuildAt
          ? metrics.lastRebuildAt.slice(0, 16).replace("T", " ")
          : "never"}
        .
      </p>
      <Section
        eyebrow="Manage"
        title="Jump to"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Card
            href="/dashboard/finance/transparency/statements"
            title="Statements"
            detail="Per-statement transparency status + rebuild"
          />
          <Card
            href="/dashboard/finance/transparency/warnings"
            title="Warnings"
            detail={`${metrics.openWarningTotal} open`}
          />
          <Card
            href="/dashboard/finance/transparency/rebuild"
            title="Manual rebuild"
            detail="Rebuild a statement / owner / window"
          />
        </div>
      </Section>
      <Section
        eyebrow="Recent"
        title={`Latest ${rows.length} statement${rows.length === 1 ? "" : "s"}`}
      >
        <div className="rounded-md border border-line-soft bg-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-canvas/50 text-left">
              <tr className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                <th className="px-4 py-3">Statement</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Reconciliation</th>
                <th className="px-4 py-3">Groups</th>
                <th className="px-4 py-3">Warnings</th>
                <th className="px-4 py-3">Snapshot</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-line-soft">
                  <td className="px-4 py-3 font-mono text-xs">
                    {r.statementCode}
                  </td>
                  <td className="px-4 py-3 text-xs capitalize">{r.status}</td>
                  <td className="px-4 py-3">
                    <TransparencyStatusBadge status={r.reconciliationStatus} />
                  </td>
                  <td className="px-4 py-3 text-xs">{r.groupCount}</td>
                  <td className="px-4 py-3 text-xs">
                    {r.openWarningCount}
                    {r.criticalCount > 0 && (
                      <span className="text-danger ml-1">
                        ({r.criticalCount} critical)
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {r.hasExplanationSnapshot ? "✓" : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/dashboard/finance/transparency/statements/${r.id}`}
                      className="text-xs text-ink hover:underline underline-offset-4"
                    >
                      Open →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

function Card({
  href,
  title,
  detail,
}: {
  href: string;
  title: string;
  detail: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-md border border-line-soft bg-surface p-4 hover:border-line-strong"
    >
      <div className="text-sm text-ink font-medium">{title}</div>
      <div className="text-xs text-ink-tertiary mt-1">{detail}</div>
    </Link>
  );
}
