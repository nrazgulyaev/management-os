import "server-only";

import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { appUsers, roles, userRoles } from "@/lib/db/schema/identity";
import { organizations } from "@/lib/db/schema/saas";
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
  | {
      ok: false;
      reason:
        | "db_missing"
        | "secret_required"
        | "secret_invalid"
        | "not_configured"
        | "internal"
        | "arconique_default_org_missing";
    };

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

  // 1) Ensure the super_admin role exists (covers fresh databases without
  //    seed). assign_user_role() looks roles up by key, so we don't need the
  //    id here — just guarantee the row.
  const [existingRole] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.key, "super_admin"))
    .limit(1);
  if (!existingRole) {
    await db
      .insert(roles)
      .values({
        key: "super_admin",
        name: "Super Admin",
        description: "System custodian, access, integrations",
        isSystem: true,
      });
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
      // Stage 9.0 third attempt — app_users.organization_id is NOT NULL.
      // Resolve ARCONIQUE_DEFAULT (seeded by 0071) and tie the new
      // bootstrap admin to it. If the org is missing, refuse — bootstrap
      // depends on it as a hard prerequisite (same as the 0087 backfill).
      const [arconiqueDefault] = await db
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.organizationCode, "ARCONIQUE_DEFAULT"))
        .limit(1);
      if (!arconiqueDefault) {
        return { ok: false, reason: "arconique_default_org_missing" };
      }
      const [inserted] = await db
        .insert(appUsers)
        .values({
          authUserId: input.authUserId,
          email: input.email.toLowerCase(),
          fullName: input.fullName,
          organizationId: arconiqueDefault.id,
          status: "active",
        })
        .returning({ id: appUsers.id });
      appUserId = inserted.id;
    }
  }

  // 3) Ensure the role assignment exists (global scope). We delegate to the
  //    SECURITY DEFINER helper from migration 0004 so:
  //      · The insert succeeds even when the request runs without an existing
  //        internal session (RLS bootstrap chicken-and-egg).
  //      · The (user_id, role_id, NULL, NULL) tuple is unique under the
  //        UNIQUE NULLS NOT DISTINCT constraint — no ambiguous nulls.
  //      · Re-running the bootstrap is a no-op (returns the existing id).
  await db.execute(
    sql`SELECT public.assign_user_role(${appUserId}::uuid, ${"super_admin"}::text, NULL::text, NULL::uuid)`,
  );

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
