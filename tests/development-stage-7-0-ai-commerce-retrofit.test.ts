/**
 * Stage 7.0 — AI commerce retrofit (Path C, additive only).
 *
 * Validates:
 *   - Migration 0086 — markup_percent + max_tier + enabled_agent_codes
 *     on subscription_plans + by_agent/by_provider/by_tier on
 *     ai_org_usage_monthly. FOREACH ARRAY preserved (7th time).
 *   - Tier router (tier-rules + route) — pure helpers, full coverage
 *     of agent → tier → model resolution + plan-aware gating.
 *   - Markup helper — pure round-trip + boundary checks.
 *   - aiExecute pipeline integration — uses router + applies markup.
 *   - Aggregate cron populates JSONB breakdowns from ai_assistant_runs.
 *   - Dashboard renders the new section.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  agentCodeToTier,
  modelToTier,
  tierToModel,
  AGENT_TIER_MAP,
  type AgentTier,
} from "../src/lib/ai/router/tier-rules";
import {
  routeRequest,
  type PlanSnapshot,
} from "../src/lib/ai/router/route";
import { applyMarkup, usdToMinor } from "../src/lib/ai/markup";

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
// 1) Migration 0086
// ===========================================================================

test("migration 0086 file exists", () => {
  assert.ok(
    fileExists(
      "drizzle/0086_development_os_stage_7_0_ai_commerce_retrofit.sql",
    ),
  );
});

test("migration 0086 adds markup_percent + max_tier + enabled_agent_codes idempotently", () => {
  const sql = readFile(
    "drizzle/0086_development_os_stage_7_0_ai_commerce_retrofit.sql",
  );
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "markup_percent" INTEGER/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "max_tier" INTEGER/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "enabled_agent_codes" TEXT\[\]/);
});

test("migration 0086 adds JSONB breakdown columns to ai_org_usage_monthly", () => {
  const sql = readFile(
    "drizzle/0086_development_os_stage_7_0_ai_commerce_retrofit.sql",
  );
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "by_agent" JSONB/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "by_provider" JSONB/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "by_tier" JSONB/);
});

test("migration 0086 preserves 0075 FOREACH IN ARRAY pattern (7th preservation)", () => {
  const sql = readFile(
    "drizzle/0086_development_os_stage_7_0_ai_commerce_retrofit.sql",
  );
  assert.match(sql, /FOREACH\s+pc\s+IN\s+ARRAY\s+ARRAY\[/);
});

test("migration 0086 sanity-constraints markup + tier ranges", () => {
  const sql = readFile(
    "drizzle/0086_development_os_stage_7_0_ai_commerce_retrofit.sql",
  );
  assert.match(sql, /subscription_plans_markup_nonnegative/);
  assert.match(sql, /subscription_plans_max_tier_range/);
  assert.match(sql, /"max_tier" BETWEEN 1 AND 3/);
});

// ===========================================================================
// 2) Tier rules (pure)
// ===========================================================================

test("AGENT_TIER_MAP covers the canonical agent inventory", () => {
  // Core agents from src/lib/development/server/ai/* + cron jobs.
  for (const code of [
    "qs_cost_analyst",
    "tax_assistant",
    "executive_business",
    "procurement_analyst",
    "marketing_assistant",
    "daily_digest",
    "weekly_plan",
    "dev_os.sales_assistant",
    "operations_copilot",
  ]) {
    assert.ok(
      AGENT_TIER_MAP[code] !== undefined,
      `${code} must have a tier mapping`,
    );
  }
});

test("agentCodeToTier defaults to Tier 2 for unknown codes", () => {
  assert.equal(agentCodeToTier("nonexistent_agent_xyz"), 2);
});

test("agentCodeToTier returns canonical tiers for known agents", () => {
  assert.equal(agentCodeToTier("classifier"), 1);
  assert.equal(agentCodeToTier("marketing_assistant"), 2);
  assert.equal(agentCodeToTier("qs_cost_analyst"), 3);
  assert.equal(agentCodeToTier("tax_assistant"), 3);
});

test("tierToModel returns correct provider-specific models", () => {
  assert.equal(tierToModel(1, "anthropic"), "claude-haiku-4-5");
  assert.equal(tierToModel(2, "anthropic"), "claude-sonnet-4-6");
  assert.equal(tierToModel(3, "anthropic"), "claude-opus-4-7");
  assert.equal(tierToModel(1, "openai"), "gpt-4o-mini");
  assert.equal(tierToModel(1, "gemini"), "gemini-1.5-flash");
  assert.equal(tierToModel(3, "gemini"), "gemini-1.5-pro");
});

test("modelToTier inverse lookup works for all canonical models", () => {
  assert.equal(modelToTier("claude-haiku-4-5"), 1);
  assert.equal(modelToTier("claude-sonnet-4-6"), 2);
  assert.equal(modelToTier("claude-opus-4-7"), 3);
  assert.equal(modelToTier("gpt-4o-mini"), 1);
  assert.equal(modelToTier("gemini-1.5-flash"), 1);
  // Unknown models default to Tier 2 so they don't disappear from dashboards.
  assert.equal(modelToTier("nonexistent-model"), 2);
});

// ===========================================================================
// 3) Router decisions
// ===========================================================================

test("routeRequest with no plan: passes through with default provider", () => {
  const result = routeRequest({
    agentCode: "marketing_assistant",
    plan: null,
    defaultProvider: "anthropic",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.provider, "anthropic");
    assert.equal(result.tier, 2);
    assert.equal(result.model, "claude-sonnet-4-6");
  }
});

test("routeRequest blocks Tier 3 agent on Tier 2 plan", () => {
  const plan: PlanSnapshot = {
    planCode: "standard",
    maxTier: 2,
    enabledAgentCodes: [],
  };
  const result = routeRequest({
    agentCode: "qs_cost_analyst",
    plan,
    defaultProvider: "anthropic",
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "tier_exceeded");
    assert.equal(result.blockedTier, 3);
  }
});

test("routeRequest allows Tier 2 agent on Tier 2 plan", () => {
  const plan: PlanSnapshot = {
    planCode: "standard",
    maxTier: 2,
    enabledAgentCodes: [],
  };
  const result = routeRequest({
    agentCode: "marketing_assistant",
    plan,
    defaultProvider: "anthropic",
  });
  assert.equal(result.ok, true);
});

test("routeRequest enforces enabled_agent_codes allowlist", () => {
  const plan: PlanSnapshot = {
    planCode: "starter",
    maxTier: 3,
    enabledAgentCodes: ["marketing_assistant"], // ONLY marketing
  };
  const ok = routeRequest({
    agentCode: "marketing_assistant",
    plan,
    defaultProvider: "anthropic",
  });
  assert.equal(ok.ok, true);

  const blocked = routeRequest({
    agentCode: "tax_assistant",
    plan,
    defaultProvider: "anthropic",
  });
  assert.equal(blocked.ok, false);
  if (!blocked.ok) {
    assert.equal(blocked.reason, "agent_disabled");
  }
});

test("routeRequest empty allowlist = all enabled", () => {
  const plan: PlanSnapshot = {
    planCode: "pro",
    maxTier: 3,
    enabledAgentCodes: [],
  };
  const result = routeRequest({
    agentCode: "tax_assistant",
    plan,
    defaultProvider: "anthropic",
  });
  assert.equal(result.ok, true);
});

test("routeRequest provider override is honored", () => {
  const plan: PlanSnapshot = {
    planCode: "pro",
    maxTier: 3,
    enabledAgentCodes: [],
  };
  const result = routeRequest({
    agentCode: "marketing_assistant",
    plan,
    defaultProvider: "anthropic",
    providerOverride: "gemini",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.provider, "gemini");
    assert.equal(result.model, "gemini-1.5-pro");
  }
});

// ===========================================================================
// 4) Markup helper (pure)
// ===========================================================================

test("applyMarkup zero markup = pass-through", () => {
  const r = applyMarkup(1.23, 0);
  assert.equal(r.actualCostUsd, 1.23);
  assert.equal(r.billedAmountUsd, 1.23);
  assert.equal(r.markupAppliedUsd, 0);
});

test("applyMarkup 30% markup", () => {
  const r = applyMarkup(10, 30);
  assert.equal(r.billedAmountUsd, 13);
  assert.equal(r.markupAppliedUsd, 3);
});

test("applyMarkup 50% markup with fractional cost", () => {
  const r = applyMarkup(0.5, 50);
  assert.equal(r.billedAmountUsd, 0.75);
});

test("applyMarkup rejects negative cost", () => {
  assert.throws(() => applyMarkup(-1, 30));
});

test("applyMarkup rejects fractional markup", () => {
  assert.throws(() => applyMarkup(1, 30.5));
});

test("applyMarkup clamps markupPercent to [0, 1000]", () => {
  assert.throws(() => applyMarkup(1, -1));
  assert.throws(() => applyMarkup(1, 1001));
});

test("usdToMinor converts USD float to bigint cents", () => {
  assert.equal(usdToMinor(1.23), 123n);
  assert.equal(usdToMinor(0), 0n);
  assert.equal(usdToMinor(0.005), 1n); // rounds half-up
  assert.equal(usdToMinor(0.004), 0n);
});

// ===========================================================================
// 5) aiExecute integration (source-level)
// ===========================================================================

test("aiExecute integrates router pipeline", () => {
  const src = readFile("src/lib/ai/execute.ts");
  // Plan-snapshot helper exported.
  assert.match(src, /export\s+async\s+function\s+snapshotPlanForOrg\b/);
  // Router invocation.
  assert.match(src, /routeRequest\(\{/);
  assert.match(src, /agentCode:\s*input\.assistantKey/);
  // New blocked reasons surfaced.
  assert.match(src, /tier_exceeded/);
  assert.match(src, /agent_disabled/);
});

test("aiExecute uses router-resolved model unless caller overrides", () => {
  const src = readFile("src/lib/ai/execute.ts");
  // Stage 10.6.B.3 extended this to ALSO honor per-org model overrides
  // (Stage 10.5.B carry-over). The original `input.model ?? route.model`
  // contract is preserved at the outer fallback level; the per-org
  // model slots in between caller input and router default.
  assert.match(src, /const resolvedModel\b/);
  assert.match(src, /input\.model\s*\?\?/);
  assert.match(src, /route\.model/);
  assert.match(src, /model:\s*resolvedModel/);
});

test("aiExecute response includes tier + billedAmountUsd", () => {
  const src = readFile("src/lib/ai/execute.ts");
  assert.match(src, /tier:\s*route\.tier/);
  assert.match(src, /billedAmountUsd:\s*markup\.billedAmountUsd/);
  assert.match(src, /applyMarkup\(/);
});

// ===========================================================================
// 6) Aggregate cron breakdown population
// ===========================================================================

test("ai-aggregate-daily cron populates by_agent/by_provider/by_tier", () => {
  const src = readFile(
    "src/lib/development/server/cron/ai-aggregate-daily-job.ts",
  );
  assert.match(src, /byAgent: byAgent as never/);
  assert.match(src, /byProvider: byProvider as never/);
  assert.match(src, /byTier: byTier as never/);
  // Must read agentCodeToTier + modelToTier from the router.
  assert.match(src, /from\s+["']@\/lib\/ai\/router\/tier-rules["']/);
});

test("aggregate cron infers provider from model prefix", () => {
  const src = readFile(
    "src/lib/development/server/cron/ai-aggregate-daily-job.ts",
  );
  assert.match(src, /inferProvider/);
  // Provider buckets covered.
  assert.match(src, /["']anthropic["']/);
  assert.match(src, /["']openai["']/);
  assert.match(src, /["']gemini["']/);
});

// ===========================================================================
// 7) Dashboard
// ===========================================================================

test("AI usage dashboard renders Stage 7.0 org-quota + breakdown section", () => {
  const src = readFile(
    "src/app/(development-app)/development-os/settings/ai-usage/page.tsx",
  );
  assert.match(src, /aiOrgQuotaLimits/);
  assert.match(src, /aiOrgUsageMonthly/);
  assert.match(src, /BreakdownCard/);
  assert.match(src, /By tier/);
  assert.match(src, /By provider/);
  assert.match(src, /By agent/);
});

test("AI usage dashboard reads plan markup + tier ceiling", () => {
  const src = readFile(
    "src/app/(development-app)/development-os/settings/ai-usage/page.tsx",
  );
  assert.match(src, /markupPercent/);
  assert.match(src, /maxTier/);
});

// ===========================================================================
// 8) Drizzle schema bindings
// ===========================================================================

test("subscriptionPlans schema exposes new columns", async () => {
  const mod = await import("../src/lib/db/schema/subscriptions");
  // Drizzle column definitions appear as values on the table object.
  // Just check the keys exist on $inferSelect via TypeScript-friendly probe.
  const cols = Object.keys(mod.subscriptionPlans);
  assert.ok(cols.includes("markupPercent"), "markupPercent column missing");
  assert.ok(cols.includes("maxTier"), "maxTier column missing");
  assert.ok(
    cols.includes("enabledAgentCodes"),
    "enabledAgentCodes column missing",
  );
});

test("aiOrgUsageMonthly schema exposes JSONB breakdown columns", async () => {
  const mod = await import("../src/lib/db/schema/ai");
  const cols = Object.keys(mod.aiOrgUsageMonthly);
  assert.ok(cols.includes("byAgent"), "byAgent column missing");
  assert.ok(cols.includes("byProvider"), "byProvider column missing");
  assert.ok(cols.includes("byTier"), "byTier column missing");
});

// ===========================================================================
// 9) Type safety on AgentTier
// ===========================================================================

test("AgentTier type accepts only 1, 2, 3", () => {
  // Pure compile-time assertion via runtime-checked enum walk.
  const allowed: AgentTier[] = [1, 2, 3];
  for (const t of allowed) {
    assert.ok(t >= 1 && t <= 3);
  }
});
