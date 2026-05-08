/**
 * Link a Supabase Auth user to a super_admin app_users row from the CLI.
 * Useful when the visual /setup/admin-bootstrap flow is not practical
 * (e.g. CI provisioning, recovery, or operator on-call).
 *
 *   AUTH_USER_ID=<uuid> EMAIL=<email> FULL_NAME="Name" \
 *     npx tsx scripts/bootstrap-admin.ts
 *
 *   # If a super_admin already exists, also pass:
 *   ADMIN_BOOTSTRAP_SECRET=<secret>
 */
// Run with: node --env-file=.env.local --import tsx scripts/bootstrap-admin.ts
// Or via npm: npm run admin:bootstrap (script wires --env-file).
import { eq, and } from "drizzle-orm";
import { linkSupabaseUserToSuperAdmin } from "../src/features/auth/bootstrap";
import { requireDb } from "../src/lib/db/client";
import { appUsers, userRoles, roles } from "../src/lib/db/schema/identity";
import { appUserRoles } from "../src/lib/db/schema/role-cabinets";

async function main() {
  const authUserId = process.env.AUTH_USER_ID;
  const email = process.env.EMAIL;
  const fullName = process.env.FULL_NAME ?? email ?? "Super Admin";
  const secret = process.env.ADMIN_BOOTSTRAP_SECRET ?? null;

  if (!authUserId || !email) {
    console.error(
      "Usage: AUTH_USER_ID=<uuid> EMAIL=<email> [FULL_NAME=...] [ADMIN_BOOTSTRAP_SECRET=...] npx tsx scripts/bootstrap-admin.ts",
    );
    process.exit(1);
  }

  const result = await linkSupabaseUserToSuperAdmin({
    authUserId,
    email,
    fullName,
    providedSecret: secret,
    ipAddress: null,
    userAgent: "scripts/bootstrap-admin.ts",
  });

  if (!result.ok) {
    console.error(`✗ Bootstrap failed: ${result.reason}`);
    process.exit(1);
  }
  console.log(
    `✓ Linked ${email} as super_admin · app_user ${result.appUserId}` +
      (result.firstAdmin ? " (first admin)" : ""),
  );

  // Stage 8.F.2 — verify the full provisioning chain landed. Phase 0 silently
  // failed because we trusted linkSupabaseUserToSuperAdmin's return without
  // confirming downstream rows exist. Catch that class of regression here.
  const db = requireDb();
  const appUser = await db
    .select({ id: appUsers.id })
    .from(appUsers)
    .where(eq(appUsers.authUserId, authUserId))
    .limit(1)
    .then((rows) => rows[0]);
  if (!appUser) {
    console.error(
      "✗ Verification failed: bootstrap returned ok but no app_users row was created.",
    );
    process.exit(2);
  }

  const internalGrant = await db
    .select({ id: userRoles.id, roleKey: roles.key })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(userRoles.userId, appUser.id))
    .limit(1)
    .then((rows) => rows[0]);
  if (!internalGrant || internalGrant.roleKey !== "super_admin") {
    console.error(
      `✗ Verification failed: app_user ${appUser.id} has no super_admin grant in user_roles.`,
    );
    process.exit(2);
  }

  // Cabinet grant (app_user_roles) is provisioned by the 0087 backfill OR
  // by /api/onboarding/start. bootstrap-admin doesn't insert it directly,
  // so a missing cabinet grant is a soft warning, not a fatal error.
  const cabinetGrant = await db
    .select({ id: appUserRoles.id })
    .from(appUserRoles)
    .where(
      and(
        eq(appUserRoles.userId, appUser.id),
        eq(appUserRoles.isActive, true),
      ),
    )
    .limit(1)
    .then((rows) => rows[0]);
  if (!cabinetGrant) {
    console.warn(
      `⚠ No app_user_roles grant for app_user ${appUser.id}. Run migration 0087 to backfill, or insert manually.`,
    );
  }

  console.log(
    `✓ Provisioning verified: app_user=${appUser.id} user_roles.super_admin=ok app_user_roles=${cabinetGrant ? "ok" : "missing"}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
