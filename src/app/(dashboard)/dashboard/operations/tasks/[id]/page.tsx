import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
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
import {
  listInventoryItems,
  listInventoryLocations,
  listTaskMaterialUsage,
} from "@/features/inventory/services";
import { getCurrentUserContext, hasPermission } from "@/features/auth/permissions";

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

  const [checklist, templates, attachments, materialUsage, items, locations] =
    await Promise.all([
      getTaskChecklist(id),
      listChecklistTemplates(),
      listTaskAttachments(id),
      listTaskMaterialUsage(id),
      canLogMaterial ? listInventoryItems({ status: "active" }) : Promise.resolve([]),
      canLogMaterial ? listInventoryLocations() : Promise.resolve([]),
    ]);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[
          { label: "Operations", href: "/dashboard/operations" },
          { label: "Tasks", href: "/dashboard/operations/tasks" },
          { label: task.taskCode },
        ]}
        title={task.title}
        description={`${task.category.replace(/_/g, " ")} · ${task.taskCode}`}
        actions={
          canManage ? (
            <TaskActionBar
              taskId={task.id}
              status={task.status}
              canApprove={canApprove}
              canCancel={canCancel}
            />
          ) : null
        }
      />

      <div className="rounded-lg border border-line-soft bg-surface p-6 grid grid-cols-2 md:grid-cols-4 gap-6">
        <Stat label="Status" value={<TaskStatusPill status={task.status} />} />
        <Stat label="Priority" value={<PriorityPill priority={task.priority} />} />
        <Stat
          label="Villa"
          value={
            task.villaCode ? (
              <span className="font-mono tabular-nums text-ink">{task.villaCode}</span>
            ) : (
              <span className="text-ink-tertiary">—</span>
            )
          }
        />
        <Stat
          label="Assignee"
          value={task.assignedToName ?? <span className="text-ink-tertiary">Unassigned</span>}
        />
        <Stat
          label="Scheduled"
          value={task.scheduledFor ?? <span className="text-ink-tertiary">—</span>}
        />
        <Stat
          label="Estimated"
          value={
            task.estimatedMinutes ? `${task.estimatedMinutes} min` : <span className="text-ink-tertiary">—</span>
          }
        />
        <Stat label="Source" value={task.taskSource} />
        <Stat
          label="Started"
          value={task.startedAt ? task.startedAt.slice(0, 16).replace("T", " ") : <span className="text-ink-tertiary">—</span>}
        />
      </div>

      {task.description && (
        <Section eyebrow="Description" title="Brief">
          <p className="text-sm text-ink-secondary leading-relaxed whitespace-pre-line">
            {task.description}
          </p>
        </Section>
      )}

      <Section eyebrow="Checklist" title="Field workflow">
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
      </Section>

      <Section
        eyebrow="Evidence"
        title="Attachments"
        action={
          canUpload ? <AttachmentUploader target="task" targetId={task.id} /> : null
        }
      >
        <AttachmentGallery attachments={attachments} />
      </Section>

      {canLogMaterial && (
        <Section
          eyebrow="Materials"
          title="Material usage"
          action={
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
          }
        >
          {materialUsage.length === 0 ? (
            <p className="text-sm text-ink-tertiary">
              No material usage logged for this task yet.
            </p>
          ) : (
            <div className="rounded-3xl border border-line-soft bg-surface shadow-soft-card overflow-hidden">
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
            </div>
          )}
        </Section>
      )}

      {task.internalNotes && (
        <Section eyebrow="Notes" title="Internal notes">
          <pre className="text-sm text-ink-secondary leading-relaxed whitespace-pre-wrap font-sans">
            {task.internalNotes}
          </pre>
        </Section>
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

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-ink-tertiary">{label}</div>
      <div className="text-sm text-ink mt-1">{value}</div>
    </div>
  );
}
