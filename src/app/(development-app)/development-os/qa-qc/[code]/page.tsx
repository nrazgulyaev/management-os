import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ClipboardCheck } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getQaQcIssueByCode } from "@/lib/development/server/qa-qc/qa-qc-queries";
import { QaQcTransitionActions } from "@/components/development/qa-qc/qa-qc-transition-actions";
import type { QaQcStatus } from "@/lib/development/server/qa-qc/qa-qc-helpers";

export const metadata: Metadata = { title: "QA/QC issue · Development OS" };
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

const RESULT_TONE: Record<string, "success" | "danger" | "warning" | "neutral"> = {
  passed: "success",
  failed: "danger",
  partial_pass: "warning",
};

export default async function QaQcDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="QA/QC issue" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const data = await getQaQcIssueByCode(decodeURIComponent(code));
  if (!data) notFound();
  const { issue, photos, inspections } = data;

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "QA/QC", href: "/development-os/qa-qc" },
          { label: issue.issueCode },
        ]}
        eyebrow={`${issue.issueCode} · ${issue.severity} severity`}
        title={issue.title}
        description={issue.description}
        actions={
          <div className="flex gap-2">
            {issue.status === "ready_for_reinspection" && (
              <Button asChild>
                <Link href={`/development-os/qa-qc/${issue.issueCode}/inspect`}>
                  <ClipboardCheck className="w-4 h-4" strokeWidth={1.75} />
                  Record inspection
                </Link>
              </Button>
            )}
            <Button asChild variant="secondary">
              <Link href="/development-os/qa-qc">
                <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
                Inbox
              </Link>
            </Button>
          </div>
        }
      />

      <Section eyebrow="Status" title="Lifecycle">
        <div className="flex items-center gap-2 mb-3">
          <Badge tone={STATUS_TONE[issue.status] ?? "neutral"}>
            {issue.status}
          </Badge>
          <Badge tone={SEVERITY_TONE[issue.severity] ?? "neutral"}>
            {issue.severity}
          </Badge>
          {issue.deadlineAt && (
            <span className="text-xs text-ink-tertiary">
              Deadline {issue.deadlineAt}
            </span>
          )}
        </div>
        <QaQcTransitionActions
          issueId={issue.id}
          status={issue.status as QaQcStatus}
        />
      </Section>

      <Section eyebrow="Details" title="Where + who">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <Field label="Project" value={issue.projectId.slice(0, 8)} mono />
          <Field
            label="Villa"
            value={issue.villaId?.slice(0, 8) ?? "—"}
            mono
          />
          <Field label="Zone" value={issue.zoneReference ?? "—"} />
          <Field label="Reported by" value={issue.reportedBy.slice(0, 8)} mono />
          <Field
            label="Assigned to"
            value={issue.assignedTo?.slice(0, 8) ?? "—"}
            mono
          />
          <Field
            label="Vendor"
            value={issue.responsibleVendorId?.slice(0, 8) ?? "—"}
            mono
          />
          <Field
            label="Reported at"
            value={new Date(issue.reportedAt).toLocaleString()}
          />
          <Field
            label="Resolved at"
            value={
              issue.resolvedAt ? new Date(issue.resolvedAt).toLocaleString() : "—"
            }
          />
          <Field
            label="Closed at"
            value={
              issue.closedAt ? new Date(issue.closedAt).toLocaleString() : "—"
            }
          />
        </div>
      </Section>

      <Section
        eyebrow="Inspections"
        title={`${inspections.length} round${inspections.length === 1 ? "" : "s"}`}
      >
        {inspections.length === 0 ? (
          <p className="text-sm text-ink-tertiary">
            No inspections yet. Once the contractor marks the issue
            'ready_for_reinspection', record an inspection from the action above.
          </p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>#</TH>
                <TH>Date</TH>
                <TH>Inspector</TH>
                <TH>Result</TH>
                <TH>Notes</TH>
              </TR>
            </THead>
            <TBody>
              {inspections.map((i) => (
                <TR key={i.id}>
                  <TD>{i.inspectionNumber}</TD>
                  <TD className="text-xs">{i.inspectionDate}</TD>
                  <TD className="font-mono text-xs">
                    {i.inspectorId.slice(0, 8)}
                  </TD>
                  <TD>
                    <Badge tone={RESULT_TONE[i.result] ?? "neutral"}>
                      {i.result}
                    </Badge>
                  </TD>
                  <TD className="text-xs">{i.resultNotes ?? "—"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Section>

      <Section eyebrow="Photos" title={`${photos.length} attached`}>
        {photos.length === 0 ? (
          <p className="text-sm text-ink-tertiary">No photos yet.</p>
        ) : (
          <ul className="text-sm space-y-1">
            {photos.map((p) => (
              <li key={p.id} className="flex items-center gap-2">
                <Badge tone="neutral">{p.photoRole}</Badge>
                <span className="font-mono text-xs">
                  {p.documentId.slice(0, 8)}
                </span>
                {p.caption && (
                  <span className="text-ink-secondary">— {p.caption}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {issue.notes && (
        <Section eyebrow="Notes" title="Operator notes">
          <p className="text-sm text-ink-secondary whitespace-pre-wrap">
            {issue.notes}
          </p>
        </Section>
      )}
    </DevelopmentShell>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-ink-tertiary">
        {label}
      </div>
      <div className={`mt-0.5 ${mono ? "font-mono text-xs" : "text-sm"}`}>
        {value}
      </div>
    </div>
  );
}
