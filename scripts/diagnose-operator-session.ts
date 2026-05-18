#!/usr/bin/env tsx
/**
 * SESSION-RESOLUTION-1 P1 — Diagnose operator's identity-resolution chain.
 * READ-ONLY. Safe to run against production.
 *
 * Walks the Supabase Auth → app_users → organizations chain for a given
 * operator account and reports exactly where (if anywhere) the chain
 * breaks. Produces a verdict + remediation recipe.
 *
 * The chain `getCurrentAppUser()` walks at request time is:
 *
 *   1. Supabase auth.users (cookie session) → auth user with `id`
 *   2. app_users WHERE auth_user_id = auth.id              → app_user
 *   3. organizations WHERE id = app_user.organization_id   → org
 *
 * If any of these fail, `getCurrentAppUser()` returns null and every
 * downstream server action that calls `requireOrgId()` or references
 * `me.id` crashes. That's the through-line root cause documented in
 * docs/audits/functional-audit-2026-05-18.md.
 *
 * Usage:
 *
 *   EMAIL=nrazgulyaev@gmail.com npm run diagnose:session
 *   EMAIL=nrazgulyaev@gmail.com AUTH_USER_ID=<uuid> npm run diagnose:session
 *   ORG_CODE=ARCONIQUE_DEFAULT EMAIL=... npm run diagnose:session
 *
 * Outputs structured findings and exits with code 0 on PASS, 1 on FAIL.
 */

import { sql } from "drizzle-orm";
import { getDb, closeDb } from "./lib/db-script";

const ARCONIQUE_DEFAULT_ORG_CODE = "ARCONIQUE_DEFAULT";

interface Args {
  email: string | null;
  authUserId: string | null;
  expectedOrgCode: string;
}

function parseArgs(): Args {
  return {
    email: process.env.EMAIL ?? null,
    authUserId: process.env.AUTH_USER_ID ?? null,
    expectedOrgCode: process.env.ORG_CODE ?? ARCONIQUE_DEFAULT_ORG_CODE,
  };
}

function asRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    return ((result as { rows: T[] }).rows) ?? [];
  }
  return [];
}

interface Finding {
  level: "info" | "ok" | "warn" | "fail";
  message: string;
}

function emit(f: Finding): void {
  const icon = { info: "·", ok: "✓", warn: "⚠", fail: "✗" }[f.level];
  console.log(`  ${icon} ${f.message}`);
}

