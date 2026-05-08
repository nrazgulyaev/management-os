/**
 * Stage 9.G — DB-bound tenant-isolation invariants.
 *
 * These run against the actually-applied schema (catches drift between
 * migration intent and what's deployed). Skipped when no DATABASE_URL
 * / DIRECT_URL is configured; for the static counterpart see
 * `tests/development-stage-9-g.test.ts`.
 *
 * Run against staging or production manually:
 *
 *   node --env-file=.env.production.local --import tsx \
 *     --test tests/invariants/tenant-isolation.test.ts
 */

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { closeInvariantDb, dbAvailable, getInvariantSql } from "./_db";

const DB_AVAILABLE = dbAvailable();

after(async () => {
  await closeInvariantDb().catch(() => {});
});

test(
  "every public table with an organization_id FK has RLS ENABLED + FORCED",
  { skip: !DB_AVAILABLE },
  async () => {
    const sql = getInvariantSql();
    const rows = await sql<
      Array<{ table_name: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>
    >`
      SELECT c.relname AS table_name, c.relrowsecurity, c.relforcerowsecurity
        FROM information_schema.columns col
        JOIN pg_class c ON c.relname = col.table_name
        JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
       WHERE col.table_schema = 'public'
         AND col.column_name = 'organization_id'
         AND col.table_name IN (
           SELECT k.table_name
             FROM information_schema.key_column_usage k
             JOIN information_schema.referential_constraints r
               ON r.constraint_name = k.constraint_name
                  AND r.constraint_schema = k.constraint_schema
             JOIN information_schema.constraint_column_usage cu
               ON cu.constraint_name = r.unique_constraint_name
            WHERE k.table_schema = 'public'
              AND k.column_name = 'organization_id'
              AND cu.table_name = 'organizations'
         )
       ORDER BY c.relname
    `;
    const offenders = [...rows].filter(
      (r) => !r.relrowsecurity || !r.relforcerowsecurity,
    );
    assert.deepStrictEqual(
      offenders,
      [],
      `${offenders.length} org-scoped tables lack ENABLE+FORCE RLS:\n` +
        offenders
          .map(
            (r) =>
              `  - ${r.table_name}: enabled=${r.relrowsecurity} forced=${r.relforcerowsecurity}`,
          )
          .join("\n"),
    );
  },
);

/**
 * Every table in this list MUST carry an `is_in_user_organization` policy.
 * Mirrors `REQUIRED_ORG_SCOPED` in `tests/development-stage-9-g.test.ts` —
 * the canonical multi-tenant data surfaces we own.
 *
 * The broader population (~109 tables across the codebase that have
 * `organization_id` from any source — including legacy ALTER-TABLE
 * additions and tables that intentionally bypass org isolation for
 * Arconique-internal use) is out of scope here. A separate Stage 10
 * audit will catalog them.
 */
const REQUIRED_ORG_SCOPED_TABLES = [
  "team_invitations",
  "org_subscriptions",
  "subscription_lifecycle_events",
  "ai_org_quota_limits",
  "ai_org_usage_monthly",
  "ai_project_memory",
  "api_keys",
  "api_request_log",
  "webhook_subscriptions",
  "usage_metrics",
  "data_export_requests",
  "bulk_import_jobs",
  "bank_connections",
  "bank_transactions",
  "payment_intents",
  "payment_attempts",
  "payment_processor_connections",
  "closed_periods",
  "reconciliation_rules",
  "statement_imports",
  "marketing_connections",
  "marketing_campaigns",
  "marketing_metrics",
  "attribution_conversions",
  "attribution_touchpoints",
  "channel_connections",
  "channel_reservations",
  "channel_commission_records",
  "channel_sync_log",
  "conversation_threads",
  "conversation_messages",
  "message_templates",
  "auto_response_rules",
  "oauth_connections",
];

test(
  "every required org-scoped table has at least one policy referencing is_in_user_organization",
  { skip: !DB_AVAILABLE },
  async () => {
    const sql = getInvariantSql();
    const rows = await sql<Array<{ table_name: string }>>`
      WITH required_tables AS (
        SELECT unnest(${REQUIRED_ORG_SCOPED_TABLES}::text[]) AS table_name
      ),
      policy_tables AS (
        SELECT DISTINCT p.tablename AS table_name
          FROM pg_policies p
         WHERE p.schemaname = 'public'
           AND (p.qual ILIKE '%is_in_user_organization%'
                OR p.with_check ILIKE '%is_in_user_organization%')
      )
      SELECT t.table_name
        FROM required_tables t
        LEFT JOIN policy_tables p ON p.table_name = t.table_name
       WHERE p.table_name IS NULL
       ORDER BY t.table_name
    `;
    assert.deepStrictEqual(
      [...rows],
      [],
      `${rows.length} required org-scoped tables have no is_in_user_organization policy in pg_policies — RLS is enabled but the gate is open or wrong:\n` +
        rows.map((r) => `  - ${r.table_name}`).join("\n"),
    );
  },
);

test(
  "is_in_user_organization SQL function is callable from Postgres",
  { skip: !DB_AVAILABLE },
  async () => {
    const sql = getInvariantSql();
    const rows = await sql<Array<{ proname: string; pronargs: number }>>`
      SELECT p.proname, p.pronargs
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname IN ('is_in_user_organization', 'is_internal_user', 'current_user_organization_id')
       ORDER BY p.proname
    `;
    const names = new Set([...rows].map((r) => r.proname));
    for (const fn of [
      "is_in_user_organization",
      "is_internal_user",
      "current_user_organization_id",
    ]) {
      assert.ok(names.has(fn), `${fn} must be declared in public schema`);
    }
  },
);

test(
  "subscription tables (org_subscriptions, subscription_lifecycle_events) have org-isolation policies",
  { skip: !DB_AVAILABLE },
  async () => {
    const sql = getInvariantSql();
    const rows = await sql<Array<{ tablename: string; policyname: string }>>`
      SELECT tablename, policyname
        FROM pg_policies
       WHERE schemaname = 'public'
         AND tablename IN ('org_subscriptions', 'subscription_lifecycle_events')
         AND (qual ILIKE '%is_in_user_organization%'
              OR with_check ILIKE '%is_in_user_organization%')
    `;
    const tables = new Set([...rows].map((r) => r.tablename));
    for (const t of ["org_subscriptions", "subscription_lifecycle_events"]) {
      assert.ok(
        tables.has(t),
        `subscription table ${t} must have an is_in_user_organization policy`,
      );
    }
  },
);

test(
  "team_invitations has both org_isolation + internal_bypass policies (Stage 9.D)",
  { skip: !DB_AVAILABLE },
  async () => {
    const sql = getInvariantSql();
    const rows = await sql<Array<{ policyname: string }>>`
      SELECT policyname
        FROM pg_policies
       WHERE schemaname = 'public'
         AND tablename = 'team_invitations'
    `;
    const names = new Set([...rows].map((r) => r.policyname));
    assert.ok(
      names.has("team_invitations_org_isolation"),
      "team_invitations must have org_isolation policy",
    );
    assert.ok(
      names.has("team_invitations_internal_bypass"),
      "team_invitations must have internal_bypass policy",
    );
  },
);

test(
  "audit_events policies (if any) restrict to internal users only",
  { skip: !DB_AVAILABLE },
  async () => {
    const sql = getInvariantSql();
    const rows = await sql<Array<{ policyname: string; qual: string | null }>>`
      SELECT policyname, qual
        FROM pg_policies
       WHERE schemaname = 'public'
         AND tablename = 'audit_events'
    `;
    for (const row of rows) {
      assert.ok(
        row.qual && /is_internal_user/i.test(row.qual),
        `audit_events policy ${row.policyname} must reference is_internal_user — its qual is: ${row.qual ?? "(null)"}`,
      );
    }
  },
);
