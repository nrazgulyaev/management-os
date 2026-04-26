"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { appUsersOwners } from "@/lib/db/schema/access-grants";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requirePermission } from "@/features/auth/permissions";
import { createGrantSchema, grantIdSchema } from "./schema";
import { findActiveGrant } from "./services";
import type { ActionResult } from "@/features/projects/actions";

export async function createOwnerAccessGrantAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("owner_access.manage");
  const parsed = createGrantSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please review the form.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const d = parsed.data;
  const existing = await findActiveGrant(d.appUserId, d.ownerId, d.grantType);
  if (existing) {
    return {
      ok: false,
      error: "An active grant of this type already links this user to this owner.",
    };
  }

  const me = await getCurrentAppUser();
  const [row] = await db
    .insert(appUsersOwners)
    .values({
      appUserId: d.appUserId,
      ownerId: d.ownerId,
      grantType: d.grantType,
      status: "active",
      grantedBy: me?.id ?? null,
      notes: d.notes && d.notes !== "" ? d.notes : null,
    })
    .returning({ id: appUsersOwners.id });

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "owner_access.grant",
    entityType: "app_users_owners",
    entityId: row.id,
    after: {
      appUserId: d.appUserId,
      ownerId: d.ownerId,
      grantType: d.grantType,
    },
  });

  revalidatePath(`/dashboard/owners/${d.ownerId}`);
  revalidatePath(`/dashboard/owners/${d.ownerId}/access`);
  revalidatePath(`/dashboard/settings/users/${d.appUserId}`);
  return { ok: true };
}

export async function revokeOwnerAccessGrantAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("owner_access.manage");
  const parsed = grantIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Missing grant id." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const me = await getCurrentAppUser();
  const [before] = await db
    .select()
    .from(appUsersOwners)
    .where(eq(appUsersOwners.id, parsed.data.id))
    .limit(1);
  if (!before) return { ok: false, error: "Grant not found." };
  if (before.status === "revoked") return { ok: true };

  await db
    .update(appUsersOwners)
    .set({
      status: "revoked",
      revokedAt: new Date(),
      revokedBy: me?.id ?? null,
    })
    .where(eq(appUsersOwners.id, parsed.data.id));

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "owner_access.revoke",
    entityType: "app_users_owners",
    entityId: parsed.data.id,
    before: { status: before.status },
    after: { status: "revoked" },
  });

  revalidatePath(`/dashboard/owners/${before.ownerId}`);
  revalidatePath(`/dashboard/owners/${before.ownerId}/access`);
  revalidatePath(`/dashboard/settings/users/${before.appUserId}`);
  return { ok: true };
}

export async function reactivateOwnerAccessGrantAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("owner_access.manage");
  const parsed = grantIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Missing grant id." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const me = await getCurrentAppUser();
  const [before] = await db
    .select()
    .from(appUsersOwners)
    .where(eq(appUsersOwners.id, parsed.data.id))
    .limit(1);
  if (!before) return { ok: false, error: "Grant not found." };
  if (before.status === "active") return { ok: true };

  // Block reactivation if a different active grant of the same type already exists.
  const existing = await findActiveGrant(
    before.appUserId,
    before.ownerId,
    before.grantType as "owner_portal" | "investor_readonly" | "finance_approver",
  );
  if (existing && existing !== parsed.data.id) {
    return {
      ok: false,
      error:
        "Another active grant of this type already exists. Revoke it first or pick a different grant type.",
    };
  }

  await db
    .update(appUsersOwners)
    .set({ status: "active", revokedAt: null, revokedBy: null })
    .where(eq(appUsersOwners.id, parsed.data.id));

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "owner_access.reactivate",
    entityType: "app_users_owners",
    entityId: parsed.data.id,
    before: { status: before.status },
    after: { status: "active" },
  });

  revalidatePath(`/dashboard/owners/${before.ownerId}`);
  revalidatePath(`/dashboard/owners/${before.ownerId}/access`);
  revalidatePath(`/dashboard/settings/users/${before.appUserId}`);
  return { ok: true };
}
