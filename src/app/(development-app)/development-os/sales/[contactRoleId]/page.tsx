import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, MapPin, MessageSquare, Phone } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

  const [contact, interactions, pendingDrafts, salesSnapshot] =
    await Promise.all([
      getContactById(lead.contactId),
      getContactInteractions(lead.contactId),
      getPendingDraftsForContact(lead.contactId),
      getLeadSalesSnapshot(lead.contactId),
    ]);

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
            <Section eyebrow="Contact" title={lead.fullName}>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Stat label="Email" value={lead.email ?? "—"} icon={<Mail className="w-3 h-3" strokeWidth={1.75} />} />
                <Stat label="Phone" value={lead.phone ?? "—"} icon={<Phone className="w-3 h-3" strokeWidth={1.75} />} />
                <Stat label="Channel" value={lead.preferredCommunicationChannel ?? "—"} icon={<Channel className="w-3 h-3" strokeWidth={1.75} />} />
                <Stat label="Language" value={lead.preferredLanguage ?? "—"} />
                <Stat label="Country" value={lead.countryOfResidence ?? "—"} />
                <Stat label="Source" value={lead.acquisitionSource ?? lead.sourceCode ?? "—"} />
              </dl>
            </Section>

            {lead.projectName && (
              <Section eyebrow="Project of interest" title={lead.projectName}>
                <div className="flex items-center gap-2 flex-wrap">
                  {lead.unitTypeName && <Badge tone="accent">{lead.unitTypeName}</Badge>}
                  {lead.agentDisplayName && <Badge tone="gold">via {lead.agentDisplayName}</Badge>}
                  {lead.projectSlug && (
                    <Button asChild variant="secondary" size="sm">
                      <Link href={`/development-os/projects/${lead.projectSlug}`}>
                        Open project →
                      </Link>
                    </Button>
                  )}
                </div>
              </Section>
            )}

            {lead.notes && (
              <Section eyebrow="Internal notes" title="Context">
                <p className="text-sm text-ink-secondary leading-relaxed whitespace-pre-wrap">
                  {lead.notes}
                </p>
              </Section>
            )}
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
                <Badge tone="success">Linked to Owner record</Badge>
              )}
              {contact?.linkedGuestId && (
                <Badge tone="info">Linked to Guest record</Badge>
              )}
            </div>
          </aside>
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
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Sales", href: "/development-os/sales" },
          { label: lead.fullName },
        ]}
        eyebrow={`Lead · ${lead.status}`}
        title={lead.fullName}
        description={
          lead.projectName
            ? `${lead.projectName}${lead.unitTypeName ? ` · ${lead.unitTypeName}` : ""}${lead.agentDisplayName ? ` · referred by ${lead.agentDisplayName}` : ""}`
            : "Unscoped lead — no project association yet."
        }
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/sales">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Pipeline
            </Link>
          </Button>
        }
      />

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
      <Badge tone="gold">Stage {stage}</Badge>
      <p className="text-sm text-ink-secondary max-w-md leading-relaxed">{summary}</p>
    </div>
  );
}
