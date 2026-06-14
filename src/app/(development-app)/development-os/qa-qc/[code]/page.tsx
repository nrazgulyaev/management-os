import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ClipboardCheck } from "lucide-react";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getQaQcIssueByCode } from "@/lib/development/server/qa-qc/qa-qc-queries";
import { QaQcTransitionActions } from "@/components/development/qa-qc/qa-qc-transition-actions";
import { QaQcPhotoGallery } from "@/components/development/qa-qc/qa-qc-photo-gallery";
import { QaQcPhotoUploadZone } from "@/components/development/qa-qc/qa-qc-photo-upload-zone";
import type { QaQcStatus } from "@/lib/development/server/qa-qc/qa-qc-helpers";

export const metadata: Metadata = { title: "QA/QC issue · Development OS" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "info" | "ok" | "warn" | "danger" | "soft"> = {
  open: "warn",
  assigned: "info",
  in_progress: "info",
  ready_for_reinspection: "warn",
  rejected: "danger",
  accepted: "ok",
  closed: "soft",
};

const SEVERITY_TONE: Record<string, "info" | "ok" | "warn" | "danger" | "soft"> = {
  low: "soft",
  medium: "info",
  high: "warn",
  critical: "danger",
};

const RESULT_TONE: Record<string, "ok" | "danger" | "warn" | "soft"> = {
  passed: "ok",
  failed: "danger",
  partial_pass: "warn",
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
        <div className="page-header">
          <div className="left">
            <h1>QA/QC issue</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const data = await getQaQcIssueByCode(decodeURIComponent(code));
  if (!data) notFound();
  const { issue, photos, inspections } = data;

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/qa-qc">QA/QC</Link> /{" "}
            <span>{issue.issueCode}</span> · {issue.severity} severity
          </div>
          <h1>{issue.title}</h1>
          {issue.description && (
            <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
              {issue.description}
            </p>
          )}
        </div>
        <div className="actions">
          {issue.status === "ready_for_reinspection" && (
            <Link
              href={`/development-os/qa-qc/${issue.issueCode}/inspect`}
              className="btn btn-accent btn-sm"
            >
              <ClipboardCheck className="w-4 h-4" strokeWidth={1.75} />
              Record inspection
            </Link>
          )}
          <Link href="/development-os/qa-qc" className="btn btn-secondary btn-sm">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Inbox
          </Link>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Status</div>
        <Card padding="default">
          <div className="flex items-center gap-2 mb-3">
            <HandoffBadge tone={STATUS_TONE[issue.status] ?? "soft"}>
              {issue.status}
            </HandoffBadge>
            <HandoffBadge tone={SEVERITY_TONE[issue.severity] ?? "soft"}>
              {issue.severity}
            </HandoffBadge>
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
        </Card>
      </div>

      <div>
        <div className="label mb-2.5">Details</div>
        <Card padding="default">
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
        </Card>
      </div>

      <div>
        <div className="label mb-2.5">Inspections</div>
        {inspections.length === 0 ? (
          <Card padding="default">
            <p className="text-sm text-ink-tertiary m-0">
              No inspections yet. Once the contractor marks the issue
              'ready_for_reinspection', record an inspection from the action above.
            </p>
          </Card>
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
                    <HandoffBadge tone={RESULT_TONE[i.result] ?? "soft"}>
                      {i.result}
                    </HandoffBadge>
                  </TD>
                  <TD className="text-xs">{i.resultNotes ?? "—"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>

      <div>
        <div className="label mb-2.5">Photos</div>
        <Card padding="default">
          <div className="space-y-4">
            <QaQcPhotoGallery
              photos={photos.map((p) => ({
                id: p.id,
                documentId: p.documentId,
                photoRole: p.photoRole,
                caption: p.caption,
                uploadedAt: new Date(p.uploadedAt).toISOString(),
              }))}
            />
            <div>
              <h4 className="text-[11px] uppercase tracking-wide text-ink-tertiary mb-2">
                Add site evidence
              </h4>
              <QaQcPhotoUploadZone issueId={issue.id} />
            </div>
          </div>
        </Card>
      </div>

      {issue.notes && (
        <div>
          <div className="label mb-2.5">Notes</div>
          <Card padding="default">
            <p className="text-sm text-ink-secondary whitespace-pre-wrap m-0">
              {issue.notes}
            </p>
          </Card>
        </div>
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
