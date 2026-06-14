import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, Kpi } from "@/components/dashboard/primitives";
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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/operations">Operations</Link> /{" "}
            <Link href="/dashboard/operations/maintenance">Maintenance</Link> /{" "}
            <span>{ticket.ticketCode}</span>
          </div>
          <h1>{ticket.title}</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            {ticket.issueCategory} · {ticket.ticketCode}
          </p>
        </div>
        <div className="actions">
          <MaintenanceStatusActions id={ticket.id} status={ticket.status} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Status" value={<MaintenanceStatusPill status={ticket.status} />} />
        <Kpi label="Severity" value={<PriorityPill priority={ticket.severity} />} />
        <Kpi
          label="Villa"
          value={
            ticket.villaCode ? (
              <span className="font-mono tabular-nums text-ink">{ticket.villaCode}</span>
            ) : (
              <span className="text-ink-tertiary">—</span>
            )
          }
        />
        <Kpi
          label="Owner chargeable"
          value={ticket.ownerChargeable ? "Yes" : "No"}
        />
        <Kpi
          label="Estimated cost"
          value={
            ticket.estimatedCostMinor !== null && ticket.currency
              ? formatMoneyMinor(ticket.estimatedCostMinor, ticket.currency)
              : <span className="text-ink-tertiary">—</span>
          }
        />
        <Kpi
          label="Actual cost"
          value={
            ticket.actualCostMinor !== null && ticket.currency
              ? formatMoneyMinor(ticket.actualCostMinor, ticket.currency)
              : <span className="text-ink-tertiary">—</span>
          }
        />
        <Kpi
          label="Reported"
          value={ticket.reportedAt.slice(0, 16).replace("T", " ")}
        />
        <Kpi
          label="Resolved"
          value={ticket.resolvedAt ? ticket.resolvedAt.slice(0, 16).replace("T", " ") : <span className="text-ink-tertiary">—</span>}
        />
      </div>

      {canAssign && (
        <div>
          <div className="label mb-2.5">Assignment</div>
          <Card padding="default">
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
          </Card>
        </div>
      )}

      {ticket.description && (
        <div>
          <div className="label mb-2.5">Description</div>
          <Card padding="default">
            <p className="text-sm text-ink-secondary leading-relaxed whitespace-pre-line">
              {ticket.description}
            </p>
          </Card>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between gap-3 mb-2.5">
          <div className="label">Evidence</div>
          {canUpload ? (
            <AttachmentUploader target="maintenance_ticket" targetId={ticket.id} />
          ) : null}
        </div>
        <Card padding="default">
          <AttachmentGallery attachments={attachments} />
        </Card>
      </div>
    </div>
  );
}
