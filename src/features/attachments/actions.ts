"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  taskAttachments,
  operationTasks,
  maintenanceTickets,
  taskChecklists,
  taskChecklistItems,
} from "@/lib/db/schema/operations";
import { villas, projects as projectsTable } from "@/lib/db/schema/projects";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requirePermission } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import {
  ATTACHMENT_BUCKET,
  attachmentIdSchema,
  registerUploadedAttachmentSchema,
  requestSignedUploadSchema,
} from "./schema";
import {
  buildStoragePath,
  createSignedUploadToken,
  deleteStorageObject,
} from "./storage";
import type { ActionResult } from "@/features/projects/actions";

type Db = NonNullable<ReturnType<typeof getDb>>;

/**
 * TENANCY — task_attachments has no org column of its own. An attachment
 * is owned by exactly one parent (task | checklist_item | maintenance_ticket),
 * and the caller's org is resolved through that parent:
 *   - task            -> operation_tasks.organizationId
 *   - checklist_item  -> task_checklist_items -> task_checklists -> operation_tasks.organizationId
 *   - maintenance_tkt -> maintenance_tickets (no org col) -> villa -> project.organizationId
 *
 * Returns true iff a parent row of the given target exists AND belongs to
 * `orgId`. Used to reject cross-tenant attach / register / delete.
 */
