import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getBuyerByCode } from "@/lib/development/server/buyers/buyer-queries";
import { RecordTimeline } from "@/components/ui/primitives";
import { listCrmActivities } from "@/features/crm-activity/services";
import { LogActivityComposer } from "@/components/crm/log-activity-composer";
import { getCurrentUserContext } from "@/features/auth/permissions";

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
  const [crmActivity, ctx] = await Promise.all([
    listCrmActivities("buyer", buyer.id).catch(() => []),
    getCurrentUserContext(),
  ]);
  const canManageCrm = ctx.mode === "demo" || ctx.isInternal;

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
        </Card>
      </div>

      <div>
        <div className="label mb-2.5">Portal</div>
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
        <div className="label mb-2.5">Units · assignments ({assignments.length})</div>
        {assignments.length === 0 ? (
          <EmptyState
            title="No villa assignments yet"
            description="Use assignUnitToBuyer to link this buyer to a villa."
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
