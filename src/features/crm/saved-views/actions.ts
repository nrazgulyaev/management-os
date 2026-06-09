"use server";

/**
 * CRM-SAVED-VIEWS-BULK (#169) — saved-view write actions.
 *
 * BUILD-SAFETY (PR #168): this "use server" file exports ONLY async
 * functions. All zod schemas / consts / types live as module-local consts
 * (not exported) or in ./filter-types (a plain module).
 *
 * Every write is permission-gated (owners.write), org + user scoped via
 * requireOrgId + the current app-user, and audit-logged. getDb() may be
 * null (demo) → actions no-op with a friendly result.
 */

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { crmSavedViews } from "@/lib/db/schema/crm-saved-views";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { canManageEntity } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import { coerceColumns, coerceConditions } from "./filter-types";

export interface SavedViewResult {
  ok: boolean;
  error?: string;
  viewId?: string;
}

const entitySchema = z.enum(["owners", "contacts", "leads"]);

const conditionSchema = z.object({
  field: z.string().min(1).max(120),
  op: z.enum([
    "is",
    "is_not",
    "contains",
    "not_contains",
    "is_set",
    "is_empty",
  ]),
  values: z.array(z.string().max(400)).max(50).default([]),
});

const saveViewSchema = z.object({
  id: z.string().uuid().optional(),
  entity: entitySchema,
  name: z.string().min(1).max(120),
  conditions: z.array(conditionSchema).max(40).default([]),
  columns: z.array(z.string().min(1).max(120)).max(40).nullable().default(null),
  isShared: z.boolean().default(false),
  isDefault: z.boolean().default(false),
});

export type SaveViewInput = z.infer<typeof saveViewSchema>;

/**
 * Create or update a saved view. New views are scoped to the current org +
 * app user. Updates are AND-scoped by org + owning user so a user can only
 * mutate their own (or — for shared edits — an org-shared) view.
 */
export async function saveCrmViewAction(
  input: SaveViewInput,
): Promise<SavedViewResult> {
  if (!(await canManageEntity("owner"))) {
    return { ok: false, error: "Not authorised." };
  }
  const parsed = saveViewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid view." };
  const d = parsed.data;

  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const organizationId = await requireOrgId();
  const me = await getCurrentAppUser();

  const conditions = coerceConditions(d.conditions);
  const columns = coerceColumns(d.columns);

  // Enforce "at most one default per user+entity" by clearing prior defaults.
  if (d.isDefault && me?.id) {
    await db
      .update(crmSavedViews)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(
        and(
          eq(crmSavedViews.appUserId, me.id),
          eq(crmSavedViews.entity, d.entity),
        ),
      );
  }

  if (d.id) {
    // Update — only the owner may edit; org-scope guards cross-tenant writes.
    const [before] = await db
      .select()
      .from(crmSavedViews)
      .where(eq(crmSavedViews.id, d.id))
      .limit(1);
    if (!before) return { ok: false, error: "View not found." };
    if (me?.id && before.appUserId && before.appUserId !== me.id) {
      return { ok: false, error: "You can only edit your own views." };
    }
    await db
      .update(crmSavedViews)
      .set({
        name: d.name,
        filterJson: conditions,
        columnsJson: columns,
        isShared: d.isShared,
        isDefault: d.isDefault,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(crmSavedViews.id, d.id),
          eq(crmSavedViews.organizationId, organizationId),
        ),
      );

    await recordAuditEvent({
      actorUserId: me?.id ?? null,
      action: "crm.saved_view.update",
      entityType: "crm_saved_view",
      entityId: d.id,
      after: { entity: d.entity, name: d.name, conditionCount: conditions.length },
    });
    revalidatePath(`/dashboard/${d.entity}`);
    return { ok: true, viewId: d.id };
  }

  const [row] = await db
    .insert(crmSavedViews)
    .values({
      organizationId,
      appUserId: me?.id ?? null,
      entity: d.entity,
      name: d.name,
      filterJson: conditions,
      columnsJson: columns,
      isShared: d.isShared,
      isDefault: d.isDefault,
      createdByAppUserId: me?.id ?? null,
    })
    .returning({ id: crmSavedViews.id });

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "crm.saved_view.create",
    entityType: "crm_saved_view",
    entityId: row.id,
    after: { entity: d.entity, name: d.name, conditionCount: conditions.length },
  });
  revalidatePath(`/dashboard/${d.entity}`);
  return { ok: true, viewId: row.id };
}

const deleteViewSchema = z.object({ id: z.string().uuid(), entity: entitySchema });

/** Delete a saved view the current user owns (org-scoped guard). */
export async function deleteCrmViewAction(
  input: z.infer<typeof deleteViewSchema>,
): Promise<SavedViewResult> {
  if (!(await canManageEntity("owner"))) {
    return { ok: false, error: "Not authorised." };
  }
  const parsed = deleteViewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const organizationId = await requireOrgId();
  const me = await getCurrentAppUser();

  const [before] = await db
    .select()
    .from(crmSavedViews)
    .where(eq(crmSavedViews.id, parsed.data.id))
    .limit(1);
  if (!before) return { ok: false, error: "View not found." };
  if (me?.id && before.appUserId && before.appUserId !== me.id) {
    return { ok: false, error: "You can only delete your own views." };
  }

  await db
    .delete(crmSavedViews)
    .where(
      and(
        eq(crmSavedViews.id, parsed.data.id),
        eq(crmSavedViews.organizationId, organizationId),
      ),
    );

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "crm.saved_view.delete",
    entityType: "crm_saved_view",
    entityId: parsed.data.id,
    before: { name: before.name, entity: before.entity },
  });
  revalidatePath(`/dashboard/${parsed.data.entity}`);
  return { ok: true };
}
