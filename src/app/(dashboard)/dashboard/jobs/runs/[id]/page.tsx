import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { JobStatusPill } from "@/components/jobs/job-status-pill";
import { DbStatusNotice } from "@/components/admin/db-status";
import { getJobRunById } from "@/features/jobs/services";

export const metadata = { title: "Job run" };
export const dynamic = "force-dynamic";

const LEVEL_TONE: Record<
  string,
  "neutral" | "warning" | "info" | "success" | "danger"
> = {
  debug: "neutral",
  info: "info",
  warning: "warning",
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
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[
          { label: "Jobs", href: "/dashboard/jobs" },
          { label: "Runs", href: "/dashboard/jobs/runs" },
          { label: run.jobKey },
        ]}
        title={run.jobKey}
        description={`${run.triggerType} run · ${run.startedAt.slice(0, 16).replace("T", " ")}`}
        actions={<JobStatusPill status={run.status} />}
      />
      <DbStatusNotice />

      <div className="rounded-lg border border-line-soft bg-surface p-6 grid grid-cols-2 md:grid-cols-4 gap-6">
        <Stat label="Trigger" value={<Badge tone="outline">{run.triggerType}</Badge>} />
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
          value={run.finishedAt ? run.finishedAt.slice(0, 19).replace("T", " ") : "—"}
        />
      </div>

      {run.resultSummary && (
        <Section eyebrow="Summary" title="Result">
          <p className="text-sm text-ink whitespace-pre-line">{run.resultSummary}</p>
        </Section>
      )}

      {run.metrics && (
        <Section eyebrow="Metrics" title="Counters / breakdown">
          <pre className="rounded-md border border-line-soft bg-muted/30 p-4 text-xs text-ink-secondary overflow-auto">
            {JSON.stringify(run.metrics, null, 2)}
          </pre>
        </Section>
      )}

      {run.errorMessage && (
        <Section eyebrow="Error" title="Failure detail">
          <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-3 text-sm text-ink whitespace-pre-line">
            {run.errorMessage}
          </div>
        </Section>
      )}

      <Section eyebrow="Events" title={`${run.events.length} log entries`}>
        {run.events.length === 0 ? (
          <p className="text-sm text-ink-tertiary">No log events recorded.</p>
        ) : (
          <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
            <ul className="divide-y divide-line-soft">
              {run.events.map((e) => (
                <li key={e.id} className="p-3 flex items-start gap-3">
                  <Badge tone={LEVEL_TONE[e.level] ?? "neutral"}>{e.level}</Badge>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-ink">{e.message}</div>
                    {e.metadata && (
                      <pre className="text-[11px] text-ink-tertiary mt-1 whitespace-pre-wrap font-mono">
                        {JSON.stringify(e.metadata, null, 2)}
                      </pre>
                    )}
                  </div>
                  <span className="text-[11px] text-ink-tertiary tabular-nums shrink-0">
                    {e.createdAt.slice(11, 19)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-ink-tertiary">{label}</div>
      <div className="text-sm text-ink mt-1">{value}</div>
    </div>
  );
}
