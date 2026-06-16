"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { appUsersOwners } from "@/lib/db/schema/access-grants";
import { owners } from "@/lib/db/schema/ownership";
import { appUsers } from "@/lib/db/schema/identity";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requirePermission } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
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

  const organizationId = await requireOrgId();
  const d = parsed.data;

  // SECURITY: the appUserId + ownerId are raw client-supplied UUIDs. Verify
  // BOTH belong to the caller's org before linking them, else a known/guessed
  // foreign UUID could be granted access cross-tenant.
  const [owner] = await db
    .select({ id: owners.id })
    .from(owners)
    .where(and(eq(owners.id, d.ownerId), eq(owners.organizationId, organizationId)))
    .limit(1);
  if (!owner) return { ok: false, error: "Owner not found." };

  const [appUser] = await db
    .select({ id: appUsers.id })
    .from(appUsers)
    .where(and(eq(appUsers.id, d.appUserId), eq(appUsers.organizationId, organizationId)))
    .limit(1);
  if (!appUser) return { ok: false, error: "User not found." };

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
      organizationId,
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

  const organizationId = await requireOrgId();
  const me = await getCurrentAppUser();
  // SECURITY: scope the grant lookup + update to the caller's org so a foreign
  // grant UUID can't be revoked cross-tenant.
  const [before] = await db
    .select()
    .from(appUsersOwners)
    .where(
      and(
        eq(appUsersOwners.id, parsed.data.id),
        eq(appUsersOwners.organizationId, organizationId),
      ),
    )
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
    .where(
      and(
        eq(appUsersOwners.id, parsed.data.id),
        eq(appUsersOwners.organizationId, organizationId),
      ),
    );

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

  const organizationId = await requireOrgId();
  const me = await getCurrentAppUser();
  // SECURITY: scope the grant lookup + update to the caller's org so a foreign
  // grant UUID can't be reactivated cross-tenant.
  const [before] = await db
    .select()
    .from(appUsersOwners)
    .where(
      and(
        eq(appUsersOwners.id, parsed.data.id),
        eq(appUsersOwners.organizationId, organizationId),
      ),
    )
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
    .where(
      and(
        eq(appUsersOwners.id, parsed.data.id),
        eq(appUsersOwners.organizationId, organizationId),
      ),
    );

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
