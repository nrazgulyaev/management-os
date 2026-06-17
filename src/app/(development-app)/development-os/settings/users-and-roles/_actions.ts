"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { appUsers } from "@/lib/db/schema/identity";
import { appUserRoles } from "@/lib/db/schema/role-cabinets";
import { requireInternalUser } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import {
  grantUserRole,
  revokeUserRole,
} from "@/lib/development/server/roles/role-actions";
import { ALL_ROLE_KEYS, type RoleKey } from "@/lib/development/server/roles/role-helpers";

/**
 * Co-located, org-scoped adapters for the Users & roles admin surface.
 *
 * SECURITY: the underlying `grantUserRole` / `revokeUserRole` actions key
 * off a raw userId / roleId and do NOT verify org membership (app_user_roles
 * has no org column — the org boundary lives on app_users.organization_id).
 * Mounting the UI directly onto them would let an admin in org A grant/revoke
 * roles for users in org B. These adapters first verify the target belongs to
 * the caller's org (join through app_users), THEN delegate. The client never
 * supplies an org id.
 */

const PATH = "/development-os/settings/users-and-roles";

const grantSchema = z.object({
  userId: z.string().uuid(),
  roleKey: z.enum([...ALL_ROLE_KEYS] as [RoleKey, ...RoleKey[]]),
  scope: z.enum(["company_wide", "project_specific"]),
  isPrimary: z.boolean().default(false),
});

export async function grantRoleScoped(
  input: z.input<typeof grantSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireInternalUser();
  const organizationId = await requireOrgId();
  const parsed = grantSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "DB not configured" };

  // The target user MUST belong to the caller's org.
  const [target] = await db
    .select({ id: appUsers.id })
    .from(appUsers)
    .where(
      and(
        eq(appUsers.id, parsed.data.userId),
        eq(appUsers.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!target) {
    return { ok: false, error: "User not found in this organization" };
  }

  const result = await grantUserRole({
    userId: parsed.data.userId,
    roleKey: parsed.data.roleKey,
    scope: parsed.data.scope,
    isPrimary: parsed.data.isPrimary,
    grantedBy: ctx.appUser?.id,
  });
  if (!result.ok) return { ok: false, error: result.error ?? "Grant failed" };
  revalidatePath(PATH);
  return { ok: true };
}

const revokeSchema = z.object({ roleId: z.string().uuid() });

export async function revokeRoleScoped(
  input: z.input<typeof revokeSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireInternalUser();
  const organizationId = await requireOrgId();
  const parsed = revokeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "DB not configured" };

  // The role grant MUST belong to a user in the caller's org.
  const [target] = await db
    .select({ id: appUserRoles.id })
    .from(appUserRoles)
    .innerJoin(appUsers, eq(appUsers.id, appUserRoles.userId))
    .where(
      and(
        eq(appUserRoles.id, parsed.data.roleId),
        eq(appUsers.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!target) {
    return { ok: false, error: "Role grant not found in this organization" };
  }

  const result = await revokeUserRole({
    roleId: parsed.data.roleId,
    revokedBy: ctx.appUser?.id,
    reason: "Revoked from Users & roles admin",
  });
  if (!result.ok) return { ok: false, error: result.error ?? "Revoke failed" };
  revalidatePath(PATH);
  return { ok: true };
}
