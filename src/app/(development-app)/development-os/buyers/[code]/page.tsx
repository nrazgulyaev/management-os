import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { asc, eq } from "drizzle-orm";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import {
  getBuyerByCode,
  listBuyerProgressReports,
} from "@/lib/development/server/buyers/buyer-queries";
import { projects, villas } from "@/lib/db/schema/projects";
import { safeQuery } from "@/lib/development/safe-query";
import { RecordTimeline } from "@/components/ui/primitives";
import { listCrmActivities } from "@/features/crm-activity/services";
import { LogActivityComposer } from "@/components/crm/log-activity-composer";
import { getCurrentUserContext } from "@/features/auth/permissions";
import {
  AssignUnitControl,
  KycStatusControl,
  PortalAccessControl,
  CreateProgressReportControl,
  ReportTransitionControls,
} from "./_controls";

export const metadata: Metadata = { title: "Buyer · Development OS" };
export const dynamic = "force-dynamic";

const ASSIGN_TONE: Record<string, "info" | "ok" | "warn" | "soft"> = {
  reserved: "info",
  contracted: "info",
  paying: "info",
  paid_in_full: "ok",
  handed_over: "ok",
  cancelled: "soft",
};

const REPORT_TONE: Record<string, "info" | "ok" | "warn" | "danger" | "soft"> = {
  draft: "soft",
  pending_approval: "warn",
  approved: "info",
  published: "ok",
  archived: "soft",
};

