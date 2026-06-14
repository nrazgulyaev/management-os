import Link from "next/link";
import { Kpi } from "@/components/dashboard/primitives";
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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/finance">Finance</Link> /{" "}
            <span>Transparency</span>
          </div>
          <h1>Statement transparency</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Owner-safe statement breakdowns, source traceability, and
            reconciliation warnings. Mutations live in the rebuild action —
            accounting rows are never touched.
          </p>
        </div>
        <div className="actions">
          <RebuildAllTransparencyButton />
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Total statements" value={String(metrics.totalStatements)} />
        <Kpi
          label="Transparency-snapshotted"
          value={String(metrics.statementsWithSnapshot)}
        />
        <Kpi
          label="Open warnings"
          value={String(metrics.openWarningTotal)}
          tone={metrics.openWarningTotal > 0 ? "accent" : undefined}
        />
        <Kpi
          label="Critical warnings"
          value={String(metrics.criticalWarningTotal)}
          tone={metrics.criticalWarningTotal > 0 ? "accent" : undefined}
        />
      </div>
      <p className="text-xs text-ink-tertiary">
        Last rebuild:{" "}
        {metrics.lastRebuildAt
          ? metrics.lastRebuildAt.slice(0, 16).replace("T", " ")
          : "never"}
        .
      </p>
      <div>
        <div className="label mb-2.5">Manage</div>
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
      </div>
      <div>
        <div className="label mb-2.5">Recent</div>
        <table className="data">
          <thead>
            <tr>
              <th scope="col">Statement</th>
              <th scope="col">Status</th>
              <th scope="col">Reconciliation</th>
              <th scope="col" className="num">Groups</th>
              <th scope="col">Warnings</th>
              <th scope="col">Snapshot</th>
              <th scope="col"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="mono text-[12px]">{r.statementCode}</td>
                <td className="text-[12px] capitalize">{r.status}</td>
                <td>
                  <TransparencyStatusBadge status={r.reconciliationStatus} />
                </td>
                <td className="num text-[12px]">{r.groupCount}</td>
                <td className="text-[12px]">
                  {r.openWarningCount}
                  {r.criticalCount > 0 && (
                    <span className="text-danger ml-1">
                      ({r.criticalCount} critical)
                    </span>
                  )}
                </td>
                <td className="text-[12px]">
                  {r.hasExplanationSnapshot ? "✓" : "—"}
                </td>
                <td className="text-right">
                  <Link
                    href={`/dashboard/finance/transparency/statements/${r.id}`}
                    className="text-[12px] text-ink hover:text-terra"
                  >
                    Open →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
