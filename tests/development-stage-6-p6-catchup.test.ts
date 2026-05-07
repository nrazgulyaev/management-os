/**
 * Stage 6.P6-CATCHUP — AI org-quotas + aiExecute() + 4 cron jobs.
 *
 * Validates load-bearing source-level invariants for the catch-up scope:
 *   - Migration 0083 schema (3 new tables) + RLS via FOREACH ARRAY
 *   - Drizzle schema modules expose the new tables
 *   - `aiExecute()` enforces hard cap before provider call
 *   - 4 cron job runners exist + are wired in dispatcher + checklist
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE =
  typeof __dirname !== "undefined"
    ? __dirname
    : dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

function readFile(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8");
}
function fileExists(rel: string): boolean {
  return existsSync(resolve(ROOT, rel));
}

// ===========================================================================
// 1) Migration 0083
// ===========================================================================

test("migration 0083 declares 3 new tables", () => {
  const sql = readFile(
    "drizzle/0083_development_os_stage_6_p6_ai_org_quotas.sql",
  );
  for (const t of [
    "ai_org_quota_limits",
    "ai_org_usage_monthly",
    "ai_project_memory",
  ]) {
    assert.match(
      sql,
      new RegExp(`CREATE TABLE IF NOT EXISTS "${t}"`),
      `missing ${t}`,
    );
  }
});

test("migration 0083 preserves FOREACH IN ARRAY pattern (5th preservation)", () => {
  const sql = readFile(
    "drizzle/0083_development_os_stage_6_p6_ai_org_quotas.sql",
  );
  assert.match(sql, /FOREACH\s+t\s+IN\s+ARRAY\s+ARRAY\[/);
});

test("migration 0083 enables RLS on every new table", () => {
  const sql = readFile(
    "drizzle/0083_development_os_stage_6_p6_ai_org_quotas.sql",
  );
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /FORCE ROW LEVEL SECURITY/);
  assert.match(sql, /is_in_user_organization/);
});

test("migration 0083 declares hard-cap default + warn/high thresholds", () => {
  const sql = readFile(
    "drizzle/0083_development_os_stage_6_p6_ai_org_quotas.sql",
  );
  assert.match(sql, /"daily_limit_usd"\s+NUMERIC\(10,\s*2\)/);
  assert.match(sql, /"monthly_limit_usd"\s+NUMERIC\(10,\s*2\)/);
  assert.match(sql, /"warn_threshold_pct"\s+INTEGER\s+NOT NULL DEFAULT 80/);
  assert.match(sql, /"high_threshold_pct"\s+INTEGER\s+NOT NULL DEFAULT 95/);
});

test("migration 0083 declares Stripe stub columns on usage table", () => {
  const sql = readFile(
    "drizzle/0083_development_os_stage_6_p6_ai_org_quotas.sql",
  );
  assert.match(sql, /"stripe_synced_at"\s+TIMESTAMPTZ/);
  assert.match(sql, /"stripe_subscription_item_id"\s+TEXT/);
});

// ===========================================================================
// 2) Drizzle schema modules
// ===========================================================================

test("Drizzle schema exports the 3 new tables", async () => {
  const mod = await import("../src/lib/db/schema/ai");
  assert.ok(mod.aiOrgQuotaLimits);
  assert.ok(mod.aiOrgUsageMonthly);
  assert.ok(mod.aiProjectMemory);
});

// ===========================================================================
// 3) aiExecute() wrapper
// ===========================================================================

test("aiExecute file exists + opens with `import \"server-only\"`", () => {
  assert.ok(fileExists("src/lib/ai/execute.ts"));
  const src = readFile("src/lib/ai/execute.ts");
  assert.match(src, /^import\s+"server-only";/);
});

test("aiExecute exports + pipeline shape", () => {
  const src = readFile("src/lib/ai/execute.ts");
  for (const fn of ["aiExecute", "snapshotOrgQuota"]) {
    assert.match(src, new RegExp(`export\\s+(async\\s+)?function\\s+${fn}\\b`));
  }
  // Hard cap must be checked BEFORE provider invocation.
  assert.match(src, /reachedHardCap/);
  assert.match(src, /org_daily_exceeded/);
  assert.match(src, /org_monthly_exceeded/);
  // Legacy budget fall-through.
  assert.match(src, /legacy_budget_exceeded/);
  // Provider override path.
  assert.match(src, /providerOverride/);
  assert.match(src, /getAIProviderByName/);
});

test("aiExecute persists run + bumps org-level usage", () => {
  const src = readFile("src/lib/ai/execute.ts");
  // Inserts into ai_assistant_runs
  assert.match(src, /aiAssistantRuns/);
  // Bumps ai_org_usage_monthly via UPSERT
  assert.match(src, /onConflictDoUpdate/);
  // Today_* gets reset on date roll
  assert.match(src, /todayDate/);
});

// ===========================================================================
// 4) 4 cron job runners
// ===========================================================================

test("4 P6-CATCHUP cron runners exist", () => {
  for (const f of [
    "ai-aggregate-daily-job.ts",
    "ai-period-rollover-job.ts",
    "ai-warn-thresholds-job.ts",
    "ai-stripe-sync-job.ts",
  ]) {
    assert.ok(
      fileExists(`src/lib/development/server/cron/${f}`),
      `${f} missing`,
    );
  }
});

test("cron index exports all 4 P6 runners", () => {
  const src = readFile("src/lib/development/server/cron/index.ts");
  for (const fn of [
    "runAiAggregateDaily",
    "runAiPeriodRollover",
    "runAiWarnThresholds",
    "runAiStripeSync",
  ]) {
    assert.match(src, new RegExp(`export\\s*\\{\\s*${fn}\\s*\\}\\s*from`));
  }
});

test("dispatcher: 4 P6 keys wired in KNOWN_JOBS + executeJob", () => {
  const src = readFile("src/features/jobs/actions.ts");
  for (const key of [
    "ai_aggregate_daily",
    "ai_period_rollover",
    "ai_warn_thresholds",
    "ai_stripe_sync",
  ]) {
    assert.match(src, new RegExp(`"${key}"`));
    assert.match(src, new RegExp(`case\\s+"${key}":`));
  }
});

test("4 cron route files exist + delegate via handleCronJobRequest", () => {
  for (const r of [
    "ai-aggregate-daily",
    "ai-period-rollover",
    "ai-warn-thresholds",
    "ai-stripe-sync",
  ]) {
    const path = `src/app/api/cron/${r}/route.ts`;
    assert.ok(fileExists(path), `${path} missing`);
    assert.match(readFile(path), /handleCronJobRequest/);
  }
});

test("VERCEL-CRON-CHECKLIST documents all 4 P6 entries + crons block", () => {
  const src = readFile("docs/VERCEL-CRON-CHECKLIST.md");
  for (const r of [
    "/api/cron/ai-aggregate-daily",
    "/api/cron/ai-period-rollover",
    "/api/cron/ai-warn-thresholds",
    "/api/cron/ai-stripe-sync",
  ]) {
    assert.ok(src.includes(r), `${r} must appear in checklist`);
  }
});

// ===========================================================================
// 5) Architecture doc bookkeeping
// ===========================================================================

test("arch doc: P6 carries CATCHUP marker (active or accepted)", () => {
  const src = readFile("docs/development-os-architecture.md");
  assert.match(
    src,
    /Stage 6\.P6 — AI Agents Activation Ready .*\[(ACTIVE|ACCEPTED) 6\.P6-CATCHUP\]/,
  );
});

test("Stripe sync job is documented as STUB pending Stage 7.D", () => {
  const src = readFile(
    "src/lib/development/server/cron/ai-stripe-sync-job.ts",
  );
  assert.match(src, /STUB/);
  assert.match(src, /Stage 7\.D/);
});
