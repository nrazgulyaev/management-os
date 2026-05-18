#!/usr/bin/env tsx
/**
 * TEST-ACCOUNTS-1 — Seed three role-scoped test accounts for the
 * operator's real team to sign in and exercise the platform as each
 * cabinet role. Idempotent. NEVER FOR PRODUCTION USE.
 *
 * Accounts (all scoped to Arconique org):
 *   ┌──────────┬──────────────────────────────┬──────────────────────┐
 *   │ Display  │ Email                        │ Cabinet role         │
 *   ├──────────┼──────────────────────────────┼──────────────────────┤
 *   │ Ali      │ ali-test@arconique.local     │ cfo_accountant       │
 *   │ Sutanti  │ sutanti-test@arconique.local │ qs_analyst           │
 *   │ NG       │ ng-test@arconique.local      │ site_supervisor      │
 *   └──────────┴──────────────────────────────┴──────────────────────┘
 *
 * Sprint spec said "bookkeeper" / "cost_analyst" — the actual cabinet
 * role keys (per migration 0066 + src/lib/development/server/roles/role-helpers.ts)
 * are `cfo_accountant` / `qs_analyst` / `site_supervisor`. Mapped accordingly.
 *
 * Two role systems exist in this codebase — distinct, both relevant:
 *   1. user_roles (generic, with role_id FK to roles table)
 *      Used by super_admin via assign_user_role() SECURITY DEFINER helper.
 *   2. app_user_roles (cabinet-specific, role_key TEXT enum)
 *      Used by the role-cabinet routing system. Insert directly.
 *
 * For test cabinet accounts, we insert into app_user_roles directly,
 * mirroring src/features/team/actions.ts:700 (the in-app grant flow).
 *
 * Usage:
 *   npm run seed:test-team-accounts
 *   npm run seed:test-team-accounts -- --wipe   # delete & recreate
 *
 * Idempotent:
 *   · Supabase auth user: upsert by email
 *   · app_users row: insert or look up by auth_user_id
 *   · app_user_roles grant: skip if active primary row exists for role
 */

import { createClient } from "@supabase/supabase-js";
import { sql } from "drizzle-orm";
import { getDb, closeDb } from "./lib/db-script";

const ARCONIQUE_ORG_ID = "08e669f9-4298-4cd7-8cf6-c0ac7b092e14";

interface TeamAccount {
  displayName: string;
  email: string;
  password: string;
  roleKey: "cfo_accountant" | "qs_analyst" | "site_supervisor";
  /** Operator-facing label for the docs printout */
  label: string;
}

const ACCOUNTS: TeamAccount[] = [
  {
    displayName: "Ali (test bookkeeper)",
    email: "ali-test@arconique.local",
    password: "ArcAli-2026-bookkeeper",
    roleKey: "cfo_accountant",
    label: "bookkeeper",
  },
  {
    displayName: "Sutanti (test QS / cost analyst)",
    email: "sutanti-test@arconique.local",
    password: "ArcSutanti-2026-qscost",
    roleKey: "qs_analyst",
    label: "cost_analyst",
  },
  {
    displayName: "NG (test site supervisor)",
    email: "ng-test@arconique.local",
    password: "ArcNG-2026-sitemanager",
    roleKey: "site_supervisor",
    label: "site_supervisor",
  },
];

interface Args {
  wipe: boolean;
  orgId: string;
}

