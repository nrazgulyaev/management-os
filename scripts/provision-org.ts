#!/usr/bin/env tsx
/**
 * provision-org — create ONE real tenant organization + ONE login-capable
 * super_admin, with ZERO demo/business data. Idempotent. Safe to re-run.
 *
 * Why this exists: none of the prior tooling can create a *new* org bound to
 * a *new* admin. `grant-super-admin.ts` only grants a role to an existing
 * app_user; `bootstrap-admin.ts` / `linkSupabaseUserToSuperAdmin` hardcode the
 * org to ARCONIQUE_DEFAULT; `/api/onboarding/start` inserts organization_type
 * values that violate the 0071 CHECK constraint. This script wraps the only
 * constraint-safe path (mirrors src/features/signup/actions.ts) + the verified
 * idempotent SECURITY DEFINER fn public.provision_app_user() from migration
 * 0087.
 *
 * IT DOES NOT create the Supabase auth user. Login is Supabase email+password;
 * you must first create the auth user (Supabase dashboard → Authentication →
 * Users → Add user, "Auto Confirm User" checked) and pass its UID as
 * AUTH_USER_ID. Without that UID there is no sign-in identity to link, so the
 * script refuses to run (prints the exact dashboard steps and exits non-zero)
 * rather than create an org with an unloginnable admin.
 *
 * What it writes (all idempotent):
 *   1. organizations            — one row (ON CONFLICT (organization_code) DO NOTHING)
 *   2. app_users                — linked to AUTH_USER_ID, organization_id = the new org
 *   3. user_roles               — global super_admin grant (the master access key)
 *   4. app_user_roles           — 'admin' cabinet row (UI routing only)
 *   (2-4 are all done atomically by public.provision_app_user.)
 *
 * It writes NO villas / owners / projects / bookings — the org starts empty.
 *
 * Usage:
 *
 *   AUTH_USER_ID=<supabase-uid> \
 *   ADMIN_EMAIL=admin@arconique.com \
 *   ADMIN_FULL_NAME="Arconique Management Admin" \
 *   ORG_CODE=ARCONIQUE_MGMT \
 *   ORG_NAME="Arconique Management" \
 *   npm run provision:org
 *
 * Optional env:
 *   ORG_DISPLAY_NAME  — brand name if it differs from the legal `name`
 *   ORG_TYPE          — default 'developer_client' (must be in the 0071 CHECK set)
 *   PRODUCTS          — comma list, default 'mgmt,dev'. Use 'mgmt' for mgmt-only.
 *   DRY_RUN=1         — print what would happen; write nothing.
 *
 * Re-running is safe: the org insert uses ON CONFLICT DO NOTHING and
 * provision_app_user() is idempotent on (auth_user_id / email).
 */

import { sql } from "drizzle-orm";
import { getDb, closeDb } from "./lib/db-script";

const ORG_TYPE_ALLOWED = [
  "arconique_internal",
  "developer_client",
  "partner_organization",
  "demo_test",
  "archived",
];

function asRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    return (result as { rows: T[] }).rows ?? [];
  }
  return [];
}

