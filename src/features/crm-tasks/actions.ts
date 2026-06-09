"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db/client";
import { crmTasks } from "@/lib/db/schema/crm-tasks";
import { requirePermission } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import { recordAuditEvent } from "@/features/audit/services";
import {
  CRM_TASK_SUBJECT_TYPES,
  CRM_TASK_PRIORITIES,
  subjectHref,
} from "./types";

/**
 * CRM tasks — write layer. Every mutation:
 *   - requires `crm_tasks.write` (internal users),
 *   - resolves + pins the caller's org (requireOrgId) and AND-scopes every
 *     UPDATE so a task can never be touched cross-tenant,
 *   - audit-logs the change (crm_task.create / .complete / .reopen / .reassign).
 *
 * getDb() may be null (demo / unconfigured) — guarded with a friendly result.
 *
 * Loose coupling note: this codebase has no generic `crm_activities` table
 * today, so the activity trail for a completed follow-up is the append-only
 * `audit_events` row. If a `crm_activities` module lands later, add the
 * insert beside the audit write in `completeTask` — nothing here hard-depends
 * on it.
 */

export type CrmTaskActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string };

const createSchema = z.object({
  subjectType: z.enum(CRM_TASK_SUBJECT_TYPES),
  subjectId: z.string().uuid(),
  title: z.string().trim().min(1, "Title is required.").max(300),
  body: z.string().trim().max(4000).optional().nullable(),
  dueAt: z.string().datetime().optional().nullable(),
  priority: z.enum(CRM_TASK_PRIORITIES).optional(),
  assigneeUserId: z.string().uuid().optional().nullable(),
});

function revalidateForSubject(subjectType: string, subjectId: string) {
  revalidatePath("/dashboard/tasks");
  const href = subjectHref(subjectType as never, subjectId);
  if (href) revalidatePath(href);
}

export async function createTask(
  input: z.infer<typeof createSchema>,
): Promise<CrmTaskActionResult> {
  const ctx = await requirePermission("crm_tasks.write");
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid task." };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const organizationId = await requireOrgId();
  const v = parsed.data;
  const actorId = ctx.appUser?.id ?? null;

  const [row] = await db
    .insert(crmTasks)
    .values({
      organizationId,
      subjectType: v.subjectType,
      subjectId: v.subjectId,
      title: v.title,
      body: v.body ?? null,
      dueAt: v.dueAt ? new Date(v.dueAt) : null,
      priority: v.priority ?? "normal",
      assigneeUserId: v.assigneeUserId ?? actorId,
      status: "open",
      createdByAppUserId: actorId,
    })
    .returning({ id: crmTasks.id });

  if (!row) return { ok: false, error: "Could not create task." };

  await recordAuditEvent({
    actorUserId: actorId,
    action: "crm_task.create",
    entityType: "crm_task",
    entityId: row.id,
    after: {
      subjectType: v.subjectType,
      subjectId: v.subjectId,
      title: v.title,
      dueAt: v.dueAt ?? null,
      assigneeUserId: v.assigneeUserId ?? actorId,
    },
    metadata: { subjectType: v.subjectType, subjectId: v.subjectId },
  });

  revalidateForSubject(v.subjectType, v.subjectId);
  return { ok: true, id: row.id };
}

const completeSchema = z.object({
  id: z.string().uuid(),
  done: z.boolean().default(true),
});

/**
 * Toggle a task open ⇆ done. Org-scoped UPDATE; audit-logged as
 * crm_task.complete / crm_task.reopen.
 */
export async function completeTask(
  input: z.infer<typeof completeSchema>,
): Promise<CrmTaskActionResult> {
  const ctx = await requirePermission("crm_tasks.write");
  const parsed = completeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const organizationId = await requireOrgId();
  const actorId = ctx.appUser?.id ?? null;
  const done = parsed.data.done;

  const [before] = await db
    .select()
    .from(crmTasks)
    .where(and(eq(crmTasks.id, parsed.data.id), eq(crmTasks.organizationId, organizationId)))
    .limit(1);
  if (!before) return { ok: false, error: "Task not found." };

  await db
    .update(crmTasks)
    .set({
      status: done ? "done" : "open",
      completedAt: done ? new Date() : null,
      completedByAppUserId: done ? actorId : null,
      updatedAt: new Date(),
    })
    .where(and(eq(crmTasks.id, parsed.data.id), eq(crmTasks.organizationId, organizationId)));

  await recordAuditEvent({
    actorUserId: actorId,
    action: done ? "crm_task.complete" : "crm_task.reopen",
    entityType: "crm_task",
    entityId: before.id,
    before: { status: before.status },
    after: { status: done ? "done" : "open" },
    metadata: { subjectType: before.subjectType, subjectId: before.subjectId, title: before.title },
  });

  revalidateForSubject(before.subjectType, before.subjectId);
  return { ok: true, id: before.id };
}

const reassignSchema = z.object({
  id: z.string().uuid(),
  assigneeUserId: z.string().uuid().nullable(),
});

/**
 * Reassign a task to another internal user (or unassign with null).
 * Org-scoped UPDATE; audit-logged as crm_task.reassign.
 */
export async function reassignTask(
  input: z.infer<typeof reassignSchema>,
): Promise<CrmTaskActionResult> {
  const ctx = await requirePermission("crm_tasks.write");
  const parsed = reassignSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const organizationId = await requireOrgId();
  const actorId = ctx.appUser?.id ?? null;

  const [before] = await db
    .select()
    .from(crmTasks)
    .where(and(eq(crmTasks.id, parsed.data.id), eq(crmTasks.organizationId, organizationId)))
    .limit(1);
  if (!before) return { ok: false, error: "Task not found." };

  await db
    .update(crmTasks)
    .set({ assigneeUserId: parsed.data.assigneeUserId, updatedAt: new Date() })
    .where(and(eq(crmTasks.id, parsed.data.id), eq(crmTasks.organizationId, organizationId)));

  await recordAuditEvent({
    actorUserId: actorId,
    action: "crm_task.reassign",
    entityType: "crm_task",
    entityId: before.id,
    before: { assigneeUserId: before.assigneeUserId },
    after: { assigneeUserId: parsed.data.assigneeUserId },
    metadata: { subjectType: before.subjectType, subjectId: before.subjectId },
  });

  revalidateForSubject(before.subjectType, before.subjectId);
  return { ok: true, id: before.id };
}
