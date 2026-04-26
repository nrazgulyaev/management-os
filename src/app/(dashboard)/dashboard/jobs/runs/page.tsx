import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { DbStatusNotice } from "@/components/admin/db-status";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
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

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[
          { label: "Jobs", href: "/dashboard/jobs" },
          { label: "Runs" },
        ]}
        title="Job runs"
        description="Every cron + manual run with status, duration, summary."
      />
      <DbStatusNotice />

      <div className="flex flex-wrap gap-2">
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

      {runs.length === 0 ? (
        <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
          No runs match these filters.
        </p>
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
              <TH>By</TH>
            </TR>
          </THead>
          <TBody>
            {runs.map((r) => (
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
                <TD className="text-xs text-ink-secondary truncate max-w-[400px]">
                  {r.resultSummary ?? "—"}
                </TD>
                <TD className="text-xs text-ink-tertiary">{r.createdByName ?? "—"}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
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
    <Link
      href={href}
      className={`text-[11px] uppercase tracking-widest px-3 py-1.5 rounded-full border ${
        active
          ? "bg-ink text-ink-inverse border-ink"
          : "border-line-soft text-ink-secondary hover:border-line-strong"
      }`}
    >
      {label}
    </Link>
  );
}
