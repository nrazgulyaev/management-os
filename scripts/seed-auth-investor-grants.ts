#!/usr/bin/env tsx
/**
 * AUTH-INVESTOR-1 — Seed Supabase Auth users + app_users + grants
 * for every DEMO-2 investor so they can sign in directly.
 *
 * NEVER FOR PRODUCTION USE — generates demo passwords.
 *
 *   npm run seed:auth-investor-grants
 *   npm run seed:auth-investor-grants -- --wipe
 *
 * Mirrors seed-auth-owner-grants.ts pattern.
 */

import { createClient } from "@supabase/supabase-js";
import { sql } from "drizzle-orm";
import { getDb, closeDb } from "./lib/db-script";

const ARCONIQUE_ORG_ID = "08e669f9-4298-4cd7-8cf6-c0ac7b092e14";
const DEMO_PASSWORD_PREFIX = "ArcInv-2026-";

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
      console.log("revoking active demo investor grants…");
      const r = await db.execute(sql`
        UPDATE app_users_investors
           SET status = 'revoked', revoked_at = NOW()
         WHERE notes LIKE '[AUTH-INVESTOR-1]%' AND status = 'active'
      `);
      console.log("  revoked:", (r as unknown as { count?: number }).count ?? "?");
      return;
    }

    const list = asRows<{ id: string; code: string; name: string; email: string | null }>(await db.execute(sql`
      SELECT id::text AS id, investor_code AS code, legal_name AS name, contact_email AS email
        FROM investors
       WHERE organization_id = ${args.orgId}::uuid
         AND status = 'active'
       ORDER BY investor_code
    `));
    if (list.length === 0) {
      console.error("no investors found — run seed:arconique-demo-2 first");
      return;
    }
    console.log(`target org: ${args.orgId}`);
    console.log(`${list.length} investors to grant\n`);

    const creds: Array<{ name: string; email: string; password: string }> = [];

    for (const inv of list) {
      const cleanName = inv.name.replace(/^\[DEMO2\]\s*/, "");
      const email = inv.email && inv.email.includes("@")
        ? inv.email
        : `${slugifyName(cleanName)}@arconique-investors.com`;
      const password = `${DEMO_PASSWORD_PREFIX}${slugifyName(cleanName).slice(0, 8)}`;

      // 1) auth user
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
          user_metadata: { display_name: cleanName, demo_role: "investor" },
        });
        if (createErr || !created.user) {
          console.warn(`  ✗ ${cleanName}: auth create failed — ${createErr?.message}`);
          continue;
        }
        authUserId = created.user.id;
      }

      // 2) app_users row
      let appUserId: string | null = null;
      const existingApp = asRows<{ id: string }>(await db.execute(sql`
        SELECT id::text AS id FROM app_users WHERE auth_user_id = ${authUserId}::uuid LIMIT 1
      `));
      if (existingApp[0]) {
        appUserId = existingApp[0].id;
      } else {
        const inserted = asRows<{ id: string }>(await db.execute(sql`
          INSERT INTO app_users (auth_user_id, email, full_name, status, organization_id, timezone)
          VALUES (${authUserId}::uuid, ${email}, ${cleanName}, 'active',
                  ${args.orgId}::uuid, 'Asia/Makassar')
          RETURNING id::text
        `));
        appUserId = inserted[0]?.id ?? null;
      }
      if (!appUserId) {
        console.warn(`  ✗ ${cleanName}: app_users insert failed`);
        continue;
      }

      // 3) grant
      const existingGrant = asRows<{ id: string }>(await db.execute(sql`
        SELECT id::text AS id FROM app_users_investors
         WHERE app_user_id = ${appUserId}::uuid AND investor_id = ${inv.id}::uuid
           AND grant_type = 'investor_portal' AND status = 'active'
         LIMIT 1
      `));
      if (!existingGrant[0]) {
        await db.execute(sql`
          INSERT INTO app_users_investors
            (app_user_id, investor_id, grant_type, status, notes)
          VALUES
            (${appUserId}::uuid, ${inv.id}::uuid, 'investor_portal', 'active',
             '[AUTH-INVESTOR-1] demo grant seeded')
        `);
      }

      creds.push({ name: cleanName, email, password });
      console.log(`  ✓ ${cleanName} → ${email}`);
    }

    if (creds.length > 0) {
      console.log("\n----- DEMO CREDENTIALS (operator only — do NOT share) -----");
      for (const c of creds) {
        console.log(`  ${c.name.padEnd(32)} ${c.email.padEnd(50)} ${c.password}`);
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
