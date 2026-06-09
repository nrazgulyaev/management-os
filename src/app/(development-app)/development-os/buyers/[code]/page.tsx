import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getBuyerByCode } from "@/lib/development/server/buyers/buyer-queries";
import { RecordTimeline } from "@/components/ui/primitives";
import { listCrmActivities } from "@/features/crm-activity/services";
import { LogActivityComposer } from "@/components/crm/log-activity-composer";
import { getCurrentUserContext } from "@/features/auth/permissions";

export const metadata: Metadata = { title: "Buyer · Development OS" };
export const dynamic = "force-dynamic";

const ASSIGN_TONE: Record<string, "info" | "success" | "warning" | "neutral"> = {
  reserved: "info",
  contracted: "info",
  paying: "info",
  paid_in_full: "success",
  handed_over: "success",
  cancelled: "neutral",
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
        <PageHeader title="Buyer" />
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
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Buyers", href: "/development-os/buyers" },
          { label: buyer.buyerCode },
        ]}
        eyebrow={`${buyer.buyerCode} · ${buyer.kycStatus}`}
        title={buyer.displayName}
        description={buyer.primaryEmail ?? undefined}
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/buyers">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              All buyers
            </Link>
          </Button>
        }
      />

      <Section eyebrow="Identity" title="Contact">
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
      </Section>

      <Section eyebrow="Portal" title="Buyer portal access">
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
      </Section>

      <Section
        eyebrow="Units"
        title={`Unit assignments (${assignments.length})`}
      >
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
                    <Badge tone={ASSIGN_TONE[a.status] ?? "neutral"}>
                      {a.status}
                    </Badge>
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
      </Section>

      <Section
        eyebrow="CRM"
        title="Activity timeline"
        action={
          <LogActivityComposer
            subjectType="buyer"
            subjectId={buyer.id}
            canManage={canManageCrm}
          />
        }
      >
        <RecordTimeline
          activities={crmActivity}
          emptyLabel="No CRM activity yet — log a note, call, or email to start the timeline."
        />
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
      <div className={`mt-0.5 ${mono ? "font-mono text-xs break-all" : "text-sm"}`}>
        {value}
      </div>
    </div>
  );
}
