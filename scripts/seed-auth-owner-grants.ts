#!/usr/bin/env tsx
/**
 * AUTH-OWNER-1 — Seed Supabase Auth users + app_users + grants
 * for every DEMO-2 owner so they can sign in directly (no
 * impersonation required).
 *
 * NEVER FOR PRODUCTION USE — generates demo passwords.
 *
 *   npm run seed:auth-owner-grants
 *   npm run seed:auth-owner-grants -- --wipe   # remove demo grants only
 *
 * Idempotent:
 *  - Auth user: upsert by email (Supabase admin API)
 *  - app_users row: insert or look up by auth_user_id
 *  - app_users_owners grant: skip if active row exists
 *
 * Prints a credential table at the end so operator can sign in.
 */

import { createClient } from "@supabase/supabase-js";
import { sql } from "drizzle-orm";
import { getDb, closeDb } from "./lib/db-script";

const ARCONIQUE_ORG_ID = "08e669f9-4298-4cd7-8cf6-c0ac7b092e14";
const DEMO_PASSWORD_PREFIX = "ArcOwner-2026-";

interface Args { wipe: boolean; orgId: string; }
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

function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY must be set");
    process.exit(1);
  }
  const sb = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const db = getDb();

  try {
    if (args.wipe) {
      console.log("revoking active demo owner grants (notes LIKE '[AUTH-OWNER-1]%') …");
      const r = await db.execute(sql`
        UPDATE app_users_owners
           SET status = 'revoked', revoked_at = NOW()
         WHERE notes LIKE '[AUTH-OWNER-1]%' AND status = 'active'
      `);
      console.log("  revoked:", (r as unknown as { count?: number }).count ?? "?");
      return;
    }

    const owners = asRows<{ id: string; name: string; email: string | null }>(await db.execute(sql`
      SELECT o.id::text AS id, o.display_name AS name, o.email AS email
        FROM owners o
        JOIN ownership_shares os ON os.owner_id = o.id
        JOIN villas v ON v.id = os.villa_id
        JOIN projects p ON p.id = v.project_id
       WHERE os.status = 'active'
         AND p.slug LIKE 'demo-%'
       GROUP BY o.id, o.display_name, o.email
       ORDER BY o.display_name
    `));
    if (owners.length === 0) {
      console.error("no owners with active ownership shares on DEMO projects");
      return;
    }
    console.log(`target org: ${args.orgId}`);
    console.log(`${owners.length} owners to grant\n`);

    const creds: Array<{ name: string; email: string; password: string }> = [];

    for (const owner of owners) {
      const email = owner.email && owner.email.includes("@")
        ? owner.email
        : `${slugifyName(owner.name)}@arconique-demo.com`;
      const password = `${DEMO_PASSWORD_PREFIX}${slugifyName(owner.name).slice(0, 8)}`;

      // 1) auth user — create or look up
      let authUserId: string | null = null;
      const { data: listed } = await sb.auth.admin.listUsers({ perPage: 200, page: 1 });
      const existingAuth = listed?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
      if (existingAuth) {
        authUserId = existingAuth.id;
      } else {
        const { data: created, error: createErr } = await sb.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { display_name: owner.name, demo_role: "owner" },
        });
        if (createErr || !created.user) {
          console.warn(`  ✗ ${owner.name}: auth create failed — ${createErr?.message}`);
          continue;
        }
        authUserId = created.user.id;
      }

      // 2) app_users row — create or look up
      let appUserId: string | null = null;
      const existingApp = asRows<{ id: string }>(await db.execute(sql`
        SELECT id::text AS id FROM app_users WHERE auth_user_id = ${authUserId}::uuid LIMIT 1
      `));
      if (existingApp[0]) {
        appUserId = existingApp[0].id;
      } else {
        const inserted = asRows<{ id: string }>(await db.execute(sql`
          INSERT INTO app_users (auth_user_id, email, full_name, status, organization_id, timezone)
          VALUES (${authUserId}::uuid, ${email}, ${owner.name}, 'active',
                  ${args.orgId}::uuid, 'Asia/Makassar')
          RETURNING id::text
        `));
        appUserId = inserted[0]?.id ?? null;
      }
      if (!appUserId) {
        console.warn(`  ✗ ${owner.name}: app_users insert failed`);
        continue;
      }

      // 3) grant row — skip if active grant exists
      const existingGrant = asRows<{ id: string }>(await db.execute(sql`
        SELECT id::text AS id FROM app_users_owners
         WHERE app_user_id = ${appUserId}::uuid AND owner_id = ${owner.id}::uuid
           AND grant_type = 'owner_portal' AND status = 'active'
         LIMIT 1
      `));
      if (!existingGrant[0]) {
        await db.execute(sql`
          INSERT INTO app_users_owners
            (app_user_id, owner_id, grant_type, status, notes)
          VALUES
            (${appUserId}::uuid, ${owner.id}::uuid, 'owner_portal', 'active',
             '[AUTH-OWNER-1] demo grant seeded')
        `);
      }

      creds.push({ name: owner.name, email, password });
      console.log(`  ✓ ${owner.name} → ${email}`);
    }

    if (creds.length > 0) {
      console.log("\n----- DEMO CREDENTIALS (operator only — do NOT share) -----");
      for (const c of creds) {
        console.log(`  ${c.name.padEnd(28)} ${c.email.padEnd(48)} ${c.password}`);
      }
      console.log("------------------------------------------------------------\n");
    }
  } finally {
    await closeDb();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
