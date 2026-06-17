import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Kpi, HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
  TDNum,
} from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getBulkImportJob } from "@/lib/development/server/bulk-import/import-actions";
import { safeQuery } from "@/lib/development/safe-query";

/**
 * Bulk import job detail — per-row error log.
 *
 * `getBulkImportJob` is org-scoped (it loads the row only when its
 * organization_id matches the caller's org), so a foreign job id 404s.
 * The per-row failures live in the job's `error_log` JSONB column
 * ([{ rowIndex, field?, message }, …]) — surfaced here as a table.
 */

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<
  string,
  "info" | "ok" | "warn" | "danger" | "soft"
> = {
  pending: "soft",
  validating: "info",
  ready: "info",
  processing: "warn",
  completed: "ok",
  failed: "danger",
  cancelled: "soft",
};

type ErrorLogEntry = {
  rowIndex?: number;
  row?: number;
  field?: string;
  message: string;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const job = await safeQuery(
    "bulkImportJob.meta",
    getBulkImportJob({ jobId: id }),
    null,
    4000,
  );
  return {
    title: job ? `${job.jobCode} · Bulk import` : "Bulk import job",
  };
}

export default async function BulkImportJobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const job = await safeQuery(
    "bulkImportJob",
    getBulkImportJob({ jobId: id }),
    null,
    4000,
  );
  if (!job) notFound();

  const errors: ErrorLogEntry[] = Array.isArray(job.errorLog)
    ? (job.errorLog as ErrorLogEntry[])
    : [];

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/bulk-import">Bulk import</Link> /{" "}
            <Link href="/development-os/bulk-import/jobs">Past jobs</Link> /{" "}
            <span>{job.jobCode}</span>
          </div>
          <h1>{job.jobCode}</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            {job.entityType.replace(/_/g, " ")} · {job.sourceType}
            {job.sourceFilename ? ` · ${job.sourceFilename}` : ""} · started{" "}
            {new Date(job.initiatedAt).toLocaleString()}
          </p>
        </div>
        <div className="actions">
          <Link
            href="/development-os/bulk-import/jobs"
            className="btn btn-secondary btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            All jobs
          </Link>
        </div>
      </div>

      <div>
        <div className="label mb-2.5 flex items-center gap-2">
          Summary
          <HandoffBadge tone={STATUS_TONE[job.status] ?? "soft"}>
            {job.status}
          </HandoffBadge>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi label="Total rows" value={String(job.totalRows ?? "—")} />
          <Kpi label="Processed" value={String(job.processedRows)} />
          <Kpi
            label="Successful"
            value={String(job.successfulRows)}
            tone={job.successfulRows > 0 ? "accent" : undefined}
          />
          <Kpi label="Failed" value={String(job.failedRows)} />
        </div>
      </div>

      <div>
        <div className="label mb-2.5">{errors.length} row error(s)</div>
        {errors.length === 0 ? (
          <EmptyState
            title="No row errors"
            description={
              job.status === "completed"
                ? "Every row imported cleanly."
                : "No per-row errors were logged for this job."
            }
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH className="text-right">Row</TH>
                <TH>Field</TH>
                <TH>Error</TH>
              </TR>
            </THead>
            <TBody>
              {errors.map((e, i) => {
                const rowNum = e.rowIndex ?? e.row;
                return (
                  <TR key={`${rowNum ?? "x"}-${e.field ?? ""}-${i}`}>
                    <TDNum>
                      {rowNum === undefined || rowNum < 0 ? "—" : rowNum + 1}
                    </TDNum>
                    <TD className="font-mono text-xs">{e.field ?? "—"}</TD>
                    <TD className="text-xs">{e.message}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </div>
    </DevelopmentShell>
  );
}
