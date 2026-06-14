import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, MapPin, MessageSquare, Phone } from "lucide-react";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import {
  ProjectDetailTabs,
  type ProjectTab,
} from "@/components/development/project-detail-tabs";
import { InteractionTimeline } from "@/components/development/sales/interaction-timeline";
import { AIDraftReviewList } from "@/components/development/sales/ai-draft-review";
import { LeadStatusControl } from "@/components/development/sales/lead-status-control";
import { LeadReservationContractTab } from "@/components/development/sales/lead-reservation-contract-tab";
import { getLeadDetail } from "@/lib/development/server/leads";
import {
  getContactInteractions,
  getPendingDraftsForContact,
} from "@/lib/development/server/interactions";
import { getContactById } from "@/lib/development/server/contacts";
import { getLeadSalesSnapshot } from "@/lib/development/server/contact-sales";
import { RecordTimeline } from "@/components/ui/primitives";
import { listCrmActivities } from "@/features/crm-activity/services";
import { LogActivityComposer } from "@/components/crm/log-activity-composer";
import { CrmAnnotationsPanel } from "@/components/crm/crm-annotations-panel";
import { getCurrentUserContext } from "@/features/auth/permissions";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Lead · Development OS" };
export const dynamic = "force-dynamic";

const channelIcon: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  whatsapp: MessageSquare,
  email: Mail,
  phone: Phone,
  in_person: MapPin,
};

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ contactRoleId: string }>;
}) {
  const { contactRoleId } = await params;
  const lead = await getLeadDetail(contactRoleId);
  if (!lead) notFound();

  const [contact, interactions, pendingDrafts, salesSnapshot, crmContact, crmLead, ctx] =
    await Promise.all([
      getContactById(lead.contactId),
      getContactInteractions(lead.contactId),
      getPendingDraftsForContact(lead.contactId),
      getLeadSalesSnapshot(lead.contactId),
      // CRM ACTIVITY TIMELINE (#169) — unified feed for this relationship.
      // Both the contact-level stream and this lead role's own stream
      // (status changes are recorded against the role) are merged, newest
      // first, into one timeline.
      listCrmActivities("contact", lead.contactId).catch(() => []),
      listCrmActivities("lead", lead.roleId).catch(() => []),
      getCurrentUserContext(),
    ]);
  const canManageCrm = ctx.mode === "demo" || ctx.isInternal;

  const crmActivity = [...crmContact, ...crmLead].sort((a, b) =>
    a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0,
  );

  const Channel = lead.preferredCommunicationChannel
    ? channelIcon[lead.preferredCommunicationChannel] ?? Mail
    : Mail;

  const tabs: ProjectTab[] = [
    {
      value: "overview",
      label: "Overview",
      content: (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
          <div className="flex flex-col gap-5">
            <div>
              <div className="label mb-2.5">Contact</div>
              <Card padding="default">
                <h2 className="serif text-[18px] mt-0 mb-3">{lead.fullName}</h2>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Stat label="Email" value={lead.email ?? "—"} icon={<Mail className="w-3 h-3" strokeWidth={1.75} />} />
                  <Stat label="Phone" value={lead.phone ?? "—"} icon={<Phone className="w-3 h-3" strokeWidth={1.75} />} />
                  <Stat label="Channel" value={lead.preferredCommunicationChannel ?? "—"} icon={<Channel className="w-3 h-3" strokeWidth={1.75} />} />
                  <Stat label="Language" value={lead.preferredLanguage ?? "—"} />
                  <Stat label="Country" value={lead.countryOfResidence ?? "—"} />
                  <Stat label="Source" value={lead.acquisitionSource ?? lead.sourceCode ?? "—"} />
                </dl>
              </Card>
            </div>

            {lead.projectName && (
              <div>
                <div className="label mb-2.5">Project of interest</div>
                <Card padding="default">
                  <h2 className="serif text-[18px] mt-0 mb-3">{lead.projectName}</h2>
                  <div className="flex items-center gap-2 flex-wrap">
                    {lead.unitTypeName && <HandoffBadge tone="info">{lead.unitTypeName}</HandoffBadge>}
                    {lead.agentDisplayName && <HandoffBadge tone="gold">via {lead.agentDisplayName}</HandoffBadge>}
                    {lead.projectSlug && (
                      <Link
                        href={`/development-os/projects/${lead.projectSlug}`}
                        className="btn btn-secondary btn-sm"
                      >
                        Open project →
                      </Link>
                    )}
                  </div>
                </Card>
              </div>
            )}

            {lead.notes && (
              <div>
                <div className="label mb-2.5">Internal notes</div>
                <Card padding="default">
                  <p className="text-sm text-ink-secondary leading-relaxed whitespace-pre-wrap m-0">
                    {lead.notes}
                  </p>
                </Card>
              </div>
            )}

            {/* CRM-CUSTOM-FIELDS-TAGS — editable tags + custom fields. */}
            <div>
              <div className="label mb-2.5">CRM</div>
              <Card padding="default">
                <CrmAnnotationsPanel
                  subjectType="contact"
                  subjectId={lead.contactId}
                  canManage={canManageCrm}
                />
              </Card>
            </div>
          </div>

          <aside className="flex flex-col gap-3">
            <LeadStatusControl
              contactRoleId={lead.roleId}
              currentStatus={lead.status}
            />
            <div className="rounded-md border border-line-soft bg-surface p-4 flex flex-col gap-2">
              <span className="text-label">Lead lineage</span>
              <div className="text-xs text-ink-secondary leading-relaxed">
                Started {formatDate(lead.startedAt, "long")}
                {lead.endedAt && (
                  <>
                    <br />Ended {formatDate(lead.endedAt, "long")}
                  </>
                )}
              </div>
              {contact?.linkedOwnerId && (
                <HandoffBadge tone="ok">Linked to Owner record</HandoffBadge>
              )}
              {contact?.linkedGuestId && (
                <HandoffBadge tone="info">Linked to Guest record</HandoffBadge>
              )}
            </div>
          </aside>
        </div>
      ),
    },
    {
      value: "activity",
      label: "Activity",
      badge: crmActivity.length > 0 ? `${crmActivity.length}` : undefined,
      content: (
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <div className="label">CRM</div>
            <LogActivityComposer
              subjectType="contact"
              subjectId={lead.contactId}
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
      ),
    },
    {
      value: "interactions",
      label: "Interactions",
      badge: `${interactions.length}`,
      content: <InteractionTimeline items={interactions} />,
    },
    {
      value: "ai-drafts",
      label: "AI drafts",
      badge: pendingDrafts.length > 0 ? `${pendingDrafts.length}` : undefined,
      content: <AIDraftReviewList drafts={pendingDrafts} />,
    },
    {
      value: "documents",
      label: "Documents",
      content: (
        <ComingInPlaceholder
          stage="Soon"
          summary="ID, KYC pack, signed reservation form, contract — indexed against this lead."
        />
      ),
    },
    {
      value: "reservations",
      label: "Reservation & contract",
      badge:
        salesSnapshot.reservations.length + salesSnapshot.contractGroups.length > 0
          ? `${salesSnapshot.reservations.length + salesSnapshot.contractGroups.length}`
          : undefined,
      content: (
        <LeadReservationContractTab
          leadStatus={lead.status}
          reservations={salesSnapshot.reservations}
          contractGroups={salesSnapshot.contractGroups}
        />
      ),
    },
  ];

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/sales">Sales</Link> /{" "}
            <span>{lead.fullName}</span>
          </div>
          <div className="label mt-1.5">Lead · {lead.status}</div>
          <h1>{lead.fullName}</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            {lead.projectName
              ? `${lead.projectName}${lead.unitTypeName ? ` · ${lead.unitTypeName}` : ""}${lead.agentDisplayName ? ` · referred by ${lead.agentDisplayName}` : ""}`
              : "Unscoped lead — no project association yet."}
          </p>
        </div>
        <div className="actions">
          <Link href="/development-os/sales" className="btn btn-secondary btn-sm">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Pipeline
          </Link>
        </div>
      </div>

      <ProjectDetailTabs tabs={tabs} defaultValue="overview" />
    </DevelopmentShell>
  );
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-line-soft bg-surface px-4 py-3 flex flex-col gap-0.5">
      <span className="text-label inline-flex items-center gap-1.5">
        {icon}
        {label}
      </span>
      <span className="text-sm text-ink font-mono tabular-nums truncate">
        {value}
      </span>
    </div>
  );
}

function ComingInPlaceholder({ stage, summary }: { stage: string; summary: string }) {
  return (
    <div className="rounded-md border border-dashed border-line-soft bg-muted/30 px-6 py-10 flex flex-col items-center text-center gap-2">
      <HandoffBadge tone="gold">Stage {stage}</HandoffBadge>
      <p className="text-sm text-ink-secondary max-w-md leading-relaxed">{summary}</p>
    </div>
  );
}