function maskedDbHost(): string {
  const url = process.env.DATABASE_URL ?? "";
  try {
    const u = new URL(url);
    return `${u.hostname}${u.port ? `:${u.port}` : ""}/${u.pathname.replace(/^\//, "")}`;
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

function printSupabaseInstructions(adminEmail: string | null): void {
  console.error(
    "\n✗ AUTH_USER_ID is required — this script does NOT create the Supabase auth user.\n",
  );
  console.error("  Create the sign-in identity first, then re-run:");
  console.error("  1. Open your Supabase project → Authentication → Users → Add user → Create new user.");
  console.error(
    `  2. Email: ${adminEmail ?? "<the admin email>"}  ·  set a password  ·  CHECK \"Auto Confirm User\".`,
  );
  console.error("  3. Copy the new user's UID (User UID column).");
  console.error("  4. Re-run with:");
  console.error(
    `       AUTH_USER_ID=<that-uid> ADMIN_EMAIL=${adminEmail ?? "admin@arconique.com"} npm run provision:org`,
  );
  console.error(
    "\n  (Same email in Supabase and ADMIN_EMAIL — that pair is what lets you log in.)\n",
  );
}

async function main(): Promise<void> {
  const orgCode = (process.env.ORG_CODE ?? "ARCONIQUE_MGMT").trim();
  const orgName = (process.env.ORG_NAME ?? "Arconique Management").trim();
  const orgDisplayName = process.env.ORG_DISPLAY_NAME?.trim() || null;
  const orgType = (process.env.ORG_TYPE ?? "developer_client").trim();
  const products = (process.env.PRODUCTS ?? "mgmt,dev")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const adminEmail = process.env.ADMIN_EMAIL?.trim() || null;
  const adminFullName =
    process.env.ADMIN_FULL_NAME?.trim() || "Arconique Management Admin";
  const authUserId = process.env.AUTH_USER_ID?.trim() || null;
  const dryRun = process.env.DRY_RUN === "1";

  console.log("===========================================");
  console.log(" Provision real tenant org + super_admin");
  console.log("===========================================");
  console.log(`  database:   ${maskedDbHost()}`);
  console.log(`  org code:   ${orgCode}`);
  console.log(`  org name:   ${orgName}${orgDisplayName ? ` (display: ${orgDisplayName})` : ""}`);
  console.log(`  org type:   ${orgType}`);
  console.log(`  products:   [${products.join(", ")}]`);
  console.log(`  admin:      ${adminEmail ?? "(missing)"} — ${adminFullName}`);
  console.log(`  auth uid:   ${authUserId ?? "(missing)"}`);
  console.log(`  mode:       ${dryRun ? "DRY RUN (no writes)" : "LIVE"}\n`);

  // -------- input validation --------
  if (!adminEmail) {
    console.error("✗ ADMIN_EMAIL is required.");
    console.error('  e.g. ADMIN_EMAIL=admin@arconique.com AUTH_USER_ID=<uid> npm run provision:org');
    process.exit(2);
  }
  if (!authUserId) {
    printSupabaseInstructions(adminEmail);
    process.exit(2);
  }
  if (!ORG_TYPE_ALLOWED.includes(orgType)) {
    console.error(
      `✗ ORG_TYPE '${orgType}' is not allowed by the organizations CHECK constraint.`,
    );
    console.error(`  Allowed: ${ORG_TYPE_ALLOWED.join(", ")}`);
    process.exit(2);
  }
  for (const p of products) {
    if (p !== "mgmt" && p !== "dev") {
      console.error(`✗ PRODUCTS contains '${p}' — only 'mgmt' and 'dev' are valid product slugs.`);
      process.exit(2);
    }
  }

  if (dryRun) {
    console.log("DRY RUN — would:");
    console.log(`  1. INSERT organizations (code=${orgCode}, name=${orgName}, type=${orgType}, products=[${products.join(",")}]) ON CONFLICT DO NOTHING`);
    console.log(`  2. SELECT public.provision_app_user(${authUserId}, ${adminEmail}, "${adminFullName}", <org id>, 'super_admin', 'admin')`);
    console.log("  3. Verify app_users + user_roles(super_admin) + app_user_roles(admin).");
    console.log("\nNothing was written. Remove DRY_RUN=1 to apply.");
    return;
  }

  const db = getDb();
  const productsSql = sql`ARRAY[${sql.join(
    products.map((p) => sql`${p}`),
    sql`, `,
  )}]::text[]`;

  // -------- 1. org (idempotent) --------
  console.log("  [1/3] ensuring organization row…");
  await db.execute(sql`
    INSERT INTO organizations (organization_code, name, display_name, organization_type, products_enabled)
    VALUES (${orgCode}, ${orgName}, ${orgDisplayName}, ${orgType}, ${productsSql})
    ON CONFLICT (organization_code) DO NOTHING
  `);
  const orgRows = asRows<{ id: string; name: string; created: string }>(
    await db.execute(sql`
      SELECT id::text AS id, name, created_at::text AS created
        FROM organizations
       WHERE organization_code = ${orgCode}
       LIMIT 1
    `),
  );
  if (orgRows.length === 0) {
    console.error("✗ Organization row not found after insert — aborting.");
    await closeDb();
    process.exit(1);
  }
  const orgId = orgRows[0].id;
  console.log(`        org id = ${orgId} (${orgRows[0].name})`);

  // -------- 2. app_user + role grants (atomic, idempotent) --------
  console.log("  [2/3] provisioning admin (app_users + super_admin + admin cabinet)…");
  let appUserId: string;
  try {
    const provRows = asRows<{ app_user_id: string }>(
      await db.execute(sql`
        SELECT public.provision_app_user(
          ${authUserId}::uuid,
          ${adminEmail}::text,
          ${adminFullName}::text,
          ${orgId}::uuid,
          'super_admin'::text,
          'admin'::text
        ) AS app_user_id
      `),
    );
    appUserId = provRows[0]?.app_user_id;
    if (!appUserId) throw new Error("provision_app_user returned no id");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`✗ provision_app_user failed: ${msg}`);
    console.error("  If the function is missing, the live DB is behind — run `npm run db:migrate` (needs migration 0087).");
    await closeDb();
    process.exit(1);
  }
  console.log(`        app_user id = ${appUserId}`);

  // -------- 3. verify --------
  console.log("  [3/3] verifying grants…");
  const userRow = asRows<{ id: string; email: string; organization_id: string }>(
    await db.execute(sql`
      SELECT id::text AS id, email, organization_id::text AS organization_id
        FROM app_users
       WHERE auth_user_id = ${authUserId}::uuid
       LIMIT 1
    `),
  );
  const superAdmin = asRows<{ key: string }>(
    await db.execute(sql`
      SELECT r.key
        FROM user_roles ur
        JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = ${appUserId}::uuid
         AND r.key = 'super_admin'
         AND ur.scope_type IS NULL
         AND ur.scope_id IS NULL
       LIMIT 1
    `),
  );
  const cabinet = asRows<{ role_key: string }>(
    await db.execute(sql`
      SELECT role_key
        FROM app_user_roles
       WHERE user_id = ${appUserId}::uuid
         AND role_key = 'admin'
         AND is_active = true
       LIMIT 1
    `),
  );

  const okUser = userRow[0]?.organization_id === orgId;
  const okSuper = superAdmin.length > 0;
  const okCabinet = cabinet.length > 0;

  console.log(`        app_users.organization_id matches org … ${okUser ? "✓" : "✗"}`);
  console.log(`        user_roles super_admin (global) ……… ${okSuper ? "✓" : "✗"}`);
  console.log(`        app_user_roles admin (active) ……… ${okCabinet ? "✓" : "✗"}`);

  if (!okUser || !okSuper || !okCabinet) {
    console.error("\n✗ Verification incomplete — inspect the rows above before letting the admin log in.");
    await closeDb();
    process.exit(1);
  }

  console.log("\n✓ Done. The org exists and the admin has full management-OS access.");
  console.log("\nNext steps:");
  console.log(`  • Sign in at https://management.arconique.com with ${adminEmail} (the Supabase password you set).`);
  console.log("  • The dashboard will be EMPTY — create villa complexes / villas / owners / employees yourself.");
  console.log("  • Forgot the password? Use the login page's reset, or set a new one in Supabase → Users.");
  await closeDb();
}

main().catch(async (e) => {
  console.error(e);
  await closeDb().catch(() => {});
  process.exit(1);
});
