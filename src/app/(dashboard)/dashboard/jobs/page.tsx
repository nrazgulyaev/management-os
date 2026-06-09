import Link from "next/link";
import { DbStatusNotice } from "@/components/admin/db-status";
import { RunNowButton } from "@/components/jobs/run-now-button";
import { JobStatusPill } from "@/components/jobs/job-status-pill";
import { SeedDefaultJobDefinitionsButton } from "@/components/jobs/seed-defaults-button";
import {
  listJobDefinitions,
  listJobRuns,
} from "@/features/jobs/services";
import { listNotifications } from "@/features/notifications/services";
import { safeList } from "@/features/system/db-health";
import { QueryWarningCard } from "@/components/system/query-warning-card";

export const metadata = { title: "Jobs" };
export const dynamic = "force-dynamic";

export default async function JobsHomePage() {
  const [defsResult, recentRunsResult, queuedNotificationsResult] =
    await Promise.all([
      safeList("job_definitions", () => listJobDefinitions()),
      safeList("job_runs", () => listJobRuns({ limit: 12 })),
      safeList("notification_queue", () =>
        listNotifications({ status: "queued", limit: 50 }),
      ),
    ]);
  const defs = defsResult.value;
  const recentRuns = recentRunsResult.value;
  const queuedNotifications = queuedNotificationsResult.value;

  const failedRecent = recentRuns.filter((r) => r.status === "failed").length;

  return (
    <>
      <div className="section-heading flex items-end gap-[18px]">
        <div className="flex-1 min-w-0">
          <div className="eyebrow label">System · cron workflows</div>
          <h1>
            Jobs &amp; <em>runs</em>.
          </h1>
          <p>
            Cron-driven workflows: calendar sync, preventive task generation,
            finance bridge, low-stock alerts. Run any on demand.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <SeedDefaultJobDefinitionsButton />
        </div>
      </div>

      <DbStatusNotice />
      <QueryWarningCard result={defsResult} tableName="job_definitions" />
      <QueryWarningCard result={recentRunsResult} tableName="job_runs" />
      <QueryWarningCard
        result={queuedNotificationsResult}
        tableName="notification_queue"
      />

      <div className="gs-kpis">
        <div className="kpi">
          <div className="label">Definitions</div>
          <div className="v">{defs.length}</div>
          <div className="sub">cron catalog</div>
        </div>
        <div className="kpi">
          <div className="label">Runs · recent</div>
          <div className="v">{recentRuns.length}</div>
          <div className="sub">last 24h</div>
        </div>
        <div className={`kpi${failedRecent > 0 ? " warn" : ""}`}>
          <div className="label">Failed runs</div>
          <div className="v">{failedRecent}</div>
          <div className="sub">{failedRecent > 0 ? "need a look" : "all clear"}</div>
        </div>
        <div className="kpi accent">
          <div className="label">Queued notifs</div>
          <div className="v">{queuedNotifications.length}</div>
          <div className="sub">pending send</div>
        </div>
      </div>

      <div className="card card-pad">
        <div className="gs-card-h">
          <h3>Job definitions</h3>
          <span className="meta">{defs.length} · CRON</span>
        </div>
        {defs.length === 0 ? (
          <p className="text-[13px] text-ink-3 leading-relaxed">
            No job definitions yet. Click &quot;Seed defaults&quot; to install
            the standard cron catalog.
          </p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Job</th>
                <th scope="col">Type</th>
                <th scope="col">Cron</th>
                <th scope="col">Enabled</th>
                <th scope="col">Last run</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {defs.map((d) => (
                <tr key={d.id}>
                  <td className="row-title">
                    {d.name}
                    <div className="mono text-[11px] text-ink-4">{d.key}</div>
                  </td>
                  <td>
                    <span className="badge">{d.jobType.replace(/_/g, " ")}</span>
                  </td>
                  <td className="mono text-[11px]">{d.scheduleCron ?? "—"}</td>
                  <td>
                    <span className={`badge ${d.enabled ? "badge-ok" : "badge-soft"}`}>
                      {d.enabled ? "enabled" : "disabled"}
                    </span>
                  </td>
                  <td className="text-[11px]">
                    {d.lastRunAt ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        {d.lastRunStatus && (
                          <JobStatusPill status={d.lastRunStatus} />
                        )}
                        <span className="mono text-ink-3 tabular-nums">
                          {d.lastRunAt.slice(0, 16).replace("T", " ")}
                        </span>
                        {d.lastDurationMs !== null && (
                          <span className="mono text-ink-4">
                            {d.lastDurationMs}ms
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="mono text-ink-4">never</span>
                    )}
                  </td>
                  <td>
                    <RunNowButton jobKey={d.key} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card card-pad mt-[18px]">
        <div className="gs-card-h">
          <h3>Recent runs</h3>
          <Link href="/dashboard/jobs/runs" className="meta hover:underline">
            ALL RUNS →
          </Link>
        </div>
        {recentRuns.length === 0 ? (
          <p className="text-[13px] text-ink-3">No runs yet.</p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Job</th>
                <th scope="col">Trigger</th>
                <th scope="col">Status</th>
                <th scope="col">Duration</th>
                <th scope="col">Summary</th>
              </tr>
            </thead>
            <tbody>
              {recentRuns.map((r) => (
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
                  <td className="text-[12px] text-ink-3 truncate max-w-[420px]">
                    {r.resultSummary ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
