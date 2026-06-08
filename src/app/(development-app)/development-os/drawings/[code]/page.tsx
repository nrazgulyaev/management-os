import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getDrawingByCode } from "@/lib/development/server/drawings/drawing-queries";
import { RevisionActions } from "./_revision-actions";

export const metadata: Metadata = { title: "Drawing · Development OS" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "info" | "success" | "warning" | "danger" | "neutral"> = {
  draft: "neutral",
  for_review: "info",
  approved: "info",
  issued_for_construction: "success",
  superseded: "neutral",
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
        <PageHeader title="Drawing" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const data = await getDrawingByCode(decodeURIComponent(code));
  if (!data) notFound();
  const { drawing, revisions } = data;

  const ifc = revisions.find((r) => r.status === "issued_for_construction");

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Drawings", href: "/development-os/drawings" },
          { label: drawing.drawingCode },
        ]}
        eyebrow={`${drawing.drawingType} · ${drawing.drawingPhase ?? "—"}`}
        title={drawing.title}
        description={drawing.description ?? undefined}
        actions={
          <div className="flex gap-2">
            <Button asChild variant="secondary">
              <Link
                href={`/development-os/drawings/${encodeURIComponent(drawing.drawingCode)}/distribution`}
              >
                Distribution log
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/development-os/drawings">
                <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
                All drawings
              </Link>
            </Button>
          </div>
        }
      />

      <Section eyebrow="Identity" title="Drawing metadata">
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
      </Section>

      <Section
        eyebrow="Revisions"
        title={`${revisions.length} revision${revisions.length === 1 ? "" : "s"}`}
      >
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
                    <Badge tone={STATUS_TONE[r.status] ?? "neutral"}>
                      {r.status}
                    </Badge>
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
      </Section>
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
