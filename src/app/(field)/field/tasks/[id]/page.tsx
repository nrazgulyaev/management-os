import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ChevronLeft, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TaskStatusPill } from "@/components/operations/task-status-pill";
import { PriorityPill } from "@/components/operations/priority-pill";
import { ChecklistRunner } from "@/components/operations/checklist-runner";
import { TaskActionBar } from "@/components/operations/task-actions";
import { AttachmentUploader } from "@/components/attachments/attachment-uploader";
import { AttachmentGallery } from "@/components/attachments/attachment-gallery";
import { MaterialUsageForm } from "@/components/field/material-usage-form";
import { FieldCaptureBlock } from "@/components/field/field-capture-block";
import {
  getOperationTaskById,
  getTaskChecklist,
} from "@/features/operations/services";
import { listTaskAttachments } from "@/features/attachments/services";
import {
  listInventoryItems,
  listInventoryLocations,
  listTaskMaterialUsage,
} from "@/features/inventory/services";
import { getCurrentUserContext, hasPermission } from "@/features/auth/permissions";
import { getDb } from "@/lib/db/client";
import { villas } from "@/lib/db/schema/projects";

/** Stage 11.B.1 — minimal villa coordinates lookup for the field
 *  PWA's GeoCheckIn anchor. Returns null when the villa has no
 *  coordinates configured (FieldCaptureBlock falls back gracefully). */
async function getVillaAnchor(
  villaId: string | null,
): Promise<{ lat: number; lng: number } | null> {
  if (!villaId) return null;
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .select({ coordinates: villas.coordinates })
    .from(villas)
    .where(eq(villas.id, villaId))
    .limit(1);
  const c = row?.coordinates as
    | { lat?: unknown; lng?: unknown }
    | null
    | undefined;
  if (!c || typeof c.lat !== "number" || typeof c.lng !== "number") {
    return null;
  }
  return { lat: c.lat, lng: c.lng };
}

export const metadata = { title: "Task — Field" };
export const dynamic = "force-dynamic";

export default async function FieldTaskDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const task = await getOperationTaskById(id);
  if (!task) notFound();

  const ctx = await getCurrentUserContext();
  const canApprove = hasPermission(ctx, "operations.approve");
  const canManage = hasPermission(ctx, "operations.write");
  const canUpload = hasPermission(ctx, "attachments.write");
  const canLogMaterial = hasPermission(ctx, "inventory.write");

  const [checklist, attachments, materialUsage, items, locations, villaAnchor] =
    await Promise.all([
      getTaskChecklist(id),
      listTaskAttachments(id),
      listTaskMaterialUsage(id),
      canLogMaterial ? listInventoryItems({ status: "active" }) : Promise.resolve([]),
      canLogMaterial ? listInventoryLocations() : Promise.resolve([]),
      getVillaAnchor(task.villaId),
    ]);

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/field"
        className="inline-flex items-center gap-1 text-xs text-ink-tertiary hover:text-ink"
      >
        <ChevronLeft className="w-3.5 h-3.5" strokeWidth={1.75} />
        Today
      </Link>

      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[11px] text-ink-tertiary">{task.taskCode}</span>
          <PriorityPill priority={task.priority} />
          <TaskStatusPill status={task.status} />
          {task.scheduledFor && <Badge tone="outline">{task.scheduledFor}</Badge>}
        </div>
        <h1 className="text-display text-[24px] leading-tight font-medium text-ink mt-2">
          {task.title}
        </h1>
        <p className="text-sm text-ink-secondary mt-1 capitalize">
          {task.category.replace(/_/g, " ")}
          {task.villaCode ? ` · ${task.villaCode}` : ""}
        </p>
      </div>

      {canManage && (
        <TaskActionBar
          taskId={task.id}
          status={task.status}
          canApprove={canApprove}
          canCancel={false}
        />
      )}

      {task.description && (
        <section className="rounded-lg border border-line-soft bg-surface p-4">
          <span className="text-label">Brief</span>
          <p className="text-sm text-ink mt-2 whitespace-pre-line leading-relaxed">
            {task.description}
          </p>
        </section>
      )}

      {checklist ? (
        <ChecklistRunner checklist={checklist} canApprove={canApprove} variant="field" />
      ) : (
        <p className="rounded-md border border-dashed border-line-soft bg-muted/20 p-4 text-sm text-ink-tertiary">
          No checklist attached. A supervisor can add one from the dashboard.
        </p>
      )}

      {/* Stage 11.B.2 — offline-friendly capture surface (PhotoCapture +
          GeoCheckIn over the IndexedDB queue). Coexists with the
          AttachmentUploader below — operators on a stable connection use
          either; field staff offline / on a flaky link use this. */}
      {canUpload && (
        <FieldCaptureBlock
          taskId={task.id}
          villaId={task.villaId}
          villaAnchor={villaAnchor}
          villaLabel={task.villaCode ?? task.projectName ?? "this villa"}
        />
      )}

      <section className="rounded-lg border border-line-soft bg-surface p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-label">Photo evidence</span>
          {canUpload && (
            <AttachmentUploader target="task" targetId={task.id} variant="field" />
          )}
        </div>
        <AttachmentGallery
          attachments={attachments}
          emptyLabel="No photos yet — upload from this device."
        />
      </section>

      {canLogMaterial && (
        <section className="rounded-lg border border-line-soft bg-surface p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-label">Materials used</span>
            <MaterialUsageForm
              taskId={task.id}
              items={items.map((i) => ({
                id: i.id,
                label: `${i.name}${i.sku ? ` · ${i.sku}` : ""}`,
              }))}
              locations={locations.map((l) => ({ id: l.id, label: l.name }))}
            />
          </div>
          {materialUsage.length === 0 ? (
            <p className="text-xs text-ink-tertiary">
              Nothing logged yet. Items consumed here decrement stock.
            </p>
          ) : (
            <ul className="divide-y divide-line-soft">
              {materialUsage.map((u) => (
                <li key={u.id} className="py-2 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm text-ink">{u.itemName}</div>
                    <div className="text-[11px] text-ink-tertiary">
                      {u.locationName ?? "—"} · {u.createdByName ?? "—"}
                    </div>
                  </div>
                  <div className="font-mono tabular-nums text-sm">
                    {u.quantity} {u.itemUnit}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <Link
        href={`/dashboard/operations/damage-reports/new?taskId=${task.id}${task.villaId ? `&villaId=${task.villaId}` : ""}`}
        className="rounded-md border border-line-soft bg-surface px-4 py-3 flex items-center justify-between text-sm text-ink hover:border-line-strong"
      >
        <span className="inline-flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-warning" strokeWidth={1.75} />
          Report damage or issue
        </span>
        <ChevronLeft className="w-4 h-4 rotate-180 text-ink-tertiary" />
      </Link>
    </div>
  );
}
