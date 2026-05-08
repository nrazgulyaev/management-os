/**
 * Stage 8.F.5 — provisioning invariants.
 *
 * Connects to the live database via `tests/invariants/_db.ts` and asserts
 * that the provisioning chain (auth.users → app_users → user_roles +
 * app_user_roles) stays in sync. Skipped when no `DATABASE_URL` /
 * `DIRECT_URL` is configured.
 *
 * Run against staging or production manually:
 *
 *   node --env-file=.env.production.local --import tsx \
 *     --test tests/invariants/provisioning.test.ts
 */

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { closeInvariantDb, dbAvailable, getInvariantSql } from "./_db";

const DB_AVAILABLE = dbAvailable();

after(async () => {
  await closeInvariantDb().catch(() => {});
});

test(
  "every auth.users entry has a matching app_users row",
  { skip: !DB_AVAILABLE },
  async () => {
    const sql = getInvariantSql();
    const rows = await sql<Array<{ id: string; email: string }>>`
      SELECT au.id, au.email
        FROM auth.users au
        LEFT JOIN public.app_users u ON u.auth_user_id = au.id
       WHERE u.id IS NULL
    `;
    assert.deepStrictEqual(
      [...rows],
      [],
      `${rows.length} auth.users rows have no matching app_users:\n` +
        rows.map((r) => `  - ${r.email} (${r.id})`).join("\n"),
    );
  },
);

test(
  "every active app_users row has at least one grant in user_roles or app_user_roles",
  { skip: !DB_AVAILABLE },
  async () => {
    const sql = getInvariantSql();
    const rows = await sql<Array<{ id: string; email: string }>>`
      SELECT u.id, u.email
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
         )
    `;
    assert.deepStrictEqual(
      [...rows],
      [],
      `${rows.length} active app_users have no role grant in either RBAC table:\n` +
        rows.map((r) => `  - ${r.email} (${r.id})`).join("\n"),
    );
  },
);

test(
  "every active app_user_roles row uses a role_key permitted by the CHECK constraint",
  { skip: !DB_AVAILABLE },
  async () => {
    const sql = getInvariantSql();
    const rows = await sql<Array<{ id: string; role_key: string }>>`
      SELECT id, role_key
        FROM public.app_user_roles
       WHERE is_active = true
         AND role_key NOT IN (
           'marketing_staff', 'qs_analyst', 'procurement_manager',
           'warehouse_manager', 'site_supervisor', 'sales_manager',
           'project_manager', 'cfo_accountant', 'executive_ceo', 'admin'
         )
    `;
    assert.deepStrictEqual(
      [...rows],
      [],
      `${rows.length} active app_user_roles rows have invalid role_key values`,
    );
  },
);

test(
  "every active app_user_roles row references an existing app_users row",
  { skip: !DB_AVAILABLE },
  async () => {
    const sql = getInvariantSql();
    const rows = await sql<Array<{ id: string }>>`
      SELECT aur.id
        FROM public.app_user_roles aur
        LEFT JOIN public.app_users u ON u.id = aur.user_id
       WHERE aur.is_active = true
         AND u.id IS NULL
    `;
    assert.deepStrictEqual(
      [...rows],
      [],
      `${rows.length} active grants reference a non-existent app_users id`,
    );
  },
);

test(
  "user_roles rows resolve to canonical role keys in the roles table",
  { skip: !DB_AVAILABLE },
  async () => {
    const sql = getInvariantSql();
    const rows = await sql<Array<{ id: string }>>`
      SELECT ur.id
        FROM public.user_roles ur
        LEFT JOIN public.roles r ON r.id = ur.role_id
       WHERE r.id IS NULL
    `;
    assert.deepStrictEqual(
      [...rows],
      [],
      `${rows.length} user_roles rows reference a non-existent role`,
    );
  },
);

test(
  "every founder / audit-bot has both a super_admin grant and an admin cabinet grant",
  { skip: !DB_AVAILABLE },
  async () => {
    const sql = getInvariantSql();
    const rows = await sql<Array<{ email: string; missing: string | null }>>`
      WITH t AS (
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
    `;
    const broken = [...rows].filter((f) => f.missing !== null);
    assert.deepStrictEqual(
      broken,
      [],
      `Some founder/audit accounts are missing required grants:\n` +
        broken.map((b) => `  - ${b.email}: missing ${b.missing}`).join("\n"),
    );
  },
);
