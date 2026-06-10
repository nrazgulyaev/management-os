import Link from "next/link";
import { notFound } from "next/navigation";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { JobStatusPill } from "@/components/jobs/job-status-pill";
import { DbStatusNotice } from "@/components/admin/db-status";
import { getJobRunById } from "@/features/jobs/services";

export const metadata = { title: "Job run" };
export const dynamic = "force-dynamic";

const LEVEL_TONE: Record<
  string,
  "soft" | "warn" | "info" | "ok" | "danger" | undefined
> = {
  debug: "soft",
  info: "info",
  warning: "warn",
  error: "danger",
};

export default async function JobRunDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const run = await getJobRunById(id);
  if (!run) notFound();

  return (
    <>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/jobs">Jobs</Link> /{" "}
            <Link href="/dashboard/jobs/runs">Runs</Link> /{" "}
            <span>{run.jobKey}</span>
          </div>
          <h1>{run.jobKey}</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            {run.triggerType} run · {run.startedAt.slice(0, 16).replace("T", " ")}
          </p>
        </div>
        <div className="actions">
          <JobStatusPill status={run.status} />
        </div>
      </div>

      <DbStatusNotice />

      <div className="card card-pad mb-[18px]">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <Stat
            label="Trigger"
            value={<HandoffBadge>{run.triggerType}</HandoffBadge>}
          />
          <Stat label="Status" value={<JobStatusPill status={run.status} />} />
          <Stat
            label="Duration"
            value={run.durationMs !== null ? `${run.durationMs}ms` : "—"}
          />
          <Stat label="By" value={run.createdByName ?? "system"} />
          <Stat
            label="Started"
            value={run.startedAt.slice(0, 19).replace("T", " ")}
          />
          <Stat
            label="Finished"
            value={
              run.finishedAt ? run.finishedAt.slice(0, 19).replace("T", " ") : "—"
            }
          />
        </div>
      </div>

      {run.resultSummary && (
        <div className="card card-pad mb-[18px]">
          <div className="gs-card-h">
            <h3>Result</h3>
            <span className="meta">SUMMARY</span>
          </div>
          <p className="text-[13px] text-ink whitespace-pre-line m-0">
            {run.resultSummary}
          </p>
        </div>
      )}

      {run.metrics && (
        <div className="card card-pad mb-[18px]">
          <div className="gs-card-h">
            <h3>Counters / breakdown</h3>
            <span className="meta">METRICS</span>
          </div>
          <pre className="rounded-md border border-line-soft bg-muted/30 p-4 text-xs text-ink-secondary overflow-auto m-0">
            {JSON.stringify(run.metrics, null, 2)}
          </pre>
        </div>
      )}

      {run.errorMessage && (
        <div className="card card-pad mb-[18px]">
          <div className="gs-card-h">
            <h3>Failure detail</h3>
            <span className="meta">ERROR</span>
          </div>
          <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-3 text-sm text-ink whitespace-pre-line">
            {run.errorMessage}
          </div>
        </div>
      )}

      <div className="card card-pad">
        <div className="gs-card-h">
          <h3>Log events</h3>
          <span className="meta">
            {run.events.length} ENTR{run.events.length === 1 ? "Y" : "IES"}
          </span>
        </div>
        {run.events.length === 0 ? (
          <p className="text-[13px] text-ink-3 m-0">No log events recorded.</p>
        ) : (
          <ul className="clean">
            {run.events.map((e) => (
              <li key={e.id} className="flex items-start gap-3">
                <HandoffBadge tone={LEVEL_TONE[e.level]}>{e.level}</HandoffBadge>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-ink">{e.message}</div>
                  {e.metadata && (
                    <pre className="text-[11px] text-ink-4 mt-1 whitespace-pre-wrap font-mono m-0">
                      {JSON.stringify(e.metadata, null, 2)}
                    </pre>
                  )}
                </div>
                <span className="mono text-[11px] text-ink-4 tabular-nums shrink-0">
                  {e.createdAt.slice(11, 19)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="text-[13px] text-ink mt-1">{value}</div>
    </div>
  );
}
