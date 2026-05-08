/**
 * Stage 8.F.5 — provisioning invariants.
 *
 * These tests connect to the live database and assert that the
 * provisioning chain (auth.users → app_users → user_roles +
 * app_user_roles → organizations) stays in sync. They are SKIPPED
 * automatically when no `DATABASE_URL` is configured (e.g., the
 * default static-only CI lane).
 *
 * Run them against staging or production manually:
 *
 *   node --env-file=.env.production.local --import tsx \
 *     --test tests/invariants/provisioning.test.ts
 *
 * If any assertion fails, a future run of the 0087 backfill (or
 * /api/onboarding/start) silently regressed the chain.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { sql } from "drizzle-orm";

const DB_AVAILABLE = Boolean(process.env.DATABASE_URL);

interface RowList<T> {
  rows?: T[];
}

// Defer the db client import to inside async helpers so the test file
// can be imported (and its tests' skip flags evaluated) without the
// `server-only` chain throwing on a no-DB lane.
async function rawSelect<T = Record<string, unknown>>(
  query: ReturnType<typeof sql>,
): Promise<T[]> {
  const { getDb } = (await import("@/lib/db/client")) as {
    getDb: () => { execute: (q: ReturnType<typeof sql>) => Promise<unknown> } | null;
  };
  const db = getDb();
  if (!db) return [];
  const r = await db.execute(query);
  if (Array.isArray(r)) return r as T[];
  return ((r as RowList<T>).rows ?? []) as T[];
}

test(
  "every auth.users entry has a matching app_users row",
  { skip: !DB_AVAILABLE },
  async () => {
    const orphaned = await rawSelect<{ id: string; email: string }>(
      sql`SELECT au.id, au.email
            FROM auth.users au
            LEFT JOIN public.app_users u ON u.auth_user_id = au.id
           WHERE u.id IS NULL`,
    );
    assert.deepStrictEqual(
      orphaned,
      [],
      `${orphaned.length} auth.users rows have no matching app_users:\n` +
        orphaned.map((r) => `  - ${r.email} (${r.id})`).join("\n"),
    );
  },
);

test(
  "every app_users row has at least one active grant in user_roles or app_user_roles",
  { skip: !DB_AVAILABLE },
  async () => {
    const ungranted = await rawSelect<{ id: string; email: string }>(
      sql`SELECT u.id, u.email
            FROM public.app_users u
           WHERE u.status = 'active'
             AND NOT EXISTS (
               SELECT 1 FROM public.user_roles ur
                WHERE ur.user_id = u.id
             )
             AND NOT EXISTS (
               SELECT 1 FROM public.app_user_roles aur
                WHERE aur.user_id = u.id
                  AND aur.is_active = true
             )`,
    );
    assert.deepStrictEqual(
      ungranted,
      [],
      `${ungranted.length} active app_users have no role grant in either RBAC table:\n` +
        ungranted.map((r) => `  - ${r.email} (${r.id})`).join("\n"),
    );
  },
);

test(
  "every active app_user_roles row uses a role_key permitted by the CHECK constraint",
  { skip: !DB_AVAILABLE },
  async () => {
    // The CHECK is enforced at INSERT time, so this is a defensive guard
    // against drift if someone disables the constraint manually. The
    // canonical list is in migration 0066.
    const invalid = await rawSelect<{ id: string; role_key: string }>(
      sql`SELECT id, role_key
            FROM public.app_user_roles
           WHERE is_active = true
             AND role_key NOT IN (
               'marketing_staff', 'qs_analyst', 'procurement_manager',
               'warehouse_manager', 'site_supervisor', 'sales_manager',
               'project_manager', 'cfo_accountant', 'executive_ceo', 'admin'
             )`,
    );
    assert.deepStrictEqual(
      invalid,
      [],
      `${invalid.length} active app_user_roles rows have invalid role_key values`,
    );
  },
);

test(
  "every active app_user_roles row references an existing app_users row",
  { skip: !DB_AVAILABLE },
  async () => {
    const orphans = await rawSelect<{ id: string }>(
      sql`SELECT aur.id
            FROM public.app_user_roles aur
            LEFT JOIN public.app_users u ON u.id = aur.user_id
           WHERE aur.is_active = true
             AND u.id IS NULL`,
    );
    assert.deepStrictEqual(
      orphans,
      [],
      `${orphans.length} active grants reference a non-existent app_users id`,
    );
  },
);

test(
  "user_roles rows resolve to canonical role keys in the roles table",
  { skip: !DB_AVAILABLE },
  async () => {
    const orphans = await rawSelect<{ id: string }>(
      sql`SELECT ur.id
            FROM public.user_roles ur
            LEFT JOIN public.roles r ON r.id = ur.role_id
           WHERE r.id IS NULL`,
    );
    assert.deepStrictEqual(
      orphans,
      [],
      `${orphans.length} user_roles rows reference a non-existent role`,
    );
  },
);

test(
  "every founder / audit-bot has both a super_admin grant and an admin cabinet grant",
  { skip: !DB_AVAILABLE },
  async () => {
    const founders = await rawSelect<{ email: string; missing: string }>(
      sql`WITH t AS (
        SELECT u.id, u.email
          FROM public.app_users u
          JOIN auth.users au ON au.id = u.auth_user_id
         WHERE au.email IN ('nrazgulyaev@gmail.com', 'audit-bot@arconique.com')
      )
      SELECT t.email,
             CASE
               WHEN NOT EXISTS (
                 SELECT 1 FROM public.user_roles ur
                   JOIN public.roles r ON r.id = ur.role_id
                  WHERE ur.user_id = t.id AND r.key = 'super_admin'
               ) THEN 'user_roles.super_admin'
               WHEN NOT EXISTS (
                 SELECT 1 FROM public.app_user_roles aur
                  WHERE aur.user_id = t.id
                    AND aur.role_key = 'admin'
                    AND aur.is_active = true
               ) THEN 'app_user_roles.admin'
               ELSE NULL
             END AS missing
        FROM t
       WHERE 1 = 1`,
    );
    const broken = founders.filter((f) => f.missing !== null);
    assert.deepStrictEqual(
      broken,
      [],
      `Some founder/audit accounts are missing required grants:\n` +
        broken.map((b) => `  - ${b.email}: missing ${b.missing}`).join("\n"),
    );
  },
);
