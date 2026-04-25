import "server-only";

import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { appUsers, roles, userRoles } from "@/lib/db/schema/identity";
import { auditEvents } from "@/lib/db/schema/audit";
import { env } from "@/lib/env";

export type BootstrapState =
  | { stage: "db_missing" }
  | { stage: "needs_super_admin" }
  | { stage: "locked_requires_secret" };

/**
 * Returns the current bootstrap stage so the UI can render the right form.
 *  - db_missing: no DATABASE_URL → must configure Supabase first.
 *  - needs_super_admin: no super_admin exists yet → first link is open.
 *  - locked_requires_secret: super_admin exists → ADMIN_BOOTSTRAP_SECRET required.
 */
export async function getBootstrapState(): Promise<BootstrapState> {
  const db = getDb();
  if (!db) return { stage: "db_missing" };

  const [superRole] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.key, "super_admin"))
    .limit(1);

  if (!superRole) {
    // Roles table not seeded yet — treat as "needs_super_admin" so the
    // bootstrap can also seed the super_admin role on first run.
    return { stage: "needs_super_admin" };
  }

  const existing = await db
    .select({ userId: userRoles.userId })
    .from(userRoles)
    .where(eq(userRoles.roleId, superRole.id))
    .limit(1);

  return existing.length === 0
    ? { stage: "needs_super_admin" }
    : { stage: "locked_requires_secret" };
}

export interface BootstrapInput {
  authUserId: string;
  email: string;
  fullName: string;
  providedSecret?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export type BootstrapOutcome =
  | { ok: true; appUserId: string; firstAdmin: boolean }
  | { ok: false; reason: "db_missing" | "secret_required" | "secret_invalid" | "not_configured" | "internal" };

/**
 * Idempotent: linking the same auth user twice returns ok=true with the
 * existing app_users row id and the super_admin role assignment intact.
 */
export async function linkSupabaseUserToSuperAdmin(
  input: BootstrapInput,
): Promise<BootstrapOutcome> {
  const db = getDb();
  if (!db) return { ok: false, reason: "db_missing" };

  const state = await getBootstrapState();
  if (state.stage === "db_missing") return { ok: false, reason: "db_missing" };

  if (state.stage === "locked_requires_secret") {
    const expected = env.server.ADMIN_BOOTSTRAP_SECRET;
    if (!expected) return { ok: false, reason: "not_configured" };
    if (!input.providedSecret) return { ok: false, reason: "secret_required" };
    if (input.providedSecret !== expected) return { ok: false, reason: "secret_invalid" };
  }

  // 1) Resolve or create the super_admin role (covers fresh databases without seed).
  let superRoleId: string;
  const [existingRole] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.key, "super_admin"))
    .limit(1);
  if (existingRole) {
    superRoleId = existingRole.id;
  } else {
    const [created] = await db
      .insert(roles)
      .values({
        key: "super_admin",
        name: "Super Admin",
        description: "System custodian, access, integrations",
        isSystem: true,
      })
      .returning({ id: roles.id });
    superRoleId = created.id;
  }

  // 2) Find or create the app_user row.
  let appUserId: string;
  const [byAuth] = await db
    .select()
    .from(appUsers)
    .where(eq(appUsers.authUserId, input.authUserId))
    .limit(1);
  if (byAuth) {
    appUserId = byAuth.id;
  } else {
    const [byEmail] = await db
      .select()
      .from(appUsers)
      .where(eq(appUsers.email, input.email.toLowerCase()))
      .limit(1);

    if (byEmail) {
      // Pre-created staff record: link the auth user to it.
      await db
        .update(appUsers)
        .set({ authUserId: input.authUserId, status: "active" })
        .where(eq(appUsers.id, byEmail.id));
      appUserId = byEmail.id;
    } else {
      const [inserted] = await db
        .insert(appUsers)
        .values({
          authUserId: input.authUserId,
          email: input.email.toLowerCase(),
          fullName: input.fullName,
          status: "active",
        })
        .returning({ id: appUsers.id });
      appUserId = inserted.id;
    }
  }

  // 3) Ensure the role assignment exists (global scope).
  const existingAssignment = await db
    .select()
    .from(userRoles)
    .where(and(eq(userRoles.userId, appUserId), eq(userRoles.roleId, superRoleId)))
    .limit(1);

  if (existingAssignment.length === 0) {
    await db.insert(userRoles).values({
      userId: appUserId,
      roleId: superRoleId,
      scopeType: null,
      scopeId: null,
    });
  }

  // 4) Audit it (cannot use recordAuditEvent — that helper expects a request
  //    context. Insert directly so this works from a server action or script.)
  await db.insert(auditEvents).values({
    actorUserId: appUserId,
    action: "auth.bootstrap.super_admin_linked",
    entityType: "app_user",
    entityId: appUserId,
    metadata: {
      authUserId: input.authUserId,
      firstAdmin: state.stage === "needs_super_admin",
      stage: state.stage,
    },
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
  });

  return {
    ok: true,
    appUserId,
    firstAdmin: state.stage === "needs_super_admin",
  };
}
