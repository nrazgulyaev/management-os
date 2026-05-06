import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { listQaQcIssues } from "@/lib/development/server/qa-qc/qa-qc-queries";
import { safeQuery } from "@/lib/development/safe-query";
import { ExportButton } from "@/components/development/bulk-import/export-button";

export const metadata: Metadata = { title: "QA/QC · Development OS" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "info" | "success" | "warning" | "danger" | "neutral"> = {
  open: "warning",
  assigned: "info",
  in_progress: "info",
  ready_for_reinspection: "warning",
  rejected: "danger",
  accepted: "success",
  closed: "neutral",
};

const SEVERITY_TONE: Record<string, "info" | "success" | "warning" | "danger" | "neutral"> = {
  low: "neutral",
  medium: "info",
  high: "warning",
  critical: "danger",
};

export default async function QaQcListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; severity?: string }>;
}) {
  const params = await searchParams;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="QA/QC" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const issues = await safeQuery(
    "listQaQcIssues",
    listQaQcIssues({ status: params.status, severity: params.severity }),
    [],
    4000,
  );

  const openCount = issues.filter(
    (i) => !["accepted", "closed"].includes(i.status),
  ).length;

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "QA/QC" },
        ]}
        eyebrow={`${openCount} open / ${issues.length} total`}
        title="QA/QC defect tracking"
        description="Per-villa quality issues. Lifecycle: open → assigned → in_progress → ready_for_reinspection → accepted/rejected → closed. Status transitions are validated by qa-qc-helpers.ts (pure, runtime tested)."
        actions={
          <div className="flex gap-2">
            <Button asChild>
              <Link href="/development-os/qa-qc/new">
                <Plus className="w-4 h-4" strokeWidth={1.75} />
                New issue
              </Link>
            </Button>
            <ExportButton entity="qa_qc_issues" />
            <Button asChild variant="secondary">
              <Link href="/development-os">
                <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
                Command center
              </Link>
            </Button>
          </div>
        }
      />

      {issues.length === 0 ? (
        <EmptyState
          title="No issues match your filter"
          description="Open the create form above to log a new defect."
        />
      ) : (
        <Section eyebrow="Inbox" title="Issues (most recent first)">
          <Table>
            <THead>
              <TR>
                <TH>Code</TH>
                <TH>Title</TH>
                <TH>Severity</TH>
                <TH>Status</TH>
                <TH>Villa</TH>
                <TH>Deadline</TH>
                <TH>Reported</TH>
              </TR>
            </THead>
            <TBody>
              {issues.map((i) => (
                <TR key={i.id}>
                  <TD className="font-mono text-xs">
                    <Link
                      href={`/development-os/qa-qc/${i.issueCode}`}
                      className="hover:underline"
                    >
                      {i.issueCode}
                    </Link>
                  </TD>
                  <TD className="text-sm">{i.title}</TD>
                  <TD>
                    <Badge tone={SEVERITY_TONE[i.severity] ?? "neutral"}>
                      {i.severity}
                    </Badge>
                  </TD>
                  <TD>
                    <Badge tone={STATUS_TONE[i.status] ?? "neutral"}>
                      {i.status}
                    </Badge>
                  </TD>
                  <TD className="font-mono text-xs">
                    {i.villaId?.slice(0, 8) ?? "—"}
                  </TD>
                  <TD className="text-xs">{i.deadlineAt ?? "—"}</TD>
                  <TD className="text-xs">
                    {new Date(i.reportedAt).toISOString().slice(0, 10)}
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
