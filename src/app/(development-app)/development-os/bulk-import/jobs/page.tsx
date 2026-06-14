import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { HandoffBadge } from "@/components/dashboard/primitives";
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
import { listBulkImportJobs } from "@/lib/development/server/bulk-import/import-actions";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = { title: "Bulk import jobs · Development OS" };
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

export default async function BulkImportJobsPage() {
  const jobs = await safeQuery(
    "listBulkImportJobs",
    listBulkImportJobs(),
    [],
    4000,
  );

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/bulk-import">Bulk import</Link> /{" "}
            <span>Past jobs</span>
          </div>
          <h1>Bulk import jobs</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Every CSV/XLSX/JSON import this organization has run. Click a job for
            the per-row error log.
          </p>
        </div>
        <div className="actions">
          <Link href="/development-os/bulk-import" className="btn btn-accent">
            <Plus className="w-4 h-4" strokeWidth={1.75} />
            New import
          </Link>
          <Link href="/development-os" className="btn btn-secondary btn-sm">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Command center
          </Link>
        </div>
      </div>

      {jobs.length === 0 ? (
        <EmptyState
          title="No imports yet"
          description="Use the New import button above to upload your first file."
        />
      ) : (
        <div>
          <div className="label mb-2.5">All jobs</div>
          <Table>
            <THead>
              <TR>
                <TH>Job code</TH>
                <TH>Entity</TH>
                <TH>Source</TH>
                <TH>File</TH>
                <TH>Status</TH>
                <TH className="text-right">Total</TH>
                <TH className="text-right">Success</TH>
                <TH className="text-right">Failed</TH>
                <TH>Started</TH>
              </TR>
            </THead>
            <TBody>
              {jobs.map((j) => (
                <TR key={j.id}>
                  <TD className="font-mono text-xs">{j.jobCode}</TD>
                  <TD>{j.entityType.replace(/_/g, " ")}</TD>
                  <TD className="text-xs">{j.sourceType}</TD>
                  <TD className="text-xs text-ink-tertiary truncate max-w-[200px]">
                    {j.sourceFilename ?? "—"}
                  </TD>
                  <TD>
                    <HandoffBadge tone={STATUS_TONE[j.status] ?? "soft"}>
                      {j.status}
                    </HandoffBadge>
                  </TD>
                  <TDNum>{j.totalRows ?? "—"}</TDNum>
                  <TDNum>{j.successfulRows}</TDNum>
                  <TDNum>{j.failedRows}</TDNum>
                  <TD className="text-xs text-ink-tertiary">
                    {new Date(j.initiatedAt).toLocaleString()}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </DevelopmentShell>
  );
}
