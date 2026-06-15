import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getDrawingByCode } from "@/lib/development/server/drawings/drawing-queries";
import { RevisionActions } from "./_revision-actions";
import { AddRevisionButton } from "./_add-revision-button";
import { resolveRevisionImage } from "./_resolve-revision-image";
import { RevisionImageViewer } from "./_revision-image-viewer";

export const metadata: Metadata = { title: "Drawing · Development OS" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "info" | "ok" | "warn" | "danger" | "soft"> = {
  draft: "soft",
  for_review: "info",
  approved: "info",
  issued_for_construction: "ok",
  superseded: "soft",
  rejected: "danger",
};

export default async function DrawingDetailPage({
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
            <h1>Drawing</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const data = await getDrawingByCode(decodeURIComponent(code));
  if (!data) notFound();
  const { drawing, revisions } = data;

  const ifc = revisions.find((r) => r.status === "issued_for_construction");

  // Preview the active drawing: the IFC revision when one exists, otherwise
  // the most recent revision (revisions are ordered by revisionDate desc).
  const previewRevision = ifc ?? revisions[0] ?? null;
  const previewImage = previewRevision
    ? await resolveRevisionImage(previewRevision.documentId)
    : null;

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/drawings">Drawings</Link> /{" "}
            <span>{drawing.drawingCode}</span>
          </div>
          <h1>{drawing.title}</h1>
          {drawing.description && (
            <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
              {drawing.description}
            </p>
          )}
        </div>
        <div className="actions">
          <AddRevisionButton drawingId={drawing.id} />
          <Link
            href={`/development-os/drawings/${encodeURIComponent(drawing.drawingCode)}/distribution`}
            className="btn btn-secondary btn-sm"
          >
            Distribution log
          </Link>
          <Link href="/development-os/drawings" className="btn btn-secondary btn-sm">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            All drawings
          </Link>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Identity</div>
        <Card padding="default">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            <Field label="Code" value={drawing.drawingCode} mono />
            <Field label="Number" value={drawing.drawingNumber} mono />
            <Field label="Type" value={drawing.drawingType} />
            <Field label="Phase" value={drawing.drawingPhase ?? "—"} />
            <Field label="Author firm" value={drawing.authorFirm ?? "—"} />
            <Field label="Author name" value={drawing.authorName ?? "—"} />
            <Field label="Project" value={drawing.projectId.slice(0, 8)} mono />
            <Field
              label="Villa"
              value={drawing.villaId?.slice(0, 8) ?? "—"}
              mono
            />
            <Field
              label="Active IFC"
              value={ifc ? `Rev ${ifc.revisionLabel}` : "—"}
            />
          </div>
        </Card>
      </div>

      <div>
        <div className="label mb-2.5">Preview</div>
        {previewRevision && (
          <p className="text-[13px] text-ink-3 mt-2 mb-2.5 max-w-[680px]">
            Read-only view of the active revision&apos;s drawing. Pan and use the
            measurement overlay; takeoff lives in BOQ → Takeoff.
          </p>
        )}
        {!previewRevision ? (
          <EmptyState
            title="No revision to preview"
            description="Add a revision with an attached document to preview the drawing."
          />
        ) : previewImage?.url && !previewImage.isPdf ? (
          <RevisionImageViewer
            imageUrl={previewImage.url}
            imageAlt={`${drawing.drawingCode} — Rev ${previewRevision.revisionLabel}`}
          />
        ) : previewImage?.isPdf ? (
          <EmptyState
            title="PDF revision"
            description="This revision's document is a PDF. Inline preview is not yet supported — image revisions render here. (Follow-up: rasterise PDF pages.)"
          />
        ) : (
          <EmptyState
            title="No drawing image available"
            description="This revision has no stored image file, or storage is not configured."
          />
        )}
      </div>

      <div>
        <div className="label mb-2.5">Revisions</div>
        {revisions.length === 0 ? (
          <EmptyState
            title="No revisions yet"
            description="Add the first revision to attach a file."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Rev</TH>
                <TH>Date</TH>
                <TH>Status</TH>
                <TH>Reason</TH>
                <TH>Document</TH>
                <TH>Approved</TH>
                <TH>IFC at</TH>
                <TH>Actions</TH>
              </TR>
            </THead>
            <TBody>
              {revisions.map((r) => (
                <TR key={r.id}>
                  <TD className="font-mono text-xs">{r.revisionLabel}</TD>
                  <TD className="text-xs">{r.revisionDate}</TD>
                  <TD>
                    <HandoffBadge tone={STATUS_TONE[r.status] ?? "soft"}>
                      {r.status}
                    </HandoffBadge>
                  </TD>
                  <TD className="text-xs">{r.revisionReason ?? "—"}</TD>
                  <TD className="font-mono text-xs flex items-center gap-1">
                    <FileText className="w-3 h-3" />
                    {r.documentId.slice(0, 8)}
                  </TD>
                  <TD className="text-xs">
                    {r.approvedAt
                      ? new Date(r.approvedAt).toISOString().slice(0, 10)
                      : "—"}
                  </TD>
                  <TD className="text-xs">
                    {r.issuedForConstructionAt
                      ? new Date(r.issuedForConstructionAt)
                          .toISOString()
                          .slice(0, 10)
                      : "—"}
                  </TD>
                  <TD>
                    <RevisionActions revisionId={r.id} status={r.status} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>
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
