import Link from "next/link";
import { TableEmpty } from "@/components/ui/table-empty";
import { Kpi } from "@/components/dashboard/primitives";
import { Badge } from "@/components/ui/badge";
import { JobStatusPill } from "@/components/jobs/job-status-pill";
import { DbStatusNotice } from "@/components/admin/db-status";
import { listJobRuns } from "@/features/jobs/services";
import { getProductionGateReport } from "@/lib/deployment/production-gates";
import { getEnvReadinessReport } from "@/lib/env/validation";
import { listBuckets } from "@/features/system/storage-overview";
import { requireCabinetAccess } from "@/features/keystone/access";
import { CabinetGate } from "@/components/keystone/cabinet-gate";

export const metadata = { title: "System" };
export const dynamic = "force-dynamic";

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

function fmtDuration(ms: number | null): string {
  if (ms === null) return "—";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

export default async function SystemCabinetPage() {
  const { allowed } = await requireCabinetAccess("system");
  if (!allowed) return <CabinetGate cabinet="System" />;
  const runs = await listJobRuns({ limit: 100 }).catch(() => []);
  const gates = getProductionGateReport();
  const envReport = getEnvReadinessReport();
  const buckets = listBuckets();

  const since24 = Date.now() - 24 * 86_400_000;
  const runs24h = runs.filter((r) => new Date(r.startedAt).getTime() >= since24);
  const failed24h = runs24h.filter(
    (r) => r.status === "failed" || r.status === "partial_success",
  ).length;
  const gatesPassed = gates.results.filter((g) => g.ok).length;
  const recentRuns = runs.slice(0, 12);

  return (
    <>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard">Dashboard</Link> / <span>System</span>
          </div>
          <h1>System</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            Background jobs, locks and retry queues, deployment-gate readiness,
            environment validation and storage. Every cron, every locked job,
            every breath.
          </p>
        </div>
        <div className="actions">
          <Link href="/dashboard/system/health" className="btn btn-secondary btn-sm">
            System health →
          </Link>
          <Link href="/dashboard/system/deployment" className="btn btn-accent btn-sm">
            Deployment readiness →
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mt-[18px] mb-[18px]">
        <Kpi
          label="Runs · 24h"
          value={String(runs24h.length)}
          sub={`${runs.length} on file`}
          tone={runs24h.length > 0 ? "success" : undefined}
        />
        <Kpi
          label="Failed · 24h"
          value={String(failed24h)}
          sub={failed24h > 0 ? "needs review" : "all green"}
          tone={failed24h > 0 ? "accent" : undefined}
        />
        <Kpi
          label="Deployment gates"
          value={`${gatesPassed}/${gates.results.length}`}
          sub={gates.ok ? `${gates.mode} · passing` : `${gates.mode} · blocked`}
          tone={gates.ok ? "success" : "accent"}
        />
        <Kpi
          label="Env readiness"
          value={envReport.ok ? "OK" : `${envReport.fatalCount} fatal`}
          sub={`${envReport.warningCount} warn · ${envReport.mode}`}
          tone={envReport.ok ? "success" : "accent"}
        />
        <Kpi
          label="Storage buckets"
          value={String(buckets.length)}
          sub="configured"
          tone="gold"
        />
      </div>

      <DbStatusNotice />

      {/* Background jobs */}
      <div className="flex items-end justify-between mt-2 mb-3.5">
        <h2 className="display text-[22px] font-normal" id="health">
          Background jobs · <em>recent</em>
        </h2>
        <Link
          href="/dashboard/jobs/runs"
          className="text-[12px] text-ink-3 hover:text-ink underline"
        >
          All runs →
        </Link>
      </div>
      <div className="card p-0 overflow-hidden mb-[18px]">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">When</th>
              <th scope="col">Job</th>
              <th scope="col">Trigger</th>
              <th scope="col">Status</th>
              <th scope="col" className="num">Duration</th>
              <th scope="col">Summary</th>
            </tr>
          </thead>
          <tbody>
            {recentRuns.length === 0 ? (
              <TableEmpty colSpan={6}>No job runs recorded yet. Cron + manual runs surface here with
                  status, duration and summary.</TableEmpty>
            ) : (
              recentRuns.map((r) => (
                <tr key={r.id}>
                  <td className="mono text-[11px] text-ink-3 whitespace-nowrap">
                    {fmtDateTime(r.startedAt)}
                  </td>
                  <td className="mono text-[12px]">
                    <Link href={`/dashboard/jobs/runs/${r.id}`} className="hover:text-terra">
                      {r.jobKey}
                    </Link>
                  </td>
                  <td>
                    <Badge tone="outline">{r.triggerType}</Badge>
                  </td>
                  <td>
                    <JobStatusPill status={r.status} />
                  </td>
                  <td className="num mono text-[12px]">{fmtDuration(r.durationMs)}</td>
                  <td className="text-[12px] text-ink-3 max-w-[360px] truncate">
                    {r.resultSummary ?? "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Deployment gates detail */}
      <h2 className="display text-[22px] font-normal mt-8 mb-3.5">
        Deployment gates · <em>{gates.mode}</em>
      </h2>
      <div className="card p-0 overflow-hidden mb-[18px]">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">Gate</th>
              <th scope="col">Severity</th>
              <th scope="col">Result</th>
              <th scope="col">Detail</th>
            </tr>
          </thead>
          <tbody>
            {gates.results.map((g) => (
              <tr key={g.key}>
                <td className="mono text-[12px]">{g.key}</td>
                <td>
                  <Badge
                    tone={
                      g.severity === "critical"
                        ? "danger"
                        : g.severity === "warning"
                          ? "warning"
                          : "neutral"
                    }
                  >
                    {g.severity}
                  </Badge>
                </td>
                <td>
                  <Badge tone={g.ok ? "success" : "danger"}>{g.ok ? "pass" : "fail"}</Badge>
                </td>
                <td className="text-[12px] text-ink-3">{g.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Related surfaces */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-8">
        {[
          { href: "/dashboard/system/health", title: "System health", detail: "DB, row counts, env" },
          { href: "/dashboard/system/deployment", title: "Deployment", detail: "Readiness gates + runbook" },
          { href: "/dashboard/system/storage", title: "Storage", detail: `${buckets.length} buckets` },
          { href: "/dashboard/jobs/runs", title: "Job runs", detail: `${runs.length} on file` },
        ].map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="card p-4 block hover:border-line-strong transition-colors"
          >
            <div className="text-ink font-medium text-[14px]">{c.title}</div>
            <div className="text-[12px] text-ink-3 mt-1">{c.detail}</div>
          </Link>
        ))}
      </div>
    </>
  );
}
