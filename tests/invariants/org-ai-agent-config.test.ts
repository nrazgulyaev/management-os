/**
 * Stage 9.F.1 — DB-bound invariants for org_ai_agent_config.
 *
 * Skipped without `DATABASE_URL` / `DIRECT_URL`. For the static
 * counterpart see `tests/development-stage-9-f.test.ts`.
 *
 * Run against staging or production:
 *
 *   node --env-file=.env.production.local --import tsx \
 *     --test tests/invariants/org-ai-agent-config.test.ts
 */

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { closeInvariantDb, dbAvailable, getInvariantSql } from "./_db";

const DB_AVAILABLE = dbAvailable();

after(async () => {
  await closeInvariantDb().catch(() => {});
});

test(
  "org_ai_agent_config table exists with the migration's expected shape",
  { skip: !DB_AVAILABLE },
  async () => {
    const sql = getInvariantSql();
    const cols = await sql<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'org_ai_agent_config'
    `;
    const set = new Set([...cols].map((c) => c.column_name));
    for (const required of [
      "id",
      "organization_id",
      "agent_key",
      "is_enabled",
      "custom_prompt",
      "notes",
      "updated_by",
      "created_at",
      "updated_at",
    ]) {
      assert.ok(set.has(required), `org_ai_agent_config is missing column ${required}`);
    }
  },
);

test(
  "org_ai_agent_config has unique (organization_id, agent_key) constraint",
  { skip: !DB_AVAILABLE },
  async () => {
    const sql = getInvariantSql();
    const rows = await sql<Array<{ conname: string }>>`
      SELECT con.conname
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
       WHERE rel.relname = 'org_ai_agent_config'
         AND con.contype = 'u'
         AND con.conname = 'org_ai_agent_config_org_agent_uniq'
    `;
    assert.strictEqual(
      rows.length,
      1,
      "Expected unique constraint org_ai_agent_config_org_agent_uniq",
    );
  },
);

test(
  "every active row uses an agent_key permitted by the CHECK constraint",
  { skip: !DB_AVAILABLE },
  async () => {
    const sql = getInvariantSql();
    const rows = await sql<Array<{ id: string; agent_key: string }>>`
      SELECT id, agent_key
        FROM public.org_ai_agent_config
       WHERE agent_key NOT IN (
         'qs_cost_analyst', 'procurement_analyst', 'tax_assistant',
         'marketing_assistant', 'executive_business', 'daily_digest',
         'weekly_plan', 'inbox', 'memory'
       )
    `;
    assert.deepStrictEqual(
      [...rows],
      [],
      `${rows.length} org_ai_agent_config rows have invalid agent_key values`,
    );
  },
);

test(
  "every row references an existing organization",
  { skip: !DB_AVAILABLE },
  async () => {
    const sql = getInvariantSql();
    const rows = await sql<Array<{ id: string; organization_id: string }>>`
      SELECT c.id, c.organization_id
        FROM public.org_ai_agent_config c
        LEFT JOIN public.organizations o ON o.id = c.organization_id
       WHERE o.id IS NULL
    `;
    assert.deepStrictEqual(
      [...rows],
      [],
      `${rows.length} org_ai_agent_config rows reference a missing organization`,
    );
  },
);

test(
  "org_ai_agent_config has RLS enabled + forced + the two policies from migration 0090",
  { skip: !DB_AVAILABLE },
  async () => {
    const sql = getInvariantSql();
    const rls = await sql<Array<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>>`
      SELECT relrowsecurity, relforcerowsecurity FROM pg_class
       WHERE relname = 'org_ai_agent_config'
         AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    `;
    assert.ok(rls[0]?.relrowsecurity, "RLS must be enabled on org_ai_agent_config");
    assert.ok(rls[0]?.relforcerowsecurity, "RLS must be FORCEd on org_ai_agent_config");

    const policies = await sql<Array<{ policyname: string }>>`
      SELECT policyname FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'org_ai_agent_config'
    `;
    const names = new Set([...policies].map((p) => p.policyname));
    assert.ok(
      names.has("org_ai_agent_config_org_isolation"),
      "missing org_ai_agent_config_org_isolation policy",
    );
    assert.ok(
      names.has("org_ai_agent_config_internal_bypass"),
      "missing org_ai_agent_config_internal_bypass policy",
    );
  },
);
