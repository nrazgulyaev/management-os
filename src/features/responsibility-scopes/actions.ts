"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { userResponsibilityScopes } from "@/lib/db/schema/availability";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requirePermission } from "@/features/auth/permissions";
import {
  archiveResponsibilityScopeSchema,
  createResponsibilityScopeSchema,
} from "@/features/availability/schema";
import type { ActionResult } from "@/features/projects/actions";

export async function createResponsibilityScopeAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult & { scopeId?: string }> {
  await requirePermission("responsibility_scopes.manage");
  const raw = Object.fromEntries(formData.entries());
  const parsed = createResponsibilityScopeSchema.safeParse({
    ...raw,
    roleKey: raw.roleKey || null,
    projectId: raw.projectId || null,
    villaId: raw.villaId || null,
    taskCategory: raw.taskCategory || null,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();

  const [row] = await db
    .insert(userResponsibilityScopes)
    .values({
      userId: parsed.data.userId,
      roleKey: parsed.data.roleKey ?? null,
      projectId: parsed.data.projectId ?? null,
      villaId: parsed.data.villaId ?? null,
      taskCategory: parsed.data.taskCategory ?? null,
      scopeType: parsed.data.scopeType,
      status: "active",
      createdBy: me?.id ?? null,
    })
    .returning({ id: userResponsibilityScopes.id });

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "responsibility_scope.create",
    entityType: "user_responsibility_scope",
    entityId: row!.id,
    after: parsed.data,
  });

  revalidatePath("/dashboard/settings/responsibility-scopes");
  return { ok: true, scopeId: row!.id };
}

export async function archiveResponsibilityScopeAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("responsibility_scopes.manage");
  const parsed = archiveResponsibilityScopeSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) return { ok: false, error: "Missing scope id." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();

  await db
    .update(userResponsibilityScopes)
    .set({ status: "archived", updatedAt: new Date() })
    .where(eq(userResponsibilityScopes.id, parsed.data.id));

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "responsibility_scope.archive",
    entityType: "user_responsibility_scope",
    entityId: parsed.data.id,
  });

  revalidatePath("/dashboard/settings/responsibility-scopes");
  return { ok: true };
}
