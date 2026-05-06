/**
 * Stage 3.A — AI Provider Foundation + Photo Analyst + Storage
 * abstraction + Cost dashboard.
 *
 * Mix of:
 *   - Runtime tests (pure modules: cost calculator).
 *   - Static-source tests (server-only modules: budget, providers,
 *     storage, photo analyst, dashboard, cron wiring).
 *   - Migration shape tests (idempotent, RLS, CHECK constraints).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  computeCallCost,
  getModelRate,
  listModelRates,
} from "../src/lib/ai/cost";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");
const exists = (rel: string) => existsSync(resolve(ROOT, rel));

// ---------------------------------------------------------------------------
// 1) Migration 0041 — schema shape
// ---------------------------------------------------------------------------

const MIGRATION_PATH = "drizzle/0041_development_os_stage_3_a_ai_foundation.sql";

test("migration 0041 file exists", () => {
  assert.ok(exists(MIGRATION_PATH));
});

test("migration 0041 wraps in BEGIN/COMMIT and is idempotent", () => {
  const sql = read(MIGRATION_PATH);
  assert.match(sql, /^BEGIN;/m);
  assert.match(sql, /^COMMIT;/m);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "ai_agent_budgets"/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "input_cost_usd"/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "output_cost_usd"/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "total_cost_usd"/);
});

test("migration 0041 widens ai_runs_status_check to include budget_exceeded + dry_run", () => {
  const sql = read(MIGRATION_PATH);
  assert.match(sql, /'budget_exceeded'/);
  assert.match(sql, /'dry_run'/);
  // Existing values must remain whitelisted so historical rows don't break.
  for (const v of ["running", "succeeded", "failed", "fallback", "blocked"]) {
    assert.ok(sql.includes(`'${v}'`), `status "${v}" missing from CHECK`);
  }
});

test("migration 0041 enforces daily ≤ monthly budget invariant", () => {
  const sql = read(MIGRATION_PATH);
  assert.match(sql, /ai_agent_budgets_daily_le_monthly/);
  assert.match(sql, /"daily_limit_usd" <= "monthly_limit_usd"/);
});

test("migration 0041 enforces alert_threshold_pct between 1 and 100", () => {
  const sql = read(MIGRATION_PATH);
  assert.match(sql, /"alert_threshold_pct" BETWEEN 1 AND 100/);
});

test("ai_agent_budgets is RLS-protected (internal only)", () => {
  const sql = read(MIGRATION_PATH);
  assert.match(sql, /ALTER TABLE "ai_agent_budgets" ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /ALTER TABLE "ai_agent_budgets" FORCE ROW LEVEL SECURITY/);
  assert.match(sql, /CREATE POLICY "internal_read" ON "ai_agent_budgets"/);
  assert.match(sql, /CREATE POLICY "internal_write" ON "ai_agent_budgets"/);
  assert.match(sql, /public\.is_internal_user\(\)/);
});

test("ai_agent_budgets has updated_at trigger for staleness tracking", () => {
  const sql = read(MIGRATION_PATH);
  assert.match(sql, /CREATE OR REPLACE FUNCTION "ai_agent_budgets_set_updated_at"/);
  assert.match(sql, /CREATE TRIGGER "ai_agent_budgets_updated_at_trg"/);
});

// ---------------------------------------------------------------------------
// 2) Drizzle schema — typed types exported
// ---------------------------------------------------------------------------

test("aiAgentBudgets table + types are exported from ai schema", () => {
  const src = read("src/lib/db/schema/ai.ts");
  assert.match(src, /export const aiAgentBudgets = pgTable\(\s*"ai_agent_budgets"/);
  assert.match(src, /export type AiAgentBudget /);
  assert.match(src, /export type NewAiAgentBudget /);
  assert.match(src, /inputCostUsd: numeric\("input_cost_usd"/);
  assert.match(src, /outputCostUsd: numeric\("output_cost_usd"/);
  assert.match(src, /totalCostUsd: numeric\("total_cost_usd"/);
});

// ---------------------------------------------------------------------------
// 3) Cost calculator — runtime
// ---------------------------------------------------------------------------

test("computeCallCost returns null for unknown model (no silent zero)", () => {
  const out = computeCallCost({
    model: "totally-not-a-real-model",
    promptTokens: 1000,
    completionTokens: 500,
  });
  assert.equal(out, null);
});

test("computeCallCost computes Opus 4.7 cost from token counts", () => {
  // Opus 4.7: input $5 / 1M, output $25 / 1M.
  // 100k input × $5/1M = $0.50; 50k output × $25/1M = $1.25; total $1.75.
  const out = computeCallCost({
    model: "claude-opus-4-7",
    promptTokens: 100_000,
    completionTokens: 50_000,
  });
  assert.ok(out);
  assert.equal(out.inputCostUsd, 0.5);
  assert.equal(out.outputCostUsd, 1.25);
  assert.equal(out.totalCostUsd, 1.75);
  assert.equal(out.rate.vendor, "anthropic");
});

test("computeCallCost computes Haiku 4.5 cost (the default photo analyst model)", () => {
  // Haiku 4.5: input $1 / 1M, output $5 / 1M.
  // 5000 input × $1/1M = $0.005; 800 output × $5/1M = $0.004; total $0.009.
  const out = computeCallCost({
    model: "claude-haiku-4-5",
    promptTokens: 5000,
    completionTokens: 800,
  });
  assert.ok(out);
  assert.equal(out.inputCostUsd, 0.005);
  assert.equal(out.outputCostUsd, 0.004);
  assert.equal(out.totalCostUsd, 0.009);
});

test("computeCallCost rounds to 4 decimals (NUMERIC(12,4) match)", () => {
  // Rate that produces a long decimal — round to 4dp.
  const out = computeCallCost({
    model: "claude-haiku-4-5",
    promptTokens: 1,
    completionTokens: 1,
  });
  assert.ok(out);
  // 1 × 1 / 1_000_000 = 0.000001 — rounds to 0 at 4dp.
  assert.equal(out.inputCostUsd, 0);
  assert.equal(out.outputCostUsd, 0);
  assert.equal(out.totalCostUsd, 0);
});

test("getModelRate matches exact model id (no date-suffix guessing)", () => {
  assert.equal(getModelRate("claude-opus-4-7")?.inputPerMTokens, 5.0);
  // Skill rules: never append date suffixes. The lookup must NOT match
  // a fictitious dated variant.
  assert.equal(getModelRate("claude-opus-4-7-20260101"), null);
});

test("listModelRates includes the 4.x family (4.7, 4.6, sonnet 4.6, haiku 4.5)", () => {
  const rates = listModelRates();
  const ids = rates.map((r) => r.model);
  for (const expected of [
    "claude-opus-4-7",
    "claude-opus-4-6",
    "claude-sonnet-4-6",
    "claude-haiku-4-5",
  ]) {
    assert.ok(ids.includes(expected), `missing rate for ${expected}`);
  }
});

test("Opus 4.7 rate matches the public price ($5 in / $25 out per 1M)", () => {
  const rate = getModelRate("claude-opus-4-7");
  assert.ok(rate);
  assert.equal(rate.inputPerMTokens, 5.0);
  assert.equal(rate.outputPerMTokens, 25.0);
});

// ---------------------------------------------------------------------------
// 4) Budget enforcement helper
// ---------------------------------------------------------------------------

const BUDGET_PATH = "src/lib/ai/budget.ts";

test("budget.ts has server-only guard", () => {
  assert.ok(exists(BUDGET_PATH));
  assert.match(read(BUDGET_PATH), /^import "server-only";/m);
});

test("checkBudget returns 'no_budget_configured' when no row exists", () => {
  const src = read(BUDGET_PATH);
  assert.match(src, /no_budget_configured/);
});

test("checkBudget blocks when daily or monthly limit hit", () => {
  const src = read(BUDGET_PATH);
  assert.match(src, /daily_exceeded/);
  assert.match(src, /monthly_exceeded/);
  assert.match(src, /dailySpentUsd >= dailyLimitUsd/);
  assert.match(src, /monthlySpentUsd >= monthlyLimitUsd/);
});

test("checkBudget blocks when budget row is disabled", () => {
  const src = read(BUDGET_PATH);
  assert.match(src, /reason: "disabled"/);
});

test("checkBudget surfaces a warning when usage ≥ alert_threshold_pct", () => {
  const src = read(BUDGET_PATH);
  assert.match(src, /isWarning/);
  assert.match(src, /alertThresholdPct/);
});

// ---------------------------------------------------------------------------
// 5) Dry-run AI provider + factory
// ---------------------------------------------------------------------------

const PROVIDER_INDEX = "src/lib/ai/providers/index.ts";
const DRY_RUN_PATH = "src/lib/ai/providers/dry-run.ts";

test("dry-run provider file exists with server-only guard", () => {
  assert.ok(exists(DRY_RUN_PATH));
  assert.match(read(DRY_RUN_PATH), /^import "server-only";/m);
});

test("DryRunProvider returns deterministic JSON for the photo analyst marker", () => {
  const src = read(DRY_RUN_PATH);
  assert.match(src, /PHOTO_ANALYST_MARKER/);
  assert.match(src, /detected_objects/);
  assert.match(src, /confidence/);
  assert.match(src, /dry_run: true/);
});

test("provider factory selects DryRunProvider when AI_DRY_RUN or no API key", () => {
  // Stage 3.B generalised the configured-key check from `isAiConfigured()`
  // (Anthropic-only) to `hasAnyAIKey()` (Anthropic OR OpenAI). The
  // dry-run + Anthropic-default behaviour is unchanged.
  const src = read(PROVIDER_INDEX);
  assert.match(src, /isAiDryRun\(\) \|\| !hasAnyAIKey\(\)/);
  assert.match(src, /new DryRunProvider\(\)/);
  assert.match(src, /new AnthropicProvider\(\)/);
});

test("AIMessage.images allows base64 image attachments on user turns", () => {
  const types = read("src/lib/ai/providers/types.ts");
  assert.match(types, /export interface AIImageAttachment/);
  assert.match(types, /base64: string;/);
  assert.match(types, /mediaType:/);
  assert.match(types, /images\?: AIImageAttachment\[\];/);
});

test("AnthropicProvider sends image blocks before text on user turns", () => {
  const src = read("src/lib/ai/providers/anthropic.ts");
  assert.match(src, /type: "image"/);
  assert.match(src, /source: \{\s*type: "base64"/);
  assert.match(src, /media_type: img\.mediaType/);
});

// ---------------------------------------------------------------------------
// 6) Storage abstraction
// ---------------------------------------------------------------------------

test("storage abstraction modules exist with server-only guards", () => {
  for (const f of [
    "src/lib/storage/index.ts",
    "src/lib/storage/types.ts",
    "src/lib/storage/supabase.ts",
    "src/lib/storage/dry-run.ts",
  ]) {
    assert.ok(exists(f), `missing ${f}`);
  }
  // types.ts is pure (no server-only) so dashboards/agents can import it.
  assert.doesNotMatch(read("src/lib/storage/types.ts"), /server-only/);
  for (const f of [
    "src/lib/storage/index.ts",
    "src/lib/storage/supabase.ts",
    "src/lib/storage/dry-run.ts",
  ]) {
    assert.match(read(f), /^import "server-only";/m);
  }
});

test("StorageProvider interface exposes createSignedUrl + download", () => {
  const src = read("src/lib/storage/types.ts");
  assert.match(src, /createSignedUrl\(/);
  assert.match(src, /download\(/);
  assert.match(src, /isAvailable\(\)/);
});

test("getStorageProvider falls back to DryRun when Supabase admin not available", () => {
  const src = read("src/lib/storage/index.ts");
  assert.match(src, /supabase\.isAvailable\(\) \? supabase : new DryRunStorageProvider\(\)/);
});

test("DryRunStorageProvider returns a tiny PNG so vision callers can be exercised", () => {
  const src = read("src/lib/storage/dry-run.ts");
  assert.match(src, /TINY_PNG/);
  assert.match(src, /image\/png/);
});

// ---------------------------------------------------------------------------
// 7) Photo Analyst agent
// ---------------------------------------------------------------------------

const ANALYST_PATH = "src/lib/development/ai/photo-analyst.ts";
const CRON_JOB_PATH = "src/lib/development/server/cron/photo-analyst-job.ts";
const CRON_ROUTE_PATH = "src/app/api/cron/dev-os-photo-analyst/route.ts";

test("photo analyst agent file exists with server-only guard", () => {
  assert.ok(exists(ANALYST_PATH));
  assert.match(read(ANALYST_PATH), /^import "server-only";/m);
});

test("photo analyst exports PHOTO_ANALYST_KEY = 'dev_os.photo_analyst'", () => {
  const src = read(ANALYST_PATH);
  assert.match(src, /PHOTO_ANALYST_KEY = "dev_os\.photo_analyst"/);
});

test("photo analyst checks budget before calling provider", () => {
  const src = read(ANALYST_PATH);
  assert.match(src, /checkBudget\(PHOTO_ANALYST_KEY\)/);
  assert.match(src, /budget_exceeded/);
});

test("photo analyst skips already-analyzed photos (idempotent)", () => {
  const src = read(ANALYST_PATH);
  assert.match(src, /row\.analyzedAt/);
  assert.match(src, /status: "skipped"/);
});

test("photo analyst writes ai_assistant_runs with cost columns", () => {
  const src = read(ANALYST_PATH);
  assert.match(src, /computeCallCost/);
  assert.match(src, /inputCostUsd:/);
  assert.match(src, /outputCostUsd:/);
  assert.match(src, /totalCostUsd:/);
});

test("photo analyst validates Claude response with Zod", () => {
  const src = read(ANALYST_PATH);
  assert.match(src, /ResponseSchema/);
  assert.match(src, /caption: z\.string\(\)\.max\(500\)/);
  assert.match(src, /detected_objects: z\.array/);
  assert.match(src, /confidence: z\.number\(\)\.min\(0\)\.max\(1\)/);
});

test("photo analyst writes results to site_report_photos columns reserved in 2.4", () => {
  const src = read(ANALYST_PATH);
  assert.match(src, /aiAnalyzedAt:/);
  assert.match(src, /aiDetectedObjects:/);
  assert.match(src, /aiProgressInferred:/);
  assert.match(src, /aiSafetyConcerns:/);
  assert.match(src, /aiQualityConcerns:/);
});

test("photo analyst never overwrites operator caption (HITL safety)", () => {
  // The agent fills aiDetectedObjects.caption (nested in JSONB), NOT
  // siteReportPhotos.caption (the top-level operator-authored column).
  // A direct top-level `caption:` assignment in the .update().set() call
  // would clobber operator notes — guard against that regression.
  const src = read(ANALYST_PATH);
  // Match the top-level fields inside the .set({...}) for siteReportPhotos
  // — they're indented at 6 spaces inside the analyzer. Operator caption
  // is a sibling of aiAnalyzedAt; ai-derived caption lives nested.
  assert.doesNotMatch(src, /^\s{6}caption: parsed\.caption,?$/m);
});

test("findUnanalyzedPhotos filters to submitted/reviewed reports only", () => {
  const src = read(ANALYST_PATH);
  assert.match(src, /isNull\(siteReportPhotos\.aiAnalyzedAt\)/);
  assert.match(src, /'submitted','reviewed'/);
});

test("photo analyst uses Haiku 4.5 by default (cheap vision)", () => {
  const src = read(ANALYST_PATH);
  assert.match(src, /claude-haiku-4-5/);
});

test("photo analyst cron job file exists with server-only guard", () => {
  assert.ok(exists(CRON_JOB_PATH));
  assert.match(read(CRON_JOB_PATH), /^import "server-only";/m);
});

test("photo analyst cron stops the loop on budget_exceeded", () => {
  const src = read(CRON_JOB_PATH);
  assert.match(src, /res\.status === "budget_exceeded"/);
  assert.match(src, /break;/);
});

test("photo analyst cron route exists at /api/cron/dev-os-photo-analyst", () => {
  assert.ok(exists(CRON_ROUTE_PATH));
  const src = read(CRON_ROUTE_PATH);
  assert.match(src, /handleCronJobRequest\(request, "dev_os_photo_analyst"\)/);
});

// ---------------------------------------------------------------------------
// 8) Dispatcher + cron registration
// ---------------------------------------------------------------------------

test("dev_os_photo_analyst is registered in KNOWN_JOBS", () => {
  const src = read("src/features/jobs/actions.ts");
  assert.match(src, /"dev_os_photo_analyst"/);
});

test("dev_os_photo_analyst is dispatched to runDevOsPhotoAnalyst", () => {
  const src = read("src/features/jobs/actions.ts");
  assert.match(src, /case "dev_os_photo_analyst":\s*\n\s*return runDevOsPhotoAnalyst/);
});

test("dev_os_photo_analyst is in DEV_OS_JOB_KEYS", () => {
  const src = read("src/lib/development/server/cron/index.ts");
  assert.match(src, /"dev_os_photo_analyst"/);
});

test("VERCEL-CRON-CHECKLIST.md documents the photo analyst cron", () => {
  const md = read("docs/VERCEL-CRON-CHECKLIST.md");
  assert.match(md, /\/api\/cron\/dev-os-photo-analyst/);
  assert.match(md, /dev_os_photo_analyst/);
});

// ---------------------------------------------------------------------------
// 9) AI Cost Dashboard
// ---------------------------------------------------------------------------

const DASHBOARD_PATH =
  "src/app/(development-app)/development-os/settings/ai-usage/page.tsx";
const USAGE_QUERY_PATH = "src/lib/development/server/ai-usage.ts";

test("AI usage dashboard page exists", () => {
  assert.ok(exists(DASHBOARD_PATH));
});

test("AI usage server query module has server-only guard", () => {
  assert.ok(exists(USAGE_QUERY_PATH));
  assert.match(read(USAGE_QUERY_PATH), /^import "server-only";/m);
});

test("AI usage server query exports getAiUsageByAssistant + getRecentAiRuns + getAiAgentBudgets", () => {
  const src = read(USAGE_QUERY_PATH);
  for (const fn of [
    "getAiUsageByAssistant",
    "getRecentAiRuns",
    "getAiAgentBudgets",
    "getAiSpendWindows",
  ]) {
    assert.match(src, new RegExp(`export async function ${fn}`));
  }
});

test("AI usage dashboard wraps queries in safeQuery (resilience)", () => {
  const src = read(DASHBOARD_PATH);
  assert.match(src, /safeQuery\("getAiUsageByAssistant"/);
  assert.match(src, /safeQuery\("getRecentAiRuns"/);
  assert.match(src, /safeQuery\("getAiAgentBudgets"/);
});

test("AI usage dashboard renders an EmptyState when DB not configured", () => {
  const src = read(DASHBOARD_PATH);
  assert.match(src, /Database not configured/);
});

test("AI usage dashboard renders budget utilisation bars", () => {
  const src = read(DASHBOARD_PATH);
  assert.match(src, /dailyPct/);
  assert.match(src, /monthlyPct/);
  assert.match(src, /Exceeded/);
  assert.match(src, /Warning/);
});

// ---------------------------------------------------------------------------
// 10) Demo seed extension
// ---------------------------------------------------------------------------

test("seed-dev-os.mjs inserts default budgets for photo_analyst + operations_copilot", () => {
  const src = read("scripts/seed-dev-os.mjs");
  assert.match(src, /dev_os\.photo_analyst/);
  assert.match(src, /dev_os\.operations_copilot/);
  assert.match(src, /INSERT INTO ai_agent_budgets/);
  assert.match(src, /ON CONFLICT \(assistant_key\) DO UPDATE/);
});