export default async function BuyerDetailPage({
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
            <h1>Buyer</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const data = await getBuyerByCode(code);
  if (!data) notFound();
  const { buyer, assignments } = data;

  // CRM ACTIVITY TIMELINE (#172 follow-on) — crm_activities already supports
  // subject_type 'buyer'; this is the first surface to mount it. Org-scoped
  // read; the composer beside it is permission-gated + audit-logged.
  //
  // Wire-up sweep — also source the dropdown inputs for the new lifecycle
  // + progress-report operator controls. All reads go through getDb()
  // (RLS-scoped to the operator's org, same as the buyers list / cashflow
  // pages); the write actions they feed are independently org-scoped.
  const [crmActivity, ctx, unitRows, projectRows] = await Promise.all([
    listCrmActivities("buyer", buyer.id).catch(() => []),
    getCurrentUserContext(),
    safeQuery(
      "buyer-detail villas",
      db
        .select({
          id: villas.id,
          unitCode: villas.unitCode,
          name: villas.name,
          projectId: villas.projectId,
          projectName: projects.name,
        })
        .from(villas)
        .innerJoin(projects, eq(villas.projectId, projects.id))
        .orderBy(asc(projects.name), asc(villas.unitCode)),
      [],
      4000,
    ),
    safeQuery(
      "buyer-detail projects",
      db
        .select({ id: projects.id, name: projects.name })
        .from(projects)
        .orderBy(asc(projects.name)),
      [],
      4000,
    ),
  ]);
  const canManageCrm = ctx.mode === "demo" || ctx.isInternal;

  const unitOptions = unitRows.map((u) => ({
    id: u.id,
    label: `${u.projectName} · ${u.unitCode}${u.name ? ` (${u.name})` : ""}`,
  }));

  // Progress reports for THIS buyer = reports whose unit is one of the
  // buyer's assigned units, plus project-level reports for the projects
  // those units belong to. listBuyerProgressReports filters by unit/project;
  // we fan out per assigned unit + dedupe by report id.
  const assignedUnitIds = new Set(assignments.map((a) => a.unitId));
  const reportProjectIds = new Set<string>();
  // Map each assigned unit to its project for project-level report lookup.
  const unitProjectIndex = new Map<string, string>(
    unitRows.map((u) => [u.id, u.projectId]),
  );
  for (const a of assignments) {
    const pid = unitProjectIndex.get(a.unitId);
    if (pid) reportProjectIds.add(pid);
  }

  const reportBatches = await Promise.all([
    ...[...assignedUnitIds].map((unitId) =>
      safeQuery(
        `buyer-reports unit ${unitId.slice(0, 8)}`,
        listBuyerProgressReports({ unitId }),
        [],
        4000,
      ),
    ),
    ...[...reportProjectIds].map((projectId) =>
      safeQuery(
        `buyer-reports project ${projectId.slice(0, 8)}`,
        listBuyerProgressReports({ projectId }),
        [],
        4000,
      ),
    ),
  ]);
  const reportsById = new Map<string, (typeof reportBatches)[number][number]>();
  for (const batch of reportBatches) {
    for (const r of batch) reportsById.set(r.id, r);
  }
  const reports = [...reportsById.values()].sort((a, b) =>
    (b.reportingPeriodEnd ?? "").localeCompare(a.reportingPeriodEnd ?? ""),
  );

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/buyers">Buyers</Link> /{" "}
            <span>{buyer.buyerCode}</span>
          </div>
          <h1>{buyer.displayName}</h1>
          {buyer.primaryEmail && (
            <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
              {buyer.primaryEmail}
            </p>
          )}
        </div>
        <div className="actions">
          <Link href="/development-os/buyers" className="btn btn-secondary btn-sm">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            All buyers
          </Link>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Identity</div>
        <Card padding="default">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            <Field label="Buyer code" value={buyer.buyerCode} mono />
            <Field label="Email" value={buyer.primaryEmail ?? "—"} />
            <Field label="Phone" value={buyer.primaryPhone ?? "—"} />
            <Field label="WhatsApp" value={buyer.whatsappPhone ?? "—"} />
            <Field label="Language" value={buyer.preferredLanguage} />
            <Field
              label="KYC completed"
              value={
                buyer.kycCompletedAt
                  ? new Date(buyer.kycCompletedAt).toLocaleDateString()
                  : "—"
              }
            />
          </div>
          <div className="mt-4 pt-4 border-t border-line-soft flex flex-wrap items-center gap-3">
            <div className="text-[11px] uppercase tracking-wide text-ink-tertiary">
              KYC status
            </div>
            <KycStatusControl buyerId={buyer.id} current={buyer.kycStatus} />
          </div>
        </Card>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2.5">
          <div className="label">Portal</div>
          <PortalAccessControl
            buyerId={buyer.id}
            enabled={buyer.portalAccessEnabled}
          />
        </div>
        <Card padding="default">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            <Field
              label="Access enabled"
              value={buyer.portalAccessEnabled ? "yes" : "no"}
            />
            <Field
              label="Invited"
              value={
                buyer.portalInvitedAt
                  ? new Date(buyer.portalInvitedAt).toLocaleString()
                  : "—"
              }
            />
            <Field
              label="First login"
              value={
                buyer.portalFirstLoginAt
                  ? new Date(buyer.portalFirstLoginAt).toLocaleString()
                  : "—"
              }
            />
            <Field
              label="Last login"
              value={
                buyer.portalLastLoginAt
                  ? new Date(buyer.portalLastLoginAt).toLocaleString()
                  : "—"
              }
            />
          </div>
        </Card>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2.5">
          <div className="label">
            Units · assignments ({assignments.length})
          </div>
          <AssignUnitControl buyerId={buyer.id} units={unitOptions} />
        </div>
        {assignments.length === 0 ? (
          <EmptyState
            title="No villa assignments yet"
            description="Use 'Assign unit' to link this buyer to a villa."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Unit</TH>
                <TH>Status</TH>
                <TH>Reservation</TH>
                <TH>Contract</TH>
                <TH>Assigned</TH>
                <TH>Visible</TH>
              </TR>
            </THead>
            <TBody>
              {assignments.map((a) => (
                <TR key={a.id}>
                  <TD className="font-mono text-xs">{a.unitId.slice(0, 8)}</TD>
                  <TD>
                    <HandoffBadge tone={ASSIGN_TONE[a.status] ?? "soft"}>
                      {a.status}
                    </HandoffBadge>
                  </TD>
                  <TD className="font-mono text-xs">
                    {a.reservationId?.slice(0, 8) ?? "—"}
                  </TD>
                  <TD className="font-mono text-xs">
                    {a.contractId?.slice(0, 8) ?? "—"}
                  </TD>
                  <TD className="text-xs">{a.assignedAt}</TD>
                  <TD className="text-xs">
                    {a.isVisibleInPortal ? "yes" : "no"}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2.5">
          <div className="label">Progress reports ({reports.length})</div>
          <CreateProgressReportControl
            projects={projectRows}
            units={unitOptions}
          />
        </div>
        {reports.length === 0 ? (
          <EmptyState
            title="No progress reports yet"
            description="Create a draft report, then submit → approve → publish. Buyers see published reports for their units in the portal."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Period</TH>
                <TH>Scope</TH>
                <TH>Progress</TH>
                <TH>Status</TH>
                <TH>Actions</TH>
              </TR>
            </THead>
            <TBody>
              {reports.map((r) => (
                <TR key={r.id}>
                  <TD className="text-xs whitespace-nowrap">
                    {r.reportingPeriodStart} → {r.reportingPeriodEnd}
                  </TD>
                  <TD className="font-mono text-xs">
                    {r.unitId ? `unit ${r.unitId.slice(0, 8)}` : "project-level"}
                  </TD>
                  <TD className="text-xs">
                    {r.currentProgressPercentage != null
                      ? `${r.currentProgressPercentage}%`
                      : "—"}
                  </TD>
                  <TD>
                    <HandoffBadge tone={REPORT_TONE[r.status] ?? "soft"}>
                      {r.status}
                    </HandoffBadge>
                  </TD>
                  <TD>
                    <ReportTransitionControls
                      reportId={r.id}
                      status={r.status}
                    />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2.5">
          <div className="label">CRM</div>
          <LogActivityComposer
            subjectType="buyer"
            subjectId={buyer.id}
            canManage={canManageCrm}
          />
        </div>
        <Card padding="default">
          <RecordTimeline
            activities={crmActivity}
            emptyLabel="No CRM activity yet — log a note, call, or email to start the timeline."
          />
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
      <div className={`mt-0.5 ${mono ? "font-mono text-xs break-all" : "text-sm"}`}>
        {value}
      </div>
    </div>
  );
}
