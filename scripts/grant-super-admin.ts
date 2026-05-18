#!/usr/bin/env tsx
/**
 * SESSION-RESOLUTION-1-PART-2 T2 — grant super_admin role to an operator.
 * Idempotent. Safe to re-run.
 *
 * Wraps the existing `public.assign_user_role()` SECURITY DEFINER SQL
 * helper (created by migration 0004_bootstrap_user_roles_fix.sql) that
 * the in-app bootstrap flow already uses. Doing it from a CLI is the
 * canonical fallback when the operator can't visit /setup/admin-bootstrap
 * (or has already finished bootstrap but skipped this account).
 *
 * The chain `requirePermission()` walks at request time depends on:
 *   1. app_users row linked to the auth user            (existing — ok)
 *   2. app_users.organization_id pointing to the org    (existing — ok)
 *   3. user_roles row tying app_users.id → roles.id      ← THIS SCRIPT
 *   4. role_permissions tying that role to the action
 *
 * super_admin is intended to bypass role_permissions checks via the
 * is_super_admin() helper baked into RLS policies and
 * `requirePermission()`.
 *
 * Usage:
 *
 *   EMAIL=nrazgulyaev@gmail.com npm run grant:super-admin
 *   APP_USER_ID=<uuid>          npm run grant:super-admin
 *
 * Output: PASS verdict (role already present) or applied + verified.
 */

import { sql } from "drizzle-orm";
import { getDb, closeDb } from "./lib/db-script";

interface Args {
  email: string | null;
  appUserId: string | null;
  roleKey: string;
}

function parseArgs(): Args {
  return {
    email: process.env.EMAIL ?? null,
    appUserId: process.env.APP_USER_ID ?? null,
    roleKey: process.env.ROLE_KEY ?? "super_admin",
  };
}

function asRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    return ((result as { rows: T[] }).rows) ?? [];
  }
  return [];
}

async function main(): Promise<void> {
  const args = parseArgs();
  console.log("===========================================");
  console.log(` Grant '${args.roleKey}' to operator`);
  console.log("===========================================\n");

  if (!args.email && !args.appUserId) {
    console.error("Usage: EMAIL=<email> [ROLE_KEY=super_admin] npm run grant:super-admin");
    console.error("    OR APP_USER_ID=<uuid> npm run grant:super-admin");
    process.exit(2);
  }

  const db = getDb();

  // -----------------------------------------------------------------
  // Resolve target app_user row
  // -----------------------------------------------------------------
  let resolvedAppUserId = args.appUserId;
  let resolvedEmail = args.email;

  if (!resolvedAppUserId && resolvedEmail) {
    const rows = asRows<{ id: string; email: string }>(
      await db.execute(sql`
        SELECT id::text AS id, email FROM app_users
         WHERE lower(email) = lower(${resolvedEmail}) LIMIT 1
      `),
    );
    if (rows.length === 0) {
      console.error(`✗ No app_users row for email ${resolvedEmail}`);
      console.error("  Run npm run diagnose:session first to inspect the chain.");
      await closeDb();
      process.exit(1);
    }
    resolvedAppUserId = rows[0].id;
    resolvedEmail = rows[0].email;
  } else if (resolvedAppUserId && !resolvedEmail) {
    const rows = asRows<{ email: string }>(
      await db.execute(sql`
        SELECT email FROM app_users WHERE id = ${resolvedAppUserId}::uuid LIMIT 1
      `),
    );
    if (rows.length === 0) {
      console.error(`✗ No app_users row for id ${resolvedAppUserId}`);
      await closeDb();
      process.exit(1);
    }
    resolvedEmail = rows[0].email;
  }

  console.log(`  target: ${resolvedEmail} (app_users.id=${resolvedAppUserId})`);

  // -----------------------------------------------------------------
  // Ensure target role exists
  // -----------------------------------------------------------------
  const roleRows = asRows<{ id: string; name: string }>(
    await db.execute(sql`
      SELECT id::text AS id, name FROM roles WHERE key = ${args.roleKey} LIMIT 1
    `),
  );
  if (roleRows.length === 0) {
    console.error(`✗ Role with key '${args.roleKey}' does not exist in the roles table.`);
    console.error("  Available roles:");
    const all = asRows<{ key: string; name: string }>(
      await db.execute(sql`SELECT key, name FROM roles ORDER BY key`),
    );
    for (const r of all) console.error(`    · ${r.key} (${r.name})`);
    console.error(
      "\n  REMEDIATION: bootstrap.ts seeds super_admin lazily. The simplest path is",
    );
    console.error(
      "  to run `npm run admin:bootstrap` once, which creates the role + grants it.",
    );
    await closeDb();
    process.exit(1);
  }
  const roleId = roleRows[0].id;
  console.log(`  role:   ${args.roleKey} (roles.id=${roleId})`);

  // -----------------------------------------------------------------
  // Check current state — is it already granted?
  // -----------------------------------------------------------------
  const existing = asRows<{ id: string; scope_type: string | null; scope_id: string | null }>(
    await db.execute(sql`
      SELECT id::text                AS id,
             scope_type              AS scope_type,
             scope_id::text          AS scope_id
        FROM user_roles
       WHERE user_id = ${resolvedAppUserId}::uuid
         AND role_id = ${roleId}::uuid
    `),
  );

  if (existing.some((r) => r.scope_type === null && r.scope_id === null)) {
    console.log(`\n✓ Already granted globally — no change needed.`);
    await closeDb();
    process.exit(0);
  }

  // -----------------------------------------------------------------
  // Apply via SECURITY DEFINER helper from migration 0004.
  // Signature: assign_user_role(uuid user_id, text role_key, text scope_type, uuid scope_id)
  // Global grant = (user_id, role_key, NULL, NULL)
  // -----------------------------------------------------------------
  console.log("\n  applying: assign_user_role(user, role, NULL, NULL) (global scope)...");
  try {
    await db.execute(
      sql`SELECT public.assign_user_role(
            ${resolvedAppUserId}::uuid,
            ${args.roleKey}::text,
            NULL::text,
            NULL::uuid
          )`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`✗ Grant failed: ${msg}`);
    console.error("  If the SECURITY DEFINER helper is missing, run migration 0004.");
    await closeDb();
    process.exit(1);
  }

  // -----------------------------------------------------------------
  // Verify
  // -----------------------------------------------------------------
  const after = asRows<{ id: string; scope_type: string | null }>(
    await db.execute(sql`
      SELECT id::text AS id, scope_type
        FROM user_roles
       WHERE user_id = ${resolvedAppUserId}::uuid
         AND role_id = ${roleId}::uuid
         AND scope_type IS NULL
         AND scope_id IS NULL
       LIMIT 1
    `),
  );

  if (after.length === 0) {
    console.error("✗ Verification failed — grant did not materialize.");
    await closeDb();
    process.exit(1);
  }

  console.log(`\n✓ Granted '${args.roleKey}' globally to ${resolvedEmail}.`);
  console.log(`  user_roles.id = ${after[0].id}`);
  console.log("\nRecommended next step:");
  console.log(`  EMAIL=${resolvedEmail} npm run diagnose:session`);
  console.log("  (should now PASS all 4 steps)");
  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
