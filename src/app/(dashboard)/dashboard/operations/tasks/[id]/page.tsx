import { notFound } from "next/navigation";
import Link from "next/link";
import { Kpi, Card } from "@/components/dashboard/primitives";
import { TaskStatusPill } from "@/components/operations/task-status-pill";
import { PriorityPill } from "@/components/operations/priority-pill";
import { ChecklistRunner } from "@/components/operations/checklist-runner";
import { TaskActionBar } from "@/components/operations/task-actions";
import { ChecklistFromTemplateForm } from "@/components/operations/checklist-from-template-form";
import { AttachmentUploader } from "@/components/attachments/attachment-uploader";
import { AttachmentGallery } from "@/components/attachments/attachment-gallery";
import { MaterialUsageForm } from "@/components/field/material-usage-form";
import { BridgeForTaskButton } from "@/components/finance/material-bridge-actions";
import {
  getOperationTaskById,
  getTaskChecklist,
  listChecklistTemplates,
} from "@/features/operations/services";
import { listTaskAttachments } from "@/features/attachments/services";
import { mapPoolAll } from "@/lib/db/map-pool";
import {
  listInventoryItems,
  listInventoryLocations,
  listTaskMaterialUsage,
} from "@/features/inventory/services";
import { getCurrentUserContext, hasPermission } from "@/features/auth/permissions";
import { listAppUsers } from "@/features/auth/users-service";
import { TaskAssignControl } from "@/components/operations/task-assign-control";

export const dynamic = "force-dynamic";
export const metadata = { title: "Operations · Task" };

export default async function OperationTaskDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const task = await getOperationTaskById(id);
  if (!task) notFound();
  const ctx = await getCurrentUserContext();
  const canApprove = hasPermission(ctx, "operations.approve");
  const canCancel = hasPermission(ctx, "operations.write");
  const canManage = hasPermission(ctx, "operations.write");

  const canUpload = hasPermission(ctx, "attachments.write");
  const canLogMaterial = hasPermission(ctx, "inventory.write");
  const canBridge = hasPermission(ctx, "finance.bridge_material_usage");

  const [checklist, templates, attachments, materialUsage, items, locations, staff] =
    await mapPoolAll([
      () => getTaskChecklist(id),
      () => listChecklistTemplates(),
      () => listTaskAttachments(id),
      () => listTaskMaterialUsage(id),
      () => (canLogMaterial ? listInventoryItems({ status: "active" }) : Promise.resolve([])),
      () => (canLogMaterial ? listInventoryLocations() : Promise.resolve([])),
      () => (canManage ? listAppUsers() : Promise.resolve([])),
    ] as const, 4);

  return (
    <div className="flex flex-col gap-8">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/operations">Operations</Link> /{" "}
            <Link href="/dashboard/operations/tasks">Tasks</Link> /{" "}
            <span>{task.taskCode}</span>
          </div>
          <h1>{task.title}</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            {task.category.replace(/_/g, " ")} · {task.taskCode}
          </p>
        </div>
        {canManage && (
          <div className="actions">
            <TaskActionBar
              taskId={task.id}
              status={task.status}
              canApprove={canApprove}
              canCancel={canCancel}
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Status" value={<TaskStatusPill status={task.status} />} />
        <Kpi label="Priority" value={<PriorityPill priority={task.priority} />} />
        <Kpi
          label="Villa"
          value={
            task.villaCode ? (
              <span className="font-mono tabular-nums text-ink">{task.villaCode}</span>
            ) : (
              <span className="text-ink-tertiary">—</span>
            )
          }
        />
        <Kpi
          label="Assignee"
          value={
            canManage ? (
              <TaskAssignControl
                taskId={task.id}
                currentAssignedTo={task.assignedTo}
                currentName={task.assignedToName}
                staff={staff.map((u) => ({ id: u.id, name: u.fullName }))}
              />
            ) : (
              task.assignedToName ?? (
                <span className="text-ink-tertiary">Unassigned</span>
              )
            )
          }
        />
        <Kpi
          label="Scheduled"
          value={task.scheduledFor ?? <span className="text-ink-tertiary">—</span>}
        />
        <Kpi
          label="Estimated"
          value={
            task.estimatedMinutes ? `${task.estimatedMinutes} min` : <span className="text-ink-tertiary">—</span>
          }
        />
        <Kpi label="Source" value={task.taskSource} />
        <Kpi
          label="Started"
          value={task.startedAt ? task.startedAt.slice(0, 16).replace("T", " ") : <span className="text-ink-tertiary">—</span>}
        />
      </div>

      {task.description && (
        <div>
          <div className="label mb-2.5">Description</div>
          <Card padding="default">
            <p className="text-sm text-ink-secondary leading-relaxed whitespace-pre-line">
              {task.description}
            </p>
          </Card>
        </div>
      )}

      <div>
        <div className="label mb-2.5">Checklist</div>
        {checklist ? (
          <ChecklistRunner checklist={checklist} canApprove={canApprove} variant="internal" />
        ) : canManage ? (
          <ChecklistFromTemplateForm
            taskId={task.id}
            templates={templates.map((t) => ({ id: t.id, label: `${t.name} · ${t.itemCount} items` }))}
          />
        ) : (
          <p className="text-sm text-ink-tertiary">No checklist attached.</p>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div className="label">Evidence</div>
          {canUpload && <AttachmentUploader target="task" targetId={task.id} />}
        </div>
        <AttachmentGallery attachments={attachments} />
      </div>

      {canLogMaterial && (
        <div>
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <div className="label">Materials</div>
            <div className="flex items-center gap-2 flex-wrap">
              {canBridge && materialUsage.length > 0 && (
                <BridgeForTaskButton taskId={task.id} />
              )}
              <MaterialUsageForm
                taskId={task.id}
                items={items.map((i) => ({
                  id: i.id,
                  label: `${i.name}${i.sku ? ` · ${i.sku}` : ""}`,
                }))}
                locations={locations.map((l) => ({ id: l.id, label: l.name }))}
              />
            </div>
          </div>
          {materialUsage.length === 0 ? (
            <p className="text-sm text-ink-tertiary">
              No material usage logged for this task yet.
            </p>
          ) : (
            <Card padding="none" overflowHidden>
              <ul className="divide-y divide-line-soft">
                {materialUsage.map((u) => (
                  <li key={u.id} className="p-4 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm text-ink">{u.itemName}</div>
                      <div className="text-[11px] text-ink-tertiary">
                        {u.locationName ?? "—"}
                        {u.createdByName ? ` · ${u.createdByName}` : ""}
                        {u.notes ? ` · ${u.notes}` : ""}
                      </div>
                    </div>
                    <div className="font-mono tabular-nums text-sm">
                      {u.quantity} {u.itemUnit}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      {task.internalNotes && (
        <div>
          <div className="label mb-2.5">Notes</div>
          <Card padding="default">
            <pre className="text-sm text-ink-secondary leading-relaxed whitespace-pre-wrap font-sans">
              {task.internalNotes}
            </pre>
          </Card>
        </div>
      )}

      <p className="text-xs text-ink-tertiary">
        Need to log a damage report?{" "}
        <Link
          href={`/dashboard/operations/damage-reports/new?taskId=${task.id}${task.villaId ? `&villaId=${task.villaId}` : ""}`}
          className="underline"
        >
          Open the damage report form
        </Link>
        .
      </p>
    </div>
  );
}