async function targetBelongsToOrg(
  db: Db,
  target: "task" | "checklist_item" | "maintenance_ticket",
  targetId: string,
  orgId: string,
): Promise<boolean> {
  if (target === "task") {
    const [row] = await db
      .select({ id: operationTasks.id })
      .from(operationTasks)
      .where(
        and(eq(operationTasks.id, targetId), eq(operationTasks.organizationId, orgId)),
      )
      .limit(1);
    return Boolean(row);
  }
  if (target === "checklist_item") {
    const [row] = await db
      .select({ id: taskChecklistItems.id })
      .from(taskChecklistItems)
      .innerJoin(taskChecklists, eq(taskChecklists.id, taskChecklistItems.checklistId))
      .innerJoin(operationTasks, eq(operationTasks.id, taskChecklists.taskId))
      .where(
        and(
          eq(taskChecklistItems.id, targetId),
          eq(operationTasks.organizationId, orgId),
        ),
      )
      .limit(1);
    return Boolean(row);
  }
  // maintenance_ticket — no org column; anchor through villa -> project.
  const [row] = await db
    .select({ id: maintenanceTickets.id })
    .from(maintenanceTickets)
    .innerJoin(villas, eq(villas.id, maintenanceTickets.villaId))
    .innerJoin(projectsTable, eq(projectsTable.id, villas.projectId))
    .where(
      and(
        eq(maintenanceTickets.id, targetId),
        eq(projectsTable.organizationId, orgId),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/**
 * Resolve the parent target of an existing attachment row, then verify it
 * belongs to `orgId`. Returns false when no parent is set or the parent is
 * in another org.
 */
async function attachmentRowInOrg(
  db: Db,
  row: { taskId: string | null; checklistItemId: string | null; maintenanceTicketId: string | null },
  orgId: string,
): Promise<boolean> {
  if (row.taskId) return targetBelongsToOrg(db, "task", row.taskId, orgId);
  if (row.checklistItemId)
    return targetBelongsToOrg(db, "checklist_item", row.checklistItemId, orgId);
  if (row.maintenanceTicketId)
    return targetBelongsToOrg(db, "maintenance_ticket", row.maintenanceTicketId, orgId);
  return false;
}

/**
 * Step 1: client requests a signed upload URL. We pre-create a `pending`
 * row in `task_attachments` so the row id is the handle the client uses
 * after upload to flip status → "uploaded".
 */
export async function createSignedUploadUrlAction(
  _prev:
    | (ActionResult & {
        attachmentId?: string;
        signedUrl?: string;
        token?: string;
        bucket?: string;
        path?: string;
      })
    | null,
  formData: FormData,
): Promise<
  ActionResult & {
    attachmentId?: string;
    signedUrl?: string;
    token?: string;
    bucket?: string;
    path?: string;
  }
> {
  await requirePermission("attachments.write");
  const parsed = requestSignedUploadSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please review the upload request.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const me = await getCurrentAppUser();
  const d = parsed.data;

  // TENANCY — the client supplies target/targetId; verify that parent row
  // belongs to the caller's org before minting a token / creating a row, so
  // an attacker can't attach to another tenant's task / ticket / checklist.
  const organizationId = await requireOrgId();
  const targetOk = await targetBelongsToOrg(db, d.target, d.targetId, organizationId);
  if (!targetOk) return { ok: false, error: "Attachment target not found." };

  const path = buildStoragePath(d.target, d.targetId, d.fileName);

  const signed = await createSignedUploadToken(path);
  if (!signed) {
    return {
      ok: false,
      error:
        "Supabase Storage is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, then create the `task-attachments` bucket.",
    };
  }

  const insertValues: typeof taskAttachments.$inferInsert = {
    attachmentType: d.attachmentType,
    caption: d.caption && d.caption !== "" ? d.caption : null,
    fileName: d.fileName,
    mimeType: d.mimeType,
    sizeBytes: d.sizeBytes,
    storageBucket: ATTACHMENT_BUCKET,
    storagePath: path,
    uploadStatus: "pending",
    uploadedBy: me?.id ?? null,
  };
  if (d.target === "task") insertValues.taskId = d.targetId;
  if (d.target === "checklist_item") insertValues.checklistItemId = d.targetId;
  if (d.target === "maintenance_ticket") insertValues.maintenanceTicketId = d.targetId;

  const [row] = await db.insert(taskAttachments).values(insertValues).returning({
    id: taskAttachments.id,
  });

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "attachments.signed_upload_requested",
    entityType: "task_attachment",
    entityId: row.id,
    after: {
      target: d.target,
      targetId: d.targetId,
      mimeType: d.mimeType,
      sizeBytes: d.sizeBytes,
      path,
    },
  });

  return {
    ok: true,
    attachmentId: row.id,
    bucket: ATTACHMENT_BUCKET,
    path,
    signedUrl: signed.signedUrl,
    token: signed.token,
  };
}

/**
 * Step 2: client confirms the upload finished by hitting this action with
 * the attachmentId returned from step 1. Flips status → "uploaded".
 */
export async function registerUploadedAttachmentAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("attachments.write");
  const parsed = registerUploadedAttachmentSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) return { ok: false, error: "Missing attachmentId." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const [before] = await db
    .select()
    .from(taskAttachments)
    .where(eq(taskAttachments.id, parsed.data.attachmentId))
    .limit(1);
  if (!before) return { ok: false, error: "Attachment not found." };

  // TENANCY — verify the attachment's parent belongs to the caller's org
  // before flipping its status; a guessed attachment id from another tenant
  // must read as "not found".
  const organizationId = await requireOrgId();
  const inOrg = await attachmentRowInOrg(db, before, organizationId);
  if (!inOrg) return { ok: false, error: "Attachment not found." };

  if (before.uploadStatus === "uploaded") return { ok: true };

  const me = await getCurrentAppUser();
  await db
    .update(taskAttachments)
    .set({ uploadStatus: "uploaded" })
    .where(eq(taskAttachments.id, parsed.data.attachmentId));

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "attachments.uploaded",
    entityType: "task_attachment",
    entityId: parsed.data.attachmentId,
    before: { uploadStatus: before.uploadStatus },
    after: { uploadStatus: "uploaded" },
  });

  if (before.taskId) {
    revalidatePath(`/dashboard/operations/tasks/${before.taskId}`);
    revalidatePath(`/field/tasks/${before.taskId}`);
  }
  if (before.maintenanceTicketId) {
    revalidatePath(`/dashboard/operations/maintenance/${before.maintenanceTicketId}`);
  }
  return { ok: true };
}

export async function deleteAttachmentAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("attachments.write");
  const parsed = attachmentIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Missing attachment id." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const [row] = await db
    .select()
    .from(taskAttachments)
    .where(eq(taskAttachments.id, parsed.data.id))
    .limit(1);
  if (!row) return { ok: false, error: "Attachment not found." };

  // TENANCY — confirm the attachment's parent belongs to the caller's org
  // before deleting the storage object + row; reject cross-tenant deletes.
  const organizationId = await requireOrgId();
  const inOrg = await attachmentRowInOrg(db, row, organizationId);
  if (!inOrg) return { ok: false, error: "Attachment not found." };

  if (row.storagePath) await deleteStorageObject(row.storagePath);
  await db.delete(taskAttachments).where(eq(taskAttachments.id, parsed.data.id));

  const me = await getCurrentAppUser();
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "attachments.delete",
    entityType: "task_attachment",
    entityId: parsed.data.id,
    before: { storagePath: row.storagePath, taskId: row.taskId },
  });

  if (row.taskId) revalidatePath(`/dashboard/operations/tasks/${row.taskId}`);
  return { ok: true };
}