function parseArgs(argv: string[]): Args {
  const a = argv.slice(2);
  const orgArg = a.find((x) => x.startsWith("--org="));
  return {
    wipe: a.includes("--wipe"),
    orgId: orgArg ? orgArg.split("=", 2)[1] : ARCONIQUE_ORG_ID,
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
  const args = parseArgs(process.argv);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error(
      "NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY must be set in .env.local",
    );
    process.exit(1);
  }
  const sb = createClient(url, serviceKey, { auth: { persistSession: false } });
  const db = getDb();

  console.log("==========================================");
  console.log(" TEST-ACCOUNTS-1 — seed 3 test accounts");
  console.log(" Org:", args.orgId);
  console.log(" Mode:", args.wipe ? "WIPE + RECREATE" : "IDEMPOTENT");
  console.log("==========================================\n");

  if (args.wipe) {
    console.log("Wiping existing test accounts...\n");
    for (const acct of ACCOUNTS) {
      const appUserRows = asRows<{ id: string; auth_user_id: string | null }>(
        await db.execute(sql`
          SELECT id::text AS id, auth_user_id::text AS auth_user_id
            FROM app_users
           WHERE lower(email) = lower(${acct.email})
        `),
      );
      for (const u of appUserRows) {
        // Revoke role grants
        await db.execute(sql`
          UPDATE app_user_roles
             SET is_active = false, revoked_at = now()
           WHERE user_id = ${u.id}::uuid AND is_active = true
        `);
        // Delete app_users row
        await db.execute(sql`DELETE FROM app_users WHERE id = ${u.id}::uuid`);
        // Delete auth user (best effort)
        if (u.auth_user_id) {
          await sb.auth.admin.deleteUser(u.auth_user_id).catch(() => null);
        }
      }
      console.log(`  · ${acct.email}: wiped`);
    }
    console.log("");
  }

  const summary: Array<{ email: string; role: string; status: string; appUserId: string }> = [];

  for (const acct of ACCOUNTS) {
    console.log(`Processing ${acct.displayName}...`);

    // -----------------------------------------------------------------
    // 1) Supabase auth.users — create or look up
    // -----------------------------------------------------------------
    let authUserId: string | null = null;
    const { data: listed, error: listErr } = await sb.auth.admin.listUsers({
      perPage: 1000,
      page: 1,
    });
    if (listErr) {
      console.error(`  ✗ ${acct.email}: auth listUsers failed — ${listErr.message}`);
      continue;
    }
    const existingAuth = listed?.users?.find(
      (u) => u.email?.toLowerCase() === acct.email.toLowerCase(),
    );
    if (existingAuth) {
      authUserId = existingAuth.id;
      console.log(`  ✓ auth.users: exists (id=${authUserId})`);
    } else {
      const { data: created, error: createErr } = await sb.auth.admin.createUser({
        email: acct.email,
        password: acct.password,
        email_confirm: true,
        user_metadata: {
          display_name: acct.displayName,
          test_role: acct.label,
        },
      });
      if (createErr || !created.user) {
        console.error(`  ✗ ${acct.email}: createUser failed — ${createErr?.message}`);
        continue;
      }
      authUserId = created.user.id;
      console.log(`  ✓ auth.users: created (id=${authUserId})`);
    }

    if (!authUserId) continue;

    // -----------------------------------------------------------------
    // 2) app_users — create or look up by auth_user_id
    // -----------------------------------------------------------------
    let appUserId: string | null = null;
    const existingApp = asRows<{ id: string }>(
      await db.execute(sql`
        SELECT id::text AS id FROM app_users
         WHERE auth_user_id = ${authUserId}::uuid LIMIT 1
      `),
    );
    if (existingApp[0]) {
      appUserId = existingApp[0].id;
      console.log(`  ✓ app_users: exists (id=${appUserId})`);
    } else {
      // Defensive: handle the case where an app_users row already exists
      // for this email but with a different/null auth_user_id (e.g. a
      // pre-created stub). Link instead of inserting a duplicate.
      const existingByEmail = asRows<{ id: string }>(
        await db.execute(sql`
          SELECT id::text AS id FROM app_users
           WHERE lower(email) = lower(${acct.email}) LIMIT 1
        `),
      );
      if (existingByEmail[0]) {
        await db.execute(sql`
          UPDATE app_users
             SET auth_user_id = ${authUserId}::uuid,
                 organization_id = ${args.orgId}::uuid,
                 status = 'active',
                 updated_at = now()
           WHERE id = ${existingByEmail[0].id}::uuid
        `);
        appUserId = existingByEmail[0].id;
        console.log(`  ✓ app_users: linked stub (id=${appUserId})`);
      } else {
        const inserted = asRows<{ id: string }>(
          await db.execute(sql`
            INSERT INTO app_users (
              auth_user_id, email, full_name, status,
              organization_id, timezone
            ) VALUES (
              ${authUserId}::uuid, ${acct.email}, ${acct.displayName},
              'active', ${args.orgId}::uuid, 'Asia/Makassar'
            )
            RETURNING id::text
          `),
        );
        appUserId = inserted[0]?.id ?? null;
        console.log(`  ✓ app_users: created (id=${appUserId})`);
      }
    }

    if (!appUserId) {
      console.error(`  ✗ ${acct.email}: app_users insert failed`);
      continue;
    }

    // -----------------------------------------------------------------
    // 3) app_user_roles cabinet grant (company_wide, primary)
    //    Mirrors src/features/team/actions.ts:700 — direct INSERT.
    //    NOT user_roles (that's the generic permission system).
    // -----------------------------------------------------------------
    const existingGrant = asRows<{ id: string }>(
      await db.execute(sql`
        SELECT id::text AS id FROM app_user_roles
         WHERE user_id = ${appUserId}::uuid
           AND role_key = ${acct.roleKey}
           AND is_active = true
         LIMIT 1
      `),
    );
    if (existingGrant[0]) {
      console.log(`  ✓ app_user_roles: ${acct.roleKey} already granted (id=${existingGrant[0].id})`);
    } else {
      // Demote any existing primary on this user before inserting a new
      // primary — keeps the partial unique index app_user_roles_primary_unique
      // happy.
      await db.execute(sql`
        UPDATE app_user_roles
           SET is_primary = false, updated_at = now()
         WHERE user_id = ${appUserId}::uuid
           AND is_primary = true
           AND is_active = true
      `);

      const grantInserted = asRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO app_user_roles (
            user_id, role_key, scope, scoped_project_id,
            is_primary, is_active, notes
          ) VALUES (
            ${appUserId}::uuid, ${acct.roleKey}, 'company_wide', NULL,
            true, true, 'TEST-ACCOUNTS-1 seed'
          )
          RETURNING id::text
        `),
      );
      console.log(`  ✓ app_user_roles: granted ${acct.roleKey} primary (id=${grantInserted[0]?.id})`);
    }

    summary.push({
      email: acct.email,
      role: acct.roleKey,
      status: "✓",
      appUserId,
    });
    console.log("");
  }

  // -----------------------------------------------------------------
  // Credentials printout
  // -----------------------------------------------------------------
  console.log("==========================================");
  console.log(" Credentials (operator-internal — do not share)");
  console.log("==========================================");
  for (const acct of ACCOUNTS) {
    const row = summary.find((s) => s.email === acct.email);
    console.log(`
  ${row?.status ?? "✗"} ${acct.displayName}
    email:    ${acct.email}
    password: ${acct.password}
    role:     ${acct.roleKey} (${acct.label})
    app_user: ${row?.appUserId ?? "—"}
    sign-in:  https://management.arconique.com/login (or development.* for cabinets)`);
  }
  console.log("\n==========================================");
  console.log(" Recommended verification:");
  console.log(`   EMAIL=ali-test@arconique.local npm run diagnose:session`);
  console.log(`   EMAIL=sutanti-test@arconique.local npm run diagnose:session`);
  console.log(`   EMAIL=ng-test@arconique.local npm run diagnose:session`);
  console.log("==========================================\n");

  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
