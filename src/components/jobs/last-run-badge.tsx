import Link from "next/link";
import { JobStatusPill } from "./job-status-pill";
import type { JobRunRow } from "@/features/jobs/services";

/**
 * Compact last-run summary badge — used by integrations / inventory /
 * finance dashboards to surface the cron heartbeat without the operator
 * leaving the page.
 */
export function LastRunBadge({
  label,
  run,
}: {
  label: string;
  run: JobRunRow | null;
}) {
  if (!run) {
    return (
      <div className="rounded-md border border-dashed border-line-soft bg-muted/20 px-3 py-2 text-xs text-ink-tertiary">
        {label}: never run
      </div>
    );
  }
  return (
    <Link
      href={`/dashboard/jobs/runs/${run.id}`}
      className="rounded-md border border-line-soft bg-surface px-3 py-2 flex items-center gap-3 text-xs hover:border-line-strong"
    >
      <span className="text-ink-tertiary">{label}</span>
      <JobStatusPill status={run.status} />
      <span className="text-ink-secondary">
        {run.startedAt.slice(0, 16).replace("T", " ")}
      </span>
      {run.resultSummary && (
        <span className="text-ink-tertiary truncate max-w-[280px]">
          {run.resultSummary}
        </span>
      )}
    </Link>
  );
}
