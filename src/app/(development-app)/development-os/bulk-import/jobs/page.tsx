import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  "info" | "success" | "warning" | "danger" | "neutral"
> = {
  pending: "neutral",
  validating: "info",
  ready: "info",
  processing: "warning",
  completed: "success",
  failed: "danger",
  cancelled: "neutral",
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
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Bulk import", href: "/development-os/bulk-import" },
          { label: "Past jobs" },
        ]}
        eyebrow={`${jobs.length} past job${jobs.length === 1 ? "" : "s"}`}
        title="Bulk import jobs"
        description="Every CSV/XLSX/JSON import this organization has run. Click a job for the per-row error log."
        actions={
          <div className="flex items-center gap-2">
            <Button asChild>
              <Link href="/development-os/bulk-import">
                <Plus className="w-4 h-4" strokeWidth={1.75} />
                New import
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/development-os">
                <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
                Command center
              </Link>
            </Button>
          </div>
        }
      />

      {jobs.length === 0 ? (
        <EmptyState
          title="No imports yet"
          description="Use the New import button above to upload your first file."
        />
      ) : (
        <Section title="All jobs">
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
                    <Badge tone={STATUS_TONE[j.status] ?? "neutral"}>
                      {j.status}
                    </Badge>
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
        </Section>
      )}
    </DevelopmentShell>
  );
}