async function main(): Promise<void> {
  const args = parseArgs();
  console.log("=================================================");
  console.log(" SESSION-RESOLUTION-1 — Identity diagnostic");
  console.log("=================================================\n");

  if (!args.email && !args.authUserId) {
    console.error("Usage: EMAIL=<email> [AUTH_USER_ID=<uuid>] npm run diagnose:session");
    console.error("       At least one of EMAIL or AUTH_USER_ID is required.");
    process.exit(2);
  }

  const db = getDb();
  const findings: Finding[] = [];
  let pass = true;

  // -----------------------------------------------------------------
  // STEP 1 — Supabase auth.users
  // -----------------------------------------------------------------
  console.log("STEP 1 — Supabase auth.users\n");

  let resolvedAuthUserId: string | null = args.authUserId;

  if (args.email) {
    const authRows = asRows<{ id: string; email: string; created_at: string }>(
      await db.execute(sql`
        SELECT id::text AS id, email, created_at::text AS created_at
          FROM auth.users
         WHERE lower(email) = lower(${args.email})
         LIMIT 2
      `),
    );
    if (authRows.length === 0) {
      emit({
        level: "fail",
        message: `No auth.users row found for email ${args.email}`,
      });
      pass = false;
    } else if (authRows.length > 1) {
      emit({
        level: "warn",
        message: `Multiple auth.users rows for ${args.email} — using first`,
      });
      resolvedAuthUserId = authRows[0].id;
      emit({ level: "info", message: `auth.users.id = ${resolvedAuthUserId}` });
    } else {
      resolvedAuthUserId = authRows[0].id;
      emit({
        level: "ok",
        message: `auth.users row found: id=${resolvedAuthUserId} created=${authRows[0].created_at.slice(0, 19)}`,
      });
    }
  }

  if (args.authUserId && !args.email) {
    const authRows = asRows<{ id: string; email: string }>(
      await db.execute(sql`
        SELECT id::text AS id, email FROM auth.users WHERE id = ${args.authUserId}::uuid LIMIT 1
      `),
    );
    if (authRows.length === 0) {
      emit({
        level: "fail",
        message: `No auth.users row for id ${args.authUserId}`,
      });
      pass = false;
    } else {
      emit({
        level: "ok",
        message: `auth.users row found: email=${authRows[0].email}`,
      });
    }
  }

  if (!resolvedAuthUserId) {
    findings.push({
      level: "fail",
      message: "Cannot proceed without a Supabase auth user id.",
    });
    console.log("\nVERDICT: FAIL — no auth.users row exists for this account.");
    console.log("REMEDIATION: User has not signed up via Supabase Auth, or the");
    console.log("             email/id provided doesn't match any auth user.");
    console.log("             Sign in via /login at least once to create the");
    console.log("             auth.users row.\n");
    await closeDb();
    process.exit(1);
  }

  // -----------------------------------------------------------------
  // STEP 2 — app_users WHERE auth_user_id = ...
  // -----------------------------------------------------------------
  console.log("\nSTEP 2 — app_users WHERE auth_user_id = " + resolvedAuthUserId + "\n");

  const appUserRows = asRows<{
    id: string;
    email: string;
    full_name: string;
    organization_id: string;
    status: string;
    investor_id: string | null;
  }>(
    await db.execute(sql`
      SELECT id::text                AS id,
             email                   AS email,
             full_name               AS full_name,
             organization_id::text   AS organization_id,
             status                  AS status,
             investor_id::text       AS investor_id
        FROM app_users
       WHERE auth_user_id = ${resolvedAuthUserId}::uuid
       LIMIT 2
    `),
  );

  if (appUserRows.length === 0) {
    emit({
      level: "fail",
      message: "No app_users row linked to this auth user — THIS IS THE BUG.",
    });
    pass = false;

    if (args.email) {
      const byEmailRows = asRows<{
        id: string;
        auth_user_id: string | null;
        full_name: string;
        organization_id: string;
      }>(
        await db.execute(sql`
          SELECT id::text                AS id,
                 auth_user_id::text       AS auth_user_id,
                 full_name                AS full_name,
                 organization_id::text    AS organization_id
            FROM app_users
           WHERE lower(email) = lower(${args.email})
           LIMIT 5
        `),
      );
      if (byEmailRows.length > 0) {
        emit({
          level: "warn",
          message: `BUT an app_users row exists for email ${args.email} with NO auth_user_id link (or a different one):`,
        });
        for (const r of byEmailRows) {
          emit({
            level: "info",
            message: `  · app_users.id=${r.id} auth_user_id=${r.auth_user_id ?? "NULL"} org=${r.organization_id}`,
          });
        }
        emit({
          level: "info",
          message: "  → REMEDIATION: link the existing app_users row by setting auth_user_id.",
        });
        emit({
          level: "info",
          message: `     UPDATE app_users SET auth_user_id = '${resolvedAuthUserId}' WHERE email = '${args.email}';`,
        });
      } else {
        emit({
          level: "info",
          message: `  → REMEDIATION: run \`npm run admin:bootstrap\` with AUTH_USER_ID=${resolvedAuthUserId} EMAIL=${args.email} to create the app_users row + super_admin role assignment.`,
        });
      }
    }

    console.log("\nVERDICT: FAIL — getCurrentAppUser() returns null for this account.");
    console.log("REMEDIATION: see above — link the app_users row to the auth user.\n");
    await closeDb();
    process.exit(1);
  }

  if (appUserRows.length > 1) {
    emit({
      level: "fail",
      message: "MULTIPLE app_users rows for the same auth user — should be unique.",
    });
    pass = false;
  }

  const appUser = appUserRows[0];
  emit({
    level: "ok",
    message: `app_users row found: id=${appUser.id} email=${appUser.email}`,
  });
  emit({
    level: appUser.status === "active" ? "ok" : "warn",
    message: `  status: ${appUser.status}${appUser.status === "active" ? "" : " (must be 'active' for normal login)"}`,
  });
  if (appUser.investor_id) {
    emit({
      level: "warn",
      message: `  investor_id is set (${appUser.investor_id}) — operator should NOT have an investor_id`,
    });
  }

  // -----------------------------------------------------------------
  // STEP 3 — organizations WHERE id = app_user.organization_id
  // -----------------------------------------------------------------
  console.log("\nSTEP 3 — organizations check\n");

  const orgRows = asRows<{
    id: string;
    code: string;
    name: string;
  }>(
    await db.execute(sql`
      SELECT id::text                   AS id,
             organization_code          AS code,
             display_name               AS name
        FROM organizations
       WHERE id = ${appUser.organization_id}::uuid
       LIMIT 1
    `),
  );

  if (orgRows.length === 0) {
    emit({
      level: "fail",
      message: `app_users.organization_id ${appUser.organization_id} points to a non-existent organization`,
    });
    pass = false;
  } else {
    const org = orgRows[0];
    emit({
      level: "ok",
      message: `organization: ${org.code} (${org.name}) id=${org.id}`,
    });

    const expectedRows = asRows<{ id: string; code: string }>(
      await db.execute(sql`
        SELECT id::text AS id, organization_code AS code
          FROM organizations
         WHERE organization_code = ${args.expectedOrgCode}
         LIMIT 1
      `),
    );
    if (expectedRows.length === 0) {
      emit({
        level: "warn",
        message: `expected org with code '${args.expectedOrgCode}' does NOT exist in this DB`,
      });
    } else if (expectedRows[0].id !== org.id) {
      emit({
        level: "fail",
        message: `operator org_id ${org.id} (${org.code}) does NOT match expected ${expectedRows[0].id} (${expectedRows[0].code})`,
      });
      emit({
        level: "info",
        message: `  → REMEDIATION: UPDATE app_users SET organization_id = '${expectedRows[0].id}' WHERE id = '${appUser.id}';`,
      });
      pass = false;
    } else {
      emit({
        level: "ok",
        message: `org matches expected '${args.expectedOrgCode}' ✓`,
      });
    }
  }

  // -----------------------------------------------------------------
  // STEP 4 — role assignments (any role at all?)
  // -----------------------------------------------------------------
  console.log("\nSTEP 4 — role assignments\n");

  // SCHEMA NOTE: user_roles uses `scope_type` (not `scope_kind`) per
  // src/lib/db/schema/identity.ts:98 and migration 0004. The earlier
  // version of this script used `scope_kind` and crashed at this step.
  const roleRows = asRows<{
    role_key: string;
    scope_type: string | null;
    scope_id: string | null;
  }>(
    await db.execute(sql`
      SELECT r.key                AS role_key,
             ur.scope_type         AS scope_type,
             ur.scope_id::text     AS scope_id
        FROM user_roles ur
        JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = ${appUser.id}::uuid
       ORDER BY r.key
    `),
  );

  if (roleRows.length === 0) {
    emit({
      level: "fail",
      message: "No role assignments — operator has NO granted permissions.",
    });
    emit({
      level: "info",
      message: "  → THIS is why Sync feeds / Add vendor / Submit report etc. return Permission denied.",
    });
    emit({
      level: "info",
      message: "  → REMEDIATION: run `npm run grant:super-admin` (or the legacy `npm run admin:bootstrap`) to grant super_admin globally.",
    });
    pass = false;
  } else {
    for (const r of roleRows) {
      emit({
        level: "ok",
        message: `role: ${r.role_key}${r.scope_type ? ` (scope: ${r.scope_type}${r.scope_id ? `=${r.scope_id}` : ""})` : " (global)"}`,
      });
    }
    const hasSuperAdmin = roleRows.some((r) => r.role_key === "super_admin");
    if (!hasSuperAdmin) {
      emit({
        level: "warn",
        message: "  → No super_admin role; some platform features will be hidden.",
      });
    } else {
      emit({
        level: "ok",
        message: "  → super_admin role present.",
      });
    }
  }

  // -----------------------------------------------------------------
  // STEP 5 — DEMO seed org_id sanity check
  // -----------------------------------------------------------------
  console.log("\nSTEP 5 — DEMO seed visibility\n");

  if (orgRows[0]) {
    const orgId = orgRows[0].id;
    const projectRows = asRows<{ n: string }>(
      await db.execute(sql`
        SELECT COUNT(*)::text AS n FROM projects WHERE organization_id IS NULL OR organization_id = ${orgId}::uuid
      `),
    );
    const devTxRows = asRows<{ n: string }>(
      await db.execute(sql`SELECT COUNT(*)::text AS n FROM dev_transactions WHERE organization_id = ${orgId}::uuid`),
    );
    const vendorRows = asRows<{ n: string }>(
      await db.execute(sql`SELECT COUNT(*)::text AS n FROM vendors WHERE organization_id = ${orgId}::uuid`),
    );

    emit({
      level: "info",
      message: `projects visible to operator's org: ${projectRows[0]?.n ?? "?"}`,
    });
    emit({
      level: "info",
      message: `dev_transactions in operator's org: ${devTxRows[0]?.n ?? "?"}`,
    });
    emit({
      level: "info",
      message: `vendors in operator's org: ${vendorRows[0]?.n ?? "?"}`,
    });

    if (Number(devTxRows[0]?.n ?? "0") === 0 && Number(vendorRows[0]?.n ?? "0") === 0) {
      emit({
        level: "warn",
        message: "operator's org has no Dev OS seed data — overview KPIs will all be zero.",
      });
      emit({
        level: "info",
        message: "  → REMEDIATION: re-run DEMO seeds with operator's org_id, OR move operator to the seeded org.",
      });
    }
  }

  // -----------------------------------------------------------------
  // VERDICT
  // -----------------------------------------------------------------
  console.log("\n=================================================");
  if (pass) {
    console.log(" VERDICT: PASS — identity chain resolves correctly.");
    console.log(" If features still fail, the cause is NOT identity");
    console.log(" resolution. Suspect permissions, RLS, or per-action bugs.");
  } else {
    console.log(" VERDICT: FAIL — see remediation hints above.");
  }
  console.log("=================================================\n");

  await closeDb();
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
