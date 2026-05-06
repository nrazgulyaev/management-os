import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { MetricCard } from "@/components/ui/metric-card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
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

  const lastByJobKey = new Map<string, (typeof recentRuns)[number]>();
  for (const r of recentRuns) {
    if (!lastByJobKey.has(r.jobKey)) lastByJobKey.set(r.jobKey, r);
  }

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[{ label: "Jobs" }]}
        title="Background jobs"
        description="Cron-driven workflows: calendar sync, preventive task generation, finance bridge, low-stock alerts."
        actions={<SeedDefaultJobDefinitionsButton />}
      />
      <DbStatusNotice />
      <QueryWarningCard result={defsResult} tableName="job_definitions" />
      <QueryWarningCard result={recentRunsResult} tableName="job_runs" />
      <QueryWarningCard
        result={queuedNotificationsResult}
        tableName="notification_queue"
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Definitions" value={String(defs.length)} />
        <MetricCard label="Runs (recent)" value={String(recentRuns.length)} />
        <MetricCard
          label="Failed runs"
          value={String(failedRecent)}
          accent={failedRecent > 0}
        />
        <MetricCard
          label="Queued notifications"
          value={String(queuedNotifications.length)}
        />
      </div>

      <Section eyebrow="Catalog" title="Job definitions">
        {defs.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            No job definitions yet. Click &quot;Seed default jobs&quot; to install the
            standard cron catalog.
          </p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Job</TH>
                <TH>Type</TH>
                <TH>Cron</TH>
                <TH>Enabled</TH>
                <TH>Last run</TH>
                <TH>Action</TH>
              </TR>
            </THead>
            <TBody>
              {defs.map((d) => (
                <TR key={d.id}>
                  <TD>
                    <div className="text-sm text-ink font-medium">{d.name}</div>
                    <div className="text-[11px] text-ink-tertiary font-mono">{d.key}</div>
                  </TD>
                  <TD>
                    <Badge tone="outline">{d.jobType.replace(/_/g, " ")}</Badge>
                  </TD>
                  <TD className="font-mono text-xs">{d.scheduleCron ?? "—"}</TD>
                  <TD>
                    <Badge tone={d.enabled ? "success" : "neutral"}>
                      {d.enabled ? "enabled" : "disabled"}
                    </Badge>
                  </TD>
                  <TD className="text-xs">
                    {d.lastRunAt ? (
                      <div className="flex items-center gap-2">
                        {d.lastRunStatus && <JobStatusPill status={d.lastRunStatus} />}
                        <span className="text-ink-tertiary tabular-nums">
                          {d.lastRunAt.slice(0, 16).replace("T", " ")}
                        </span>
                        {d.lastDurationMs !== null && (
                          <span className="text-ink-tertiary">{d.lastDurationMs}ms</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-ink-tertiary">never</span>
                    )}
                  </TD>
                  <TD>
                    <RunNowButton jobKey={d.key} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Section>

      <Section
        eyebrow="Recent runs"
        title="Activity"
        action={
          <Link href="/dashboard/jobs/runs" className="text-xs underline text-ink-secondary">
            All runs
          </Link>
        }
      >
        {recentRuns.length === 0 ? (
          <p className="text-sm text-ink-tertiary">No runs yet.</p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>When</TH>
                <TH>Job</TH>
                <TH>Trigger</TH>
                <TH>Status</TH>
                <TH>Duration</TH>
                <TH>Summary</TH>
              </TR>
            </THead>
            <TBody>
              {recentRuns.map((r) => (
                <TR key={r.id}>
                  <TD className="text-xs text-ink-tertiary tabular-nums">
                    {r.startedAt.slice(0, 16).replace("T", " ")}
                  </TD>
                  <TD className="font-mono text-xs">
                    <Link href={`/dashboard/jobs/runs/${r.id}`} className="hover:underline">
                      {r.jobKey}
                    </Link>
                  </TD>
                  <TD>
                    <Badge tone="outline">{r.triggerType}</Badge>
                  </TD>
                  <TD>
                    <JobStatusPill status={r.status} />
                  </TD>
                  <TD className="text-xs font-mono tabular-nums">
                    {r.durationMs !== null ? `${r.durationMs}ms` : "—"}
                  </TD>
                  <TD className="text-xs text-ink-secondary truncate max-w-[480px]">
                    {r.resultSummary ?? "—"}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Section>
    </div>
  );
}
