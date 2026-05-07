import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { MaintenanceStatusPill } from "@/components/operations/task-status-pill";
import { PriorityPill } from "@/components/operations/priority-pill";
import { MaintenanceStatusActions } from "@/components/operations/maintenance-status-actions";
import { MaintenanceAssignDropdown } from "@/components/operations/maintenance-assign";
import { AttachmentUploader } from "@/components/attachments/attachment-uploader";
import { AttachmentGallery } from "@/components/attachments/attachment-gallery";
import { getMaintenanceTicketById } from "@/features/operations/services";
import { listMaintenanceTicketAttachments } from "@/features/attachments/services";
import { listAppUsers } from "@/features/auth/users-service";
import { getCurrentUserContext, hasPermission } from "@/features/auth/permissions";
import { formatMoneyMinor } from "@/lib/money";

export const metadata = { title: "Maintenance ticket" };
export const dynamic = "force-dynamic";

export default async function MaintenanceTicketDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ticket = await getMaintenanceTicketById(id);
  if (!ticket) notFound();
  const ctx = await getCurrentUserContext();
  const canUpload = hasPermission(ctx, "attachments.write");
  const canAssign = hasPermission(ctx, "operations.assign");
  const attachments = await listMaintenanceTicketAttachments(id);
  const users = canAssign
    ? (await listAppUsers()).filter((u) => u.status === "active")
    : [];

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[
          { label: "Operations", href: "/dashboard/operations" },
          { label: "Maintenance", href: "/dashboard/operations/maintenance" },
          { label: ticket.ticketCode },
        ]}
        title={ticket.title}
        description={`${ticket.issueCategory} · ${ticket.ticketCode}`}
        actions={<MaintenanceStatusActions id={ticket.id} status={ticket.status} />}
      />

      <div className="rounded-lg border border-line-soft bg-surface p-6 grid grid-cols-2 md:grid-cols-4 gap-6">
        <Stat label="Status" value={<MaintenanceStatusPill status={ticket.status} />} />
        <Stat label="Severity" value={<PriorityPill priority={ticket.severity} />} />
        <Stat
          label="Villa"
          value={
            ticket.villaCode ? (
              <span className="font-mono tabular-nums text-ink">{ticket.villaCode}</span>
            ) : (
              <span className="text-ink-tertiary">—</span>
            )
          }
        />
        <Stat
          label="Owner chargeable"
          value={ticket.ownerChargeable ? "Yes" : "No"}
        />
        <Stat
          label="Estimated cost"
          value={
            ticket.estimatedCostMinor !== null && ticket.currency
              ? formatMoneyMinor(ticket.estimatedCostMinor, ticket.currency)
              : <span className="text-ink-tertiary">—</span>
          }
        />
        <Stat
          label="Actual cost"
          value={
            ticket.actualCostMinor !== null && ticket.currency
              ? formatMoneyMinor(ticket.actualCostMinor, ticket.currency)
              : <span className="text-ink-tertiary">—</span>
          }
        />
        <Stat
          label="Reported"
          value={ticket.reportedAt.slice(0, 16).replace("T", " ")}
        />
        <Stat
          label="Resolved"
          value={ticket.resolvedAt ? ticket.resolvedAt.slice(0, 16).replace("T", " ") : <span className="text-ink-tertiary">—</span>}
        />
      </div>

      {canAssign && (
        <Section
          eyebrow="Assignment"
          title="Staff dispatch"
          description="Bridges through the linked operation task; first assignment auto-creates the task."
        >
          <MaintenanceAssignDropdown
            ticketId={ticket.id}
            ticketStatus={ticket.status}
            currentAssigneeId={ticket.assignedTo}
            currentAssigneeName={ticket.assigneeName}
            users={users.map((u) => ({
              id: u.id,
              fullName: u.fullName,
              email: u.email,
              roles: u.roles,
            }))}
          />
        </Section>
      )}

      {ticket.description && (
        <Section eyebrow="Description" title="Detail">
          <p className="text-sm text-ink-secondary leading-relaxed whitespace-pre-line">
            {ticket.description}
          </p>
        </Section>
      )}

      <Section
        eyebrow="Evidence"
        title="Attachments"
        action={
          canUpload ? (
            <AttachmentUploader target="maintenance_ticket" targetId={ticket.id} />
          ) : null
        }
      >
        <AttachmentGallery attachments={attachments} />
      </Section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-ink-tertiary">{label}</div>
      <div className="text-sm text-ink mt-1">{value}</div>
    </div>
  );
}
