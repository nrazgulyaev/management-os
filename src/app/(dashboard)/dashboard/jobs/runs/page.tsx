import Link from "next/link";
import { Card, Kpi } from "@/components/dashboard/primitives";
import { DbStatusNotice } from "@/components/admin/db-status";
import { TableEmpty } from "@/components/ui/table-empty";
import { JobStatusPill } from "@/components/jobs/job-status-pill";
import { listJobRuns } from "@/features/jobs/services";

export const metadata = { title: "Job runs" };
export const dynamic = "force-dynamic";

const STATUSES = [
  "running",
  "success",
  "partial_success",
  "failed",
  "cancelled",
  "skipped",
];

export default async function JobRunsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; jobKey?: string }>;
}) {
  const sp = await searchParams;
  const runs = await listJobRuns({
    status: sp.status,
    jobKey: sp.jobKey,
    limit: 200,
  });

  const failedRuns = runs.filter((r) => r.status === "failed").length;
  const runningRuns = runs.filter((r) => r.status === "running").length;
  const successRuns = runs.filter(
    (r) => r.status === "success" || r.status === "partial_success",
  ).length;

  return (
    <>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/jobs">Jobs</Link> / <span>Runs</span>
          </div>
          <h1>Job runs</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            Every cron + manual run with status, duration, summary.
          </p>
        </div>
        <div className="actions">
          <span className="mono text-[11px] text-ink-3">
            {runs.length} runs in view
          </span>
        </div>
      </div>

      <DbStatusNotice />

      <div className="gs-kpis">
        <Kpi label="Runs · in view" value={String(runs.length)} />
        <Kpi
          label="Succeeded"
          value={String(successRuns)}
          tone={successRuns > 0 ? "success" : undefined}
        />
        <Kpi
          label="Failed"
          value={String(failedRuns)}
          tone={failedRuns > 0 ? "warn" : undefined}
        />
        <Kpi
          label="Running"
          value={String(runningRuns)}
          tone={runningRuns > 0 ? "accent" : undefined}
        />
      </div>

      <div className="flex flex-wrap gap-2 mb-[14px]">
        <FilterPill
          label="All"
          href="/dashboard/jobs/runs"
          active={!sp.status && !sp.jobKey}
        />
        {STATUSES.map((s) => (
          <FilterPill
            key={s}
            label={s.replace(/_/g, " ")}
            href={`/dashboard/jobs/runs?status=${s}`}
            active={sp.status === s}
          />
        ))}
      </div>

      <Card padding="none" overflowHidden>
        <table className="data">
          <thead>
            <tr>
              <th scope="col">When</th>
              <th scope="col">Job</th>
              <th scope="col">Trigger</th>
              <th scope="col">Status</th>
              <th scope="col">Duration</th>
              <th scope="col">Summary</th>
              <th scope="col">By</th>
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 ? (
              <TableEmpty colSpan={7}>No runs match these filters.</TableEmpty>
            ) : (
              runs.map((r) => (
                <tr key={r.id}>
                  <td className="mono text-[11px] text-ink-3 tabular-nums whitespace-nowrap">
                    {r.startedAt.slice(0, 16).replace("T", " ")}
                  </td>
                  <td className="mono text-[11px]">
                    <Link
                      href={`/dashboard/jobs/runs/${r.id}`}
                      className="hover:underline"
                    >
                      {r.jobKey}
                    </Link>
                  </td>
                  <td>
                    <span className="badge">{r.triggerType}</span>
                  </td>
                  <td>
                    <JobStatusPill status={r.status} />
                  </td>
                  <td className="mono text-[11px] tabular-nums">
                    {r.durationMs !== null ? `${r.durationMs}ms` : "—"}
                  </td>
                  <td className="text-[12px] text-ink-3 truncate max-w-[400px]">
                    {r.resultSummary ?? "—"}
                  </td>
                  <td className="text-[11px] text-ink-4">
                    {r.createdByName ?? "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </>
  );
}

function FilterPill({
  label,
  href,
  active,
}: {
  label: string;
  href: string;
  active: boolean;
}) {
  return (
    <Link href={href} className={active ? "filter-chip on" : "filter-chip"}>
      {label}
    </Link>
  );
}
