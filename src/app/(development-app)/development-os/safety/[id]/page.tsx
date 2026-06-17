import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getSafetyIncidentDetail } from "@/lib/development/server/safety";
import {
  SAFETY_CATEGORY_LABEL,
  SAFETY_SEVERITY_LABEL,
  SAFETY_SEVERITY_TONE,
  SAFETY_STATUS_LABEL,
} from "@/lib/development/constants/safety-constants";
import { SafetyStatusControl } from "../_status-control";
import { SafetyEvidenceGallery } from "./_evidence-gallery";
import { SafetyEvidenceUploadZone } from "./_evidence-upload-zone";

export const metadata: Metadata = { title: "Safety incident · Development OS" };
export const dynamic = "force-dynamic";

/** Presentational map: legacy severity tone → handoff badge tone. */
const SEVERITY_BADGE_TONE: Record<
  "neutral" | "info" | "warning" | "danger",
  "soft" | "info" | "warn" | "danger"
> = {
  neutral: "soft",
  info: "info",
  warning: "warn",
  danger: "danger",
};

export default async function SafetyIncidentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <h1>Safety incident</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }

  const incident = await getSafetyIncidentDetail(decodeURIComponent(id));
  if (!incident) notFound();

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/safety">Safety</Link> /{" "}
            <span className="mono">{incident.incidentCode}</span>
          </div>
          <h1>
            {SAFETY_CATEGORY_LABEL[incident.category]} incident ·{" "}
            {incident.incidentDate}
          </h1>
          <div className="flex items-center gap-2 mt-2">
            <HandoffBadge
              tone={SEVERITY_BADGE_TONE[SAFETY_SEVERITY_TONE[incident.severity]]}
            >
              {SAFETY_SEVERITY_LABEL[incident.severity]}
            </HandoffBadge>
            <HandoffBadge
              tone={
                incident.status === "open"
                  ? "danger"
                  : incident.status === "under_investigation"
                    ? "warn"
                    : "soft"
              }
            >
              {SAFETY_STATUS_LABEL[incident.status]}
            </HandoffBadge>
            {incident.reportedToAuthorities && (
              <HandoffBadge tone="info">Reported to authorities</HandoffBadge>
            )}
          </div>
        </div>
        <div className="actions">
          <Link href="/development-os/safety" className="btn btn-secondary btn-sm">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Incident log
          </Link>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Status</div>
        <Card padding="default">
          <SafetyStatusControl id={incident.id} status={incident.status} />
          {incident.resolutionNotes && (
            <div className="mt-3">
              <div className="text-[11px] uppercase tracking-wide text-ink-tertiary">
                Resolution notes
              </div>
              <p className="text-sm whitespace-pre-wrap mt-0.5">
                {incident.resolutionNotes}
              </p>
            </div>
          )}
        </Card>
      </div>

      <div>
        <div className="label mb-2.5">Description</div>
        <Card padding="default">
          <p className="text-sm whitespace-pre-wrap m-0">{incident.description}</p>
        </Card>
      </div>

      <div>
        <div className="label mb-2.5">Immediate actions taken</div>
        <Card padding="default">
          {incident.immediateActionsTaken ? (
            <p className="text-sm whitespace-pre-wrap m-0">
              {incident.immediateActionsTaken}
            </p>
          ) : (
            <p className="text-sm text-ink-tertiary m-0">
              No immediate actions recorded.
            </p>
          )}
        </Card>
      </div>

      <div>
        <div className="label mb-2.5">Authority reporting</div>
        <Card padding="default">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            <Field
              label="Reported to authorities"
              value={incident.reportedToAuthorities ? "Yes" : "No"}
            />
            <Field
              label="Authority report reference"
              value={incident.authorityReportReference ?? "—"}
              mono
            />
            <Field
              label="Affected workers"
              value={String(incident.affectedWorkersCount)}
            />
          </div>
        </Card>
      </div>

      <div>
        <div className="label mb-2.5">Context</div>
        <Card padding="default">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            <Field label="Project" value={incident.projectName ?? incident.projectId.slice(0, 8)} />
            <Field label="Incident time" value={incident.incidentTime ?? "—"} mono />
            <Field
              label="Zone"
              value={incident.zoneId?.slice(0, 8) ?? "—"}
              mono
            />
            <Field
              label="Related site report"
              value={incident.relatedSiteReportId?.slice(0, 8) ?? "—"}
              mono
            />
            <Field
              label="Vendor engagement"
              value={incident.vendorEngagementId?.slice(0, 8) ?? "—"}
              mono
            />
            <Field
              label="Resolved at"
              value={
                incident.resolvedAt
                  ? new Date(incident.resolvedAt).toLocaleString()
                  : "—"
              }
            />
          </div>
        </Card>
      </div>

      <div>
        <div className="label mb-2.5">Evidence</div>
        <Card padding="default">
          <div className="space-y-4">
            <SafetyEvidenceGallery
              photoDocumentIds={incident.photoDocumentIds}
              reportDocumentId={incident.reportDocumentId}
            />
            <div>
              <h4 className="text-[11px] uppercase tracking-wide text-ink-tertiary mb-2">
                Add photos / report
              </h4>
              <SafetyEvidenceUploadZone incidentId={incident.id} />
            </div>
          </div>
        </Card>
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
