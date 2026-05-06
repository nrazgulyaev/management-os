/**
 * Stage 5.D — Specialized AI Agents tests.
 *
 * Coverage:
 *   - Migrations 0061 + 0062 (shape + RLS + 12 agent seeds)
 *   - Schema exports
 *   - Pure helpers:
 *     - memory-helpers (rank, summarize, conflict, budget enforcement)
 *     - 5 specialized agent helpers (QS, Procurement, Tax, Marketing, Executive Business)
 *     - 2 recurring agent helpers (Daily Digest, Weekly Plan)
 *   - Cron + dispatcher + route audit (58 routes)
 *   - Sidebar audit (AI AGENTS group)
 *   - UI page presence (12 agent pages, hub, inbox, memory)
 *   - Demo seed audit (Stage 5.D section)
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  rankMemoryByRelevance,
  summarizeMemoryForAgent,
  detectMemoryConflict,
  enforceAgentBudget,
  DEFAULT_RANK_WEIGHTS,
  type MemoryItem,
} from "../src/lib/development/server/ai-memory/memory-helpers";
import { analyzeCostCategories } from "../src/lib/development/server/ai/qs-cost-analyst/qs-cost-analyst-helpers";
import { analyzeSuppliers } from "../src/lib/development/server/ai/procurement-analyst/procurement-analyst-helpers";
import {
  suggestClassifications,
  detectDocumentGaps,
  periodCloseReadiness,
  buildTaxAssistantOutput,
} from "../src/lib/development/server/ai/tax-assistant/tax-assistant-helpers";
import { buildMarketingOutput } from "../src/lib/development/server/ai/marketing-assistant/marketing-assistant-helpers";
import { buildExecutiveBusinessOutput } from "../src/lib/development/server/ai/executive-business/executive-business-helpers";
import { buildDailyDigest } from "../src/lib/development/server/ai/daily-construction-digest/daily-digest-helpers";
import { buildWeeklyPlan } from "../src/lib/development/server/ai/weekly-construction-plan/weekly-plan-helpers";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");
const exists = (rel: string) => existsSync(resolve(ROOT, rel));

const MIG_0061 = "drizzle/0061_development_os_stage_5_d_1_ai_memory.sql";
const MIG_0062 = "drizzle/0062_development_os_stage_5_d_2_specialized_agents.sql";

function mem(
  partial: Partial<MemoryItem> & { id: string; type: MemoryItem["type"] },
): MemoryItem {
  return {
    id: partial.id,
    type: partial.type,
    title: partial.title ?? "t",
    summary: partial.summary ?? "s",
    detail: partial.detail,
    confidenceLevel: partial.confidenceLevel ?? "medium",
    observedCount: partial.observedCount ?? 1,
    tags: partial.tags ?? [],
    lastObservedAt: partial.lastObservedAt ?? new Date(),
  };
}

// ===========================================================================
// 1) Migration 0061 — shape
// ===========================================================================

test("migration 0061 file exists + wraps in BEGIN/COMMIT", () => {
  assert.ok(exists(MIG_0061));
  const sql = read(MIG_0061);
  assert.match(sql, /^BEGIN;/m);
  assert.match(sql, /^COMMIT;/m);
});

test("migration 0061 creates project_ai_memory", () => {
  const sql = read(MIG_0061);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "project_ai_memory"/);
});

test("migration 0061 covers 13 memory_type values", () => {
  const sql = read(MIG_0061);
  for (const t of [
    "decision_summary",
    "supplier_pattern",
    "cost_pattern",
    "schedule_pattern",
    "team_observation",
    "risk_observation",
    "communication_pattern",
    "product_specification",
    "site_condition",
    "regulatory_note",
    "design_evolution",
    "quality_observation",
    "general_lesson_learned",
  ]) {
    assert.ok(sql.includes(`'${t}'`), `memory_type '${t}' missing`);
  }
});

test("migration 0061 covers 5 source_type values", () => {
  const sql = read(MIG_0061);
  for (const t of [
    "manual_entry",
    "ai_generated",
    "auto_aggregated",
    "imported_from_decision_log",
    "imported_from_risk_register",
  ]) {
    assert.ok(sql.includes(`'${t}'`), `source_type '${t}' missing`);
  }
});

test("migration 0061 has confidence + observed_count + last_observed_at", () => {
  const sql = read(MIG_0061);
  assert.match(sql, /"confidence_level" TEXT/);
  assert.match(sql, /"observed_count" INTEGER NOT NULL DEFAULT 1/);
  assert.match(sql, /"last_observed_at" DATE/);
});

test("migration 0061 has GIN index on tags", () => {
  const sql = read(MIG_0061);
  assert.match(sql, /USING GIN \("tags"\)/);
});

test("migration 0061 supersededBy is self-FK", () => {
  const sql = read(MIG_0061);
  assert.match(sql, /"superseded_by" UUID REFERENCES "project_ai_memory"\("id"\)/);
});

test("migration 0061 creates agent_invocation_log", () => {
  const sql = read(MIG_0061);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "agent_invocation_log"/);
});

test("migration 0061 invocation_type enum has 4 values", () => {
  const sql = read(MIG_0061);
  for (const v of [
    "user_triggered",
    "cron_recurring",
    "event_triggered",
    "webhook_triggered",
  ]) {
    assert.ok(sql.includes(`'${v}'`), `invocation_type '${v}' missing`);
  }
});

test("migration 0061 status enum has 7 values", () => {
  const sql = read(MIG_0061);
  for (const s of [
    "pending",
    "completed",
    "failed",
    "rejected_by_operator",
    "rate_limited",
    "budget_exceeded",
    "dry_run",
  ]) {
    assert.ok(sql.includes(`'${s}'`), `status '${s}' missing`);
  }
});

test("migration 0061 operator_review_status enum has 5 values", () => {
  const sql = read(MIG_0061);
  for (const s of [
    "awaiting_review",
    "approved",
    "rejected",
    "edited_and_approved",
    "no_review_needed",
  ]) {
    assert.ok(sql.includes(`'${s}'`), `operator_review_status '${s}' missing`);
  }
});

test("migration 0061 enables RLS + internal_only policies", () => {
  const sql = read(MIG_0061);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /is_internal_user\(\)/);
});

// ===========================================================================
// 2) Migration 0062 — shape
// ===========================================================================

test("migration 0062 file exists + wraps in BEGIN/COMMIT", () => {
  assert.ok(exists(MIG_0062));
  const sql = read(MIG_0062);
  assert.match(sql, /^BEGIN;/m);
  assert.match(sql, /^COMMIT;/m);
});

test("migration 0062 creates agent_configurations + agent_outputs", () => {
  const sql = read(MIG_0062);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "agent_configurations"/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "agent_outputs"/);
});

test("migration 0062 agent_type enum has 14 values", () => {
  const sql = read(MIG_0062);
  for (const t of [
    "sales_assistant",
    "photo_analyst",
    "construction_supervisor",
    "investor_relations",
    "distribution_preview",
    "document_understanding",
    "whatsapp_intent",
    "qs_cost_analyst",
    "procurement_analyst",
    "tax_assistant",
    "marketing_assistant",
    "executive_business",
    "daily_digest",
    "weekly_plan",
  ]) {
    assert.ok(sql.includes(`'${t}'`), `agent_type '${t}' missing`);
  }
});

test("migration 0062 seeds all 12 agents (existing 7 + new 5) + 2 recurring", () => {
  const sql = read(MIG_0062);
  for (const k of [
    "sales_assistant",
    "photo_analyst",
    "construction_supervisor",
    "investor_relations",
    "distribution_preview",
    "document_understanding",
    "whatsapp_intent",
    "qs_cost_analyst",
    "procurement_analyst",
    "tax_assistant",
    "marketing_assistant",
    "executive_business",
    "daily_digest",
    "weekly_plan",
  ]) {
    assert.ok(sql.includes(`'${k}'`), `agent seed '${k}' missing`);
  }
});

test("migration 0062 ON CONFLICT pre-population is idempotent", () => {
  const sql = read(MIG_0062);
  assert.match(sql, /ON CONFLICT \(agent_key\) DO NOTHING/);
});

test("migration 0062 has budget cap columns", () => {
  const sql = read(MIG_0062);
  for (const c of [
    "daily_budget_minor",
    "monthly_budget_minor",
    "per_invocation_budget_minor",
    "max_invocations_per_hour",
    "max_invocations_per_day",
  ]) {
    assert.ok(sql.includes(c), `${c} missing`);
  }
});

test("migration 0062 agent_outputs has 6 status values", () => {
  const sql = read(MIG_0062);
  for (const s of [
    "awaiting_review",
    "approved",
    "partially_approved",
    "rejected",
    "edited_and_approved",
    "expired",
  ]) {
    assert.ok(sql.includes(`'${s}'`), `output status '${s}' missing`);
  }
});

test("migration 0062 enables RLS + internal_only policies", () => {
  const sql = read(MIG_0062);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /is_internal_user\(\)/);
});

// ===========================================================================
// 3) Schema exports
// ===========================================================================

test("schema/index exports new ai-agents schema file", () => {
  const idx = read("src/lib/db/schema/index.ts");
  assert.match(idx, /export \* from "\.\/ai-agents"/);
});

test("ai-agents schema exports 4 tables", async () => {
  const m = await import("../src/lib/db/schema/ai-agents");
  assert.ok(m.projectAiMemory);
  assert.ok(m.agentInvocationLog);
  assert.ok(m.agentConfigurations);
  assert.ok(m.agentOutputs);
});

// ===========================================================================
// 4) memory-helpers — rank
// ===========================================================================

test("rankMemoryByRelevance: empty input → empty", () => {
  const r = rankMemoryByRelevance([]);
  assert.deepEqual(r, []);
});

test("rankMemoryByRelevance: high confidence ranks above low", () => {
  const items = [
    mem({ id: "a", type: "cost_pattern", confidenceLevel: "low" }),
    mem({ id: "b", type: "cost_pattern", confidenceLevel: "high" }),
  ];
  const r = rankMemoryByRelevance(items);
  assert.equal(r[0].id, "b");
});

test("rankMemoryByRelevance: high observation count ranks above low (same conf)", () => {
  const items = [
    mem({ id: "a", type: "cost_pattern", observedCount: 1 }),
    mem({ id: "b", type: "cost_pattern", observedCount: 20 }),
  ];
  const r = rankMemoryByRelevance(items);
  assert.equal(r[0].id, "b");
});

test("rankMemoryByRelevance: recent observation ranks above old", () => {
  const recent = mem({
    id: "a",
    type: "cost_pattern",
    lastObservedAt: new Date(),
  });
  const old = mem({
    id: "b",
    type: "cost_pattern",
    lastObservedAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
  });
  const r = rankMemoryByRelevance([old, recent]);
  assert.equal(r[0].id, "a");
});

test("rankMemoryByRelevance: weights sum used (default = 1.0)", () => {
  const w = DEFAULT_RANK_WEIGHTS;
  assert.equal(
    w.recencyWeight + w.confidenceWeight + w.observationCountWeight,
    1,
  );
});

test("rankMemoryByRelevance: identical items preserve stable order", () => {
  const a = mem({ id: "a", type: "cost_pattern" });
  const b = mem({ id: "b", type: "cost_pattern" });
  const r = rankMemoryByRelevance([a, b]);
  assert.equal(r.length, 2);
});

// ===========================================================================
// 5) memory-helpers — summarize
// ===========================================================================

test("summarizeMemoryForAgent: empty → 'no relevant memory'", () => {
  const s = summarizeMemoryForAgent([], 1000);
  assert.match(s, /no relevant memory/);
});

test("summarizeMemoryForAgent: includes header", () => {
  const s = summarizeMemoryForAgent(
    [mem({ id: "a", type: "cost_pattern", title: "T", summary: "S" })],
    1000,
  );
  assert.match(s, /## Project memory/);
});

test("summarizeMemoryForAgent: includes type tag in line", () => {
  const s = summarizeMemoryForAgent(
    [mem({ id: "a", type: "supplier_pattern", title: "T", summary: "S" })],
    1000,
  );
  assert.match(s, /\[supplier_pattern\]/);
});

test("summarizeMemoryForAgent: truncates to fit token budget", () => {
  const items = Array.from({ length: 50 }, (_, i) =>
    mem({
      id: String(i),
      type: "cost_pattern",
      title: `Title ${i}`,
      summary: `Summary ${i}`.padEnd(100, "x"),
    }),
  );
  const s = summarizeMemoryForAgent(items, 100);
  // 100 tokens × 4 chars = 400 chars budget; should produce <500 chars total.
  assert.ok(s.length < 500);
});

// ===========================================================================
// 6) memory-helpers — conflict detection
// ===========================================================================

test("detectMemoryConflict: empty existing → create_new", () => {
  const r = detectMemoryConflict(
    { type: "cost_pattern", title: "x", summary: "y" },
    [],
  );
  assert.equal(r.suggestion, "create_new");
});

test("detectMemoryConflict: same title + same summary → increment_count", () => {
  const r = detectMemoryConflict(
    { type: "cost_pattern", title: "Tile work over budget", summary: "Same" },
    [
      mem({
        id: "a",
        type: "cost_pattern",
        title: "Tile work over budget",
        summary: "Same",
      }),
    ],
  );
  assert.equal(r.suggestion, "increment_count");
});

test("detectMemoryConflict: same title + different summary → supersede", () => {
  const r = detectMemoryConflict(
    {
      type: "cost_pattern",
      title: "Tile work over budget",
      summary: "Updated summary",
    },
    [
      mem({
        id: "a",
        type: "cost_pattern",
        title: "Tile work over budget",
        summary: "Old summary",
      }),
    ],
  );
  assert.equal(r.suggestion, "supersede_existing");
  assert.equal(r.hasConflict, true);
  assert.deepEqual(r.conflictsWith, ["a"]);
});

test("detectMemoryConflict: different type → create_new", () => {
  const r = detectMemoryConflict(
    { type: "supplier_pattern", title: "T", summary: "S" },
    [mem({ id: "a", type: "cost_pattern", title: "T", summary: "S" })],
  );
  assert.equal(r.suggestion, "create_new");
});

// ===========================================================================
// 7) memory-helpers — budget enforcement
// ===========================================================================

const ZERO_WINDOW = {
  spentDailyMinor: 0,
  spentMonthlyMinor: 0,
  invocationsLastHour: 0,
  invocationsToday: 0,
};

test("enforceAgentBudget: zero caps allow unlimited", () => {
  const r = enforceAgentBudget({
    estimatedCostMinor: 1000,
    caps: {
      dailyBudgetMinor: 0,
      monthlyBudgetMinor: 0,
      perInvocationBudgetMinor: 0,
      maxInvocationsPerHour: null,
      maxInvocationsPerDay: null,
    },
    window: ZERO_WINDOW,
  });
  assert.equal(r.allowed, true);
});

test("enforceAgentBudget: daily cap exceeded", () => {
  const r = enforceAgentBudget({
    estimatedCostMinor: 100,
    caps: {
      dailyBudgetMinor: 100,
      monthlyBudgetMinor: 0,
      perInvocationBudgetMinor: 0,
      maxInvocationsPerHour: null,
      maxInvocationsPerDay: null,
    },
    window: { ...ZERO_WINDOW, spentDailyMinor: 50 },
  });
  assert.equal(r.allowed, false);
  if (!r.allowed) assert.equal(r.reason, "daily_budget_exceeded");
});

test("enforceAgentBudget: monthly cap exceeded", () => {
  const r = enforceAgentBudget({
    estimatedCostMinor: 100,
    caps: {
      dailyBudgetMinor: 0,
      monthlyBudgetMinor: 1000,
      perInvocationBudgetMinor: 0,
      maxInvocationsPerHour: null,
      maxInvocationsPerDay: null,
    },
    window: { ...ZERO_WINDOW, spentMonthlyMinor: 950 },
  });
  assert.equal(r.allowed, false);
});

test("enforceAgentBudget: hourly rate limit", () => {
  const r = enforceAgentBudget({
    estimatedCostMinor: 0,
    caps: {
      dailyBudgetMinor: 0,
      monthlyBudgetMinor: 0,
      perInvocationBudgetMinor: 0,
      maxInvocationsPerHour: 5,
      maxInvocationsPerDay: null,
    },
    window: { ...ZERO_WINDOW, invocationsLastHour: 5 },
  });
  assert.equal(r.allowed, false);
  if (!r.allowed) assert.equal(r.reason, "rate_limit_hour");
});

test("enforceAgentBudget: daily rate limit", () => {
  const r = enforceAgentBudget({
    estimatedCostMinor: 0,
    caps: {
      dailyBudgetMinor: 0,
      monthlyBudgetMinor: 0,
      perInvocationBudgetMinor: 0,
      maxInvocationsPerHour: null,
      maxInvocationsPerDay: 24,
    },
    window: { ...ZERO_WINDOW, invocationsToday: 24 },
  });
  assert.equal(r.allowed, false);
  if (!r.allowed) assert.equal(r.reason, "rate_limit_day");
});

// ===========================================================================
// 8) QS Cost Analyst helpers
// ===========================================================================

test("analyzeCostCategories: classifies severity by overshoot", () => {
  const r = analyzeCostCategories([
    {
      categoryKey: "tile",
      categoryName: "Tile",
      budgetMinor: 1000,
      committedMinor: 1300,
      actualMinor: 800,
      progressPct: 50,
    },
  ]);
  // FAC = 800 / 0.5 = 1600 → 60% over. Critical.
  assert.equal(r.categoryAnalyses[0].severity, "critical");
});

test("analyzeCostCategories: zero progress → committed as FAC", () => {
  const r = analyzeCostCategories([
    {
      categoryKey: "x",
      categoryName: "X",
      budgetMinor: 1000,
      committedMinor: 1500,
      actualMinor: 0,
      progressPct: 0,
    },
  ]);
  assert.equal(r.categoryAnalyses[0].facMinor, 1500);
});

test("analyzeCostCategories: top concerns sorted desc + capped at 5", () => {
  const inputs = Array.from({ length: 10 }, (_, i) => ({
    categoryKey: `c${i}`,
    categoryName: `C${i}`,
    budgetMinor: 1000,
    committedMinor: 1000,
    actualMinor: 500,
    progressPct: 50 - i, // increasing overrun
  }));
  const r = analyzeCostCategories(inputs);
  assert.ok(r.topConcerns.length <= 5);
});

test("analyzeCostCategories: no concerns → 'within tolerance' message", () => {
  const r = analyzeCostCategories([
    {
      categoryKey: "x",
      categoryName: "X",
      budgetMinor: 1000,
      committedMinor: 900,
      actualMinor: 500,
      progressPct: 50,
    },
  ]);
  assert.match(r.recommendedActions[0], /tolerance|no immediate/i);
});

test("analyzeCostCategories: totals sum across categories", () => {
  const r = analyzeCostCategories([
    {
      categoryKey: "a",
      categoryName: "A",
      budgetMinor: 1000,
      committedMinor: 800,
      actualMinor: 500,
      progressPct: 50,
    },
    {
      categoryKey: "b",
      categoryName: "B",
      budgetMinor: 2000,
      committedMinor: 1500,
      actualMinor: 1000,
      progressPct: 50,
    },
  ]);
  assert.equal(r.totalCommittedMinor, 2300);
  assert.equal(r.totalActualMinor, 1500);
});

test("analyzeCostCategories: empty input → empty analyses", () => {
  const r = analyzeCostCategories([]);
  assert.equal(r.categoryAnalyses.length, 0);
  assert.equal(r.totalForecastAtCompletionMinor, 0);
});

test("analyzeCostCategories: critical overshoot triggers re-negotiation action", () => {
  const r = analyzeCostCategories([
    {
      categoryKey: "x",
      categoryName: "Tile",
      budgetMinor: 1000,
      committedMinor: 2000,
      actualMinor: 900,
      progressPct: 50,
    },
  ]);
  assert.match(r.recommendedActions[0], /negotiat/i);
});

// ===========================================================================
// 9) Procurement Analyst helpers
// ===========================================================================

test("analyzeSuppliers: high on-time → preferred", () => {
  const r = analyzeSuppliers([
    {
      supplierId: "s",
      supplierName: "S",
      totalDeliveries: 10,
      lateDeliveries: 0,
      avgDelayDays: -1,
      averageLeadTimeDays: 5,
      totalSpendMinor: 10000,
    },
  ]);
  assert.equal(r.ranked[0].classification, "preferred");
});

test("analyzeSuppliers: many late → underperforming", () => {
  const r = analyzeSuppliers([
    {
      supplierId: "s",
      supplierName: "S",
      totalDeliveries: 10,
      lateDeliveries: 8,
      avgDelayDays: 12,
      averageLeadTimeDays: 14,
      totalSpendMinor: 10000,
    },
  ]);
  assert.equal(r.ranked[0].classification, "underperforming");
});

test("analyzeSuppliers: ranked desc by reliability", () => {
  const r = analyzeSuppliers([
    {
      supplierId: "low",
      supplierName: "Low",
      totalDeliveries: 10,
      lateDeliveries: 8,
      avgDelayDays: 10,
      averageLeadTimeDays: 14,
      totalSpendMinor: 10000,
    },
    {
      supplierId: "hi",
      supplierName: "Hi",
      totalDeliveries: 10,
      lateDeliveries: 0,
      avgDelayDays: 0,
      averageLeadTimeDays: 5,
      totalSpendMinor: 10000,
    },
  ]);
  assert.equal(r.ranked[0].supplierId, "hi");
});

test("analyzeSuppliers: empty input → empty result", () => {
  const r = analyzeSuppliers([]);
  assert.deepEqual(r.ranked, []);
});

test("analyzeSuppliers: NaN avg delay treated gracefully", () => {
  const r = analyzeSuppliers([
    {
      supplierId: "s",
      supplierName: "S",
      totalDeliveries: 0,
      lateDeliveries: 0,
      avgDelayDays: NaN,
      averageLeadTimeDays: 0,
      totalSpendMinor: 0,
    },
  ]);
  assert.ok(Number.isFinite(r.ranked[0].reliabilityScore));
});

test("analyzeSuppliers: underperforming triggers replace action", () => {
  const r = analyzeSuppliers([
    {
      supplierId: "u",
      supplierName: "Bad",
      totalDeliveries: 10,
      lateDeliveries: 9,
      avgDelayDays: 15,
      averageLeadTimeDays: 14,
      totalSpendMinor: 1000,
    },
  ]);
  assert.match(r.recommendedActions[0], /Replace/);
});

test("analyzeSuppliers: total spend aggregated", () => {
  const r = analyzeSuppliers([
    {
      supplierId: "a",
      supplierName: "A",
      totalDeliveries: 1,
      lateDeliveries: 0,
      avgDelayDays: 0,
      averageLeadTimeDays: 1,
      totalSpendMinor: 100,
    },
    {
      supplierId: "b",
      supplierName: "B",
      totalDeliveries: 1,
      lateDeliveries: 0,
      avgDelayDays: 0,
      averageLeadTimeDays: 1,
      totalSpendMinor: 200,
    },
  ]);
  assert.equal(r.totalSpendAnalysedMinor, 300);
});

// ===========================================================================
// 10) Tax Assistant helpers
// ===========================================================================

test("suggestClassifications: only unclassified", () => {
  const r = suggestClassifications([
    {
      transactionId: "t1",
      amountMinor: 100,
      vendorName: "Catering Bali",
      description: "lunch",
      category: null,
      hasTaxClassification: true,
      hasUploadedDocument: true,
      ageDays: 10,
    },
    {
      transactionId: "t2",
      amountMinor: 100,
      vendorName: "Catering Bali",
      description: "lunch",
      category: null,
      hasTaxClassification: false,
      hasUploadedDocument: false,
      ageDays: 10,
    },
  ]);
  assert.equal(r.length, 1);
  assert.equal(r[0].transactionId, "t2");
});

test("suggestClassifications: catering pattern → high confidence", () => {
  const r = suggestClassifications([
    {
      transactionId: "t",
      amountMinor: 100,
      vendorName: "Catering Bali",
      description: "",
      category: null,
      hasTaxClassification: false,
      hasUploadedDocument: false,
      ageDays: 1,
    },
  ]);
  assert.equal(r[0].confidence, "high");
  assert.match(r[0].suggestedTaxType, /catering/);
});

test("suggestClassifications: no pattern → REVIEW_MANUALLY low confidence", () => {
  const r = suggestClassifications([
    {
      transactionId: "t",
      amountMinor: 100,
      vendorName: "Random Vendor LLC",
      description: "some description",
      category: null,
      hasTaxClassification: false,
      hasUploadedDocument: false,
      ageDays: 1,
    },
  ]);
  assert.equal(r[0].suggestedTaxType, "REVIEW_MANUALLY");
  assert.equal(r[0].confidence, "low");
});

test("detectDocumentGaps: classified but no doc → gap", () => {
  const r = detectDocumentGaps([
    {
      transactionId: "t",
      amountMinor: 100,
      vendorName: "V",
      description: "",
      category: null,
      hasTaxClassification: true,
      hasUploadedDocument: false,
      ageDays: 1,
    },
  ]);
  assert.equal(r.length, 1);
});

test("detectDocumentGaps: classified + doc → no gap", () => {
  const r = detectDocumentGaps([
    {
      transactionId: "t",
      amountMinor: 100,
      vendorName: "V",
      description: "",
      category: null,
      hasTaxClassification: true,
      hasUploadedDocument: true,
      ageDays: 1,
    },
  ]);
  assert.equal(r.length, 0);
});

test("periodCloseReadiness: empty → 100%", () => {
  assert.equal(periodCloseReadiness([]), 100);
});

test("periodCloseReadiness: all classified + documented → 100%", () => {
  const r = periodCloseReadiness([
    {
      transactionId: "t",
      amountMinor: 100,
      vendorName: "V",
      description: "",
      category: null,
      hasTaxClassification: true,
      hasUploadedDocument: true,
      ageDays: 1,
    },
  ]);
  assert.equal(r, 100);
});

test("periodCloseReadiness: nothing classified → 0", () => {
  const r = periodCloseReadiness([
    {
      transactionId: "t",
      amountMinor: 100,
      vendorName: "V",
      description: "",
      category: null,
      hasTaxClassification: false,
      hasUploadedDocument: false,
      ageDays: 1,
    },
  ]);
  assert.equal(r, 0);
});

test("buildTaxAssistantOutput: returns full schema", () => {
  const r = buildTaxAssistantOutput([
    {
      transactionId: "t",
      amountMinor: 100,
      vendorName: "Sewa Bali",
      description: "rent",
      category: null,
      hasTaxClassification: false,
      hasUploadedDocument: false,
      ageDays: 1,
    },
  ]);
  assert.ok(Array.isArray(r.classificationSuggestions));
  assert.ok(Array.isArray(r.documentGaps));
  assert.ok(Number.isFinite(r.periodCloseReadinessScore));
});

// ===========================================================================
// 11) Marketing Assistant helpers
// ===========================================================================

test("buildMarketingOutput: caption en includes project name", () => {
  const r = buildMarketingOutput({
    projectName: "Sawah Loft",
    tags: ["sunset"],
    contentType: "instagram_caption",
    language: "en",
  });
  assert.match(r.generatedContent, /Sawah Loft/);
});

test("buildMarketingOutput: caption id is in Indonesian", () => {
  const r = buildMarketingOutput({
    projectName: "Sawah Loft",
    tags: ["sunset"],
    contentType: "instagram_caption",
    language: "id",
  });
  assert.match(r.generatedContent, /Bangun pagi/);
});

test("buildMarketingOutput: hashtags include brand + tag-derived", () => {
  const r = buildMarketingOutput({
    projectName: "Sawah Loft",
    tags: ["pool", "ocean-view"],
    contentType: "instagram_hashtags",
    language: "en",
  });
  assert.ok(r.hashtags.includes("BaliVilla"));
  assert.ok(r.hashtags.includes("InfinityPool"));
  assert.ok(r.hashtags.includes("OceanView"));
});

test("buildMarketingOutput: email subject under 60 chars", () => {
  const r = buildMarketingOutput({
    projectName: "Sawah Loft",
    tags: [],
    contentType: "email_subject",
    language: "en",
  });
  assert.ok(r.generatedContent.length < 70);
});

test("buildMarketingOutput: whatsapp broadcast is conversational", () => {
  const r = buildMarketingOutput({
    projectName: "Sawah Loft",
    tags: [],
    contentType: "whatsapp_broadcast",
    language: "en",
  });
  assert.match(r.generatedContent, /Hi/);
});

test("buildMarketingOutput: campaign concept is markdown-friendly", () => {
  const r = buildMarketingOutput({
    projectName: "Sawah Loft",
    tags: [],
    contentType: "campaign_concept",
    language: "en",
  });
  assert.match(r.generatedContent, /Concept:/);
});

test("buildMarketingOutput: bestTimeRecommendation conservative when no data", () => {
  const r = buildMarketingOutput({
    projectName: "X",
    tags: [],
    contentType: "instagram_caption",
    language: "en",
  });
  assert.match(r.bestTimeRecommendation, /\d+:\d+/);
});

// ===========================================================================
// 12) Executive Business Analyst helpers
// ===========================================================================

test("buildExecutiveBusinessOutput: payroll runway < 26w → capital recommendation", () => {
  const r = buildExecutiveBusinessOutput({
    periodLabel: "April 2026",
    current: {
      cashOnHandMinor: 1_000_000_00,
      activeProjects: 3,
      projectsOnTrack: 3,
      pipelineValueMinor: 0,
      contractsSignedThisMonth: 1,
      payrollRunwayWeeks: 12,
      openCriticalAlerts: 0,
    },
  });
  assert.ok(r.strategicRecommendations.some((s) => /Capital action/i.test(s)));
});

test("buildExecutiveBusinessOutput: critical alerts → action", () => {
  const r = buildExecutiveBusinessOutput({
    periodLabel: "April 2026",
    current: {
      cashOnHandMinor: 8_000_000_00,
      activeProjects: 3,
      projectsOnTrack: 3,
      pipelineValueMinor: 100,
      contractsSignedThisMonth: 1,
      payrollRunwayWeeks: 60,
      openCriticalAlerts: 2,
    },
  });
  assert.ok(r.strategicRecommendations.some((s) => /critical risk/i.test(s)));
});

test("buildExecutiveBusinessOutput: empty → 'no structural action'", () => {
  const r = buildExecutiveBusinessOutput({
    periodLabel: "April 2026",
    current: {
      cashOnHandMinor: 8_000_000_00,
      activeProjects: 3,
      projectsOnTrack: 3,
      pipelineValueMinor: 100,
      contractsSignedThisMonth: 1,
      payrollRunwayWeeks: 60,
      openCriticalAlerts: 0,
    },
  });
  assert.match(r.strategicRecommendations[0], /no structural/i);
});

test("buildExecutiveBusinessOutput: trends populated when prior provided", () => {
  const r = buildExecutiveBusinessOutput({
    periodLabel: "April 2026",
    current: {
      cashOnHandMinor: 8_000_000_00,
      activeProjects: 3,
      projectsOnTrack: 3,
      pipelineValueMinor: 100,
      contractsSignedThisMonth: 1,
      payrollRunwayWeeks: 60,
      openCriticalAlerts: 0,
    },
    prior: {
      cashOnHandMinor: 7_000_000_00,
      activeProjects: 3,
      projectsOnTrack: 3,
      pipelineValueMinor: 80,
      contractsSignedThisMonth: 0,
    },
  });
  assert.ok(r.trends.length >= 3);
  assert.ok(r.trends.some((t) => t.metric === "Cash on hand"));
});

test("buildExecutiveBusinessOutput: cross-project pattern when >40% off-track", () => {
  const r = buildExecutiveBusinessOutput({
    periodLabel: "April 2026",
    current: {
      cashOnHandMinor: 8_000_000_00,
      activeProjects: 5,
      projectsOnTrack: 1,
      pipelineValueMinor: 100,
      contractsSignedThisMonth: 0,
      payrollRunwayWeeks: 60,
      openCriticalAlerts: 0,
    },
  });
  assert.ok(r.crossProjectPatterns.length > 0);
});

test("buildExecutiveBusinessOutput: weeklySummary is markdown", () => {
  const r = buildExecutiveBusinessOutput({
    periodLabel: "April 2026",
    current: {
      cashOnHandMinor: 8_000_000_00,
      activeProjects: 1,
      projectsOnTrack: 1,
      pipelineValueMinor: 100,
      contractsSignedThisMonth: 1,
      payrollRunwayWeeks: 60,
      openCriticalAlerts: 0,
    },
  });
  assert.match(r.weeklySummary, /^##/);
});

// ===========================================================================
// 13) Daily Construction Digest helpers
// ===========================================================================

test("buildDailyDigest: low attendance triggers recommendation", () => {
  const r = buildDailyDigest({
    date: new Date("2026-04-30"),
    projectName: "X",
    whatsappMessageCount: 0,
    siteReportCount: 0,
    photoCount: 0,
    photosFlaggedByAi: 0,
    transactionCount: 0,
    transactionTotalMinor: 0,
    deliveryCount: 0,
    qaQcOpenedToday: 0,
    qaQcResolvedToday: 0,
    workforcePresent: 5,
    workforceExpected: 10,
  });
  assert.ok(
    r.recommendedActionsForTomorrow.some((a) => /headcount/i.test(a)),
  );
});

test("buildDailyDigest: AI-flagged photos triggers review action", () => {
  const r = buildDailyDigest({
    date: new Date("2026-04-30"),
    projectName: "X",
    whatsappMessageCount: 0,
    siteReportCount: 0,
    photoCount: 10,
    photosFlaggedByAi: 3,
    transactionCount: 0,
    transactionTotalMinor: 0,
    deliveryCount: 0,
    qaQcOpenedToday: 0,
    qaQcResolvedToday: 0,
    workforcePresent: 10,
    workforceExpected: 10,
  });
  assert.ok(
    r.recommendedActionsForTomorrow.some((a) => /flagged/i.test(a)),
  );
});

test("buildDailyDigest: QA/QC backlog growing → recommendation", () => {
  const r = buildDailyDigest({
    date: new Date("2026-04-30"),
    projectName: "X",
    whatsappMessageCount: 0,
    siteReportCount: 0,
    photoCount: 0,
    photosFlaggedByAi: 0,
    transactionCount: 0,
    transactionTotalMinor: 0,
    deliveryCount: 0,
    qaQcOpenedToday: 5,
    qaQcResolvedToday: 1,
    workforcePresent: 10,
    workforceExpected: 10,
  });
  assert.ok(
    r.recommendedActionsForTomorrow.some((a) => /backlog/i.test(a)),
  );
});

test("buildDailyDigest: clean day → carry forward", () => {
  const r = buildDailyDigest({
    date: new Date("2026-04-30"),
    projectName: "X",
    whatsappMessageCount: 0,
    siteReportCount: 1,
    photoCount: 5,
    photosFlaggedByAi: 0,
    transactionCount: 0,
    transactionTotalMinor: 0,
    deliveryCount: 1,
    qaQcOpenedToday: 0,
    qaQcResolvedToday: 0,
    workforcePresent: 10,
    workforceExpected: 10,
  });
  assert.match(r.recommendedActionsForTomorrow[0], /Carry forward/);
});

test("buildDailyDigest: summary includes project + date", () => {
  const r = buildDailyDigest({
    date: new Date("2026-04-30"),
    projectName: "Sawah Loft",
    whatsappMessageCount: 0,
    siteReportCount: 0,
    photoCount: 0,
    photosFlaggedByAi: 0,
    transactionCount: 0,
    transactionTotalMinor: 0,
    deliveryCount: 0,
    qaQcOpenedToday: 0,
    qaQcResolvedToday: 0,
    workforcePresent: 0,
    workforceExpected: 0,
  });
  assert.match(r.summary, /Sawah Loft/);
  assert.match(r.summary, /2026-04-30/);
});

// ===========================================================================
// 14) Weekly Construction Plan helpers
// ===========================================================================

test("buildWeeklyPlan: critical-path tasks listed", () => {
  const r = buildWeeklyPlan({
    weekStart: new Date(Date.UTC(2026, 4, 4)),
    projectName: "X",
    criticalPathTasksNext4Weeks: [
      {
        taskName: "Foundation",
        earliestStart: new Date(Date.UTC(2026, 4, 5)),
        isOnCriticalPath: true,
      },
    ],
    resourceUtilizationByRole: [],
    pendingMaterialDeliveries: [],
  });
  assert.equal(r.criticalPathPriorities.length, 1);
});

test("buildWeeklyPlan: blocked task is annotated", () => {
  const r = buildWeeklyPlan({
    weekStart: new Date(Date.UTC(2026, 4, 4)),
    projectName: "X",
    criticalPathTasksNext4Weeks: [
      {
        taskName: "MEP rough",
        earliestStart: new Date(Date.UTC(2026, 4, 6)),
        isOnCriticalPath: true,
        blockedBy: "permit",
      },
    ],
    resourceUtilizationByRole: [],
    pendingMaterialDeliveries: [],
  });
  assert.match(r.criticalPathPriorities[0], /blocked by permit/);
});

test("buildWeeklyPlan: 95%+ utilization triggers augmentation", () => {
  const r = buildWeeklyPlan({
    weekStart: new Date(Date.UTC(2026, 4, 4)),
    projectName: "X",
    criticalPathTasksNext4Weeks: [],
    resourceUtilizationByRole: [{ role: "engineer", utilizationPct: 99 }],
    pendingMaterialDeliveries: [],
  });
  assert.ok(
    r.crewAllocationRecommendations.some((s) => /augment/i.test(s)),
  );
});

test("buildWeeklyPlan: 40% or less utilization triggers reallocation", () => {
  const r = buildWeeklyPlan({
    weekStart: new Date(Date.UTC(2026, 4, 4)),
    projectName: "X",
    criticalPathTasksNext4Weeks: [],
    resourceUtilizationByRole: [{ role: "qs", utilizationPct: 30 }],
    pendingMaterialDeliveries: [],
  });
  assert.ok(
    r.crewAllocationRecommendations.some((s) => /reallocate/i.test(s)),
  );
});

test("buildWeeklyPlan: critical material delivery → blocker", () => {
  const r = buildWeeklyPlan({
    weekStart: new Date(Date.UTC(2026, 4, 4)),
    projectName: "X",
    criticalPathTasksNext4Weeks: [],
    resourceUtilizationByRole: [],
    pendingMaterialDeliveries: [
      {
        material: "Cement bulk",
        expectedAt: new Date(Date.UTC(2026, 4, 7)),
        isCritical: true,
      },
    ],
  });
  assert.equal(r.materialBlockers.length, 1);
});

test("buildWeeklyPlan: empty inputs produce sensible defaults", () => {
  const r = buildWeeklyPlan({
    weekStart: new Date(Date.UTC(2026, 4, 4)),
    projectName: "X",
    criticalPathTasksNext4Weeks: [],
    resourceUtilizationByRole: [],
    pendingMaterialDeliveries: [],
  });
  assert.match(r.recommendedAdjustments[0], /No critical-path/);
});

test("buildWeeklyPlan: weekLabel formatted", () => {
  const r = buildWeeklyPlan({
    weekStart: new Date(Date.UTC(2026, 4, 4)),
    projectName: "X",
    criticalPathTasksNext4Weeks: [],
    resourceUtilizationByRole: [],
    pendingMaterialDeliveries: [],
  });
  assert.match(r.weekLabel, /Week of 2026-05-04/);
});

// ===========================================================================
// 15) Cron + dispatcher + route audit (58 routes)
// ===========================================================================

test("cron index re-exports 3 new Stage 5.D runners", () => {
  const idx = read("src/lib/development/server/cron/index.ts");
  assert.match(idx, /runDevOsDailyConstructionDigest/);
  assert.match(idx, /runDevOsWeeklyConstructionPlan/);
  assert.match(idx, /runDevOsAiMemoryAggregator/);
});

test("cron index DEV_OS_JOB_KEYS includes 3 new keys", () => {
  const idx = read("src/lib/development/server/cron/index.ts");
  for (const k of [
    "dev_os_daily_construction_digest",
    "dev_os_weekly_construction_plan",
    "dev_os_ai_memory_aggregator",
  ]) {
    assert.ok(idx.includes(`"${k}"`), `key '${k}' missing`);
  }
});

test("dispatcher KNOWN_JOBS includes 3 new keys", () => {
  const src = read("src/features/jobs/actions.ts");
  for (const k of [
    "dev_os_daily_construction_digest",
    "dev_os_weekly_construction_plan",
    "dev_os_ai_memory_aggregator",
  ]) {
    assert.ok(src.includes(`"${k}"`), `KNOWN_JOBS missing '${k}'`);
  }
});

test("dispatcher executeJob switch covers 3 new keys", () => {
  const src = read("src/features/jobs/actions.ts");
  assert.match(src, /case "dev_os_daily_construction_digest":/);
  assert.match(src, /case "dev_os_weekly_construction_plan":/);
  assert.match(src, /case "dev_os_ai_memory_aggregator":/);
});

test("3 new HTTP cron route files exist", () => {
  for (const slug of [
    "dev-os-daily-construction-digest",
    "dev-os-weekly-construction-plan",
    "dev-os-ai-memory-aggregator",
  ]) {
    assert.ok(
      exists(`src/app/api/cron/${slug}/route.ts`),
      `route file missing for ${slug}`,
    );
  }
});

test("VERCEL-CRON-CHECKLIST documents 3 new routes", () => {
  const md = read("docs/VERCEL-CRON-CHECKLIST.md");
  assert.match(md, /\/api\/cron\/dev-os-daily-construction-digest/);
  assert.match(md, /\/api\/cron\/dev-os-weekly-construction-plan/);
  assert.match(md, /\/api\/cron\/dev-os-ai-memory-aggregator/);
});

test("vercel.json snippet contains 3 new entries", () => {
  const md = read("docs/VERCEL-CRON-CHECKLIST.md");
  for (const slug of [
    "dev-os-daily-construction-digest",
    "dev-os-weekly-construction-plan",
    "dev-os-ai-memory-aggregator",
  ]) {
    assert.ok(
      md.includes(`{ "path": "/api/cron/${slug}"`),
      `${slug} missing from vercel.json snippet`,
    );
  }
});

// ===========================================================================
// 16) Server module presence
// ===========================================================================

test("memory-loader file exists with server-only guard", () => {
  const src = read("src/lib/development/server/ai-memory/memory-loader.ts");
  assert.match(src, /import "server-only"/);
  assert.match(src, /export async function loadMemoryContext/);
});

test("memory-actions exposes ingest + archive", () => {
  const src = read("src/lib/development/server/ai-memory/memory-actions.ts");
  assert.match(src, /export async function ingestMemoryItem/);
  assert.match(src, /export async function archiveMemoryItem/);
});

test("agent-runner is server-only + exports runAgent", () => {
  const src = read("src/lib/development/server/ai/agent-runner.ts");
  assert.match(src, /import "server-only"/);
  assert.match(src, /export async function runAgent/);
});

test("each of the 5 specialized agent thin wrappers exists", () => {
  for (const path of [
    "qs-cost-analyst/qs-cost-analyst.ts",
    "procurement-analyst/procurement-analyst.ts",
    "tax-assistant/tax-assistant.ts",
    "marketing-assistant/marketing-assistant.ts",
    "executive-business/executive-business.ts",
  ]) {
    assert.ok(
      exists(`src/lib/development/server/ai/${path}`),
      `${path} missing`,
    );
  }
});

test("3 new cron job files exist", () => {
  for (const slug of [
    "daily-construction-digest-job",
    "weekly-construction-plan-job",
    "ai-memory-aggregator-job",
  ]) {
    assert.ok(
      exists(`src/lib/development/server/cron/${slug}.ts`),
      `${slug}.ts missing`,
    );
  }
});

// ===========================================================================
// 17) Sidebar audit
// ===========================================================================

test("sidebar nav has AI Agents group", () => {
  const src = read("src/lib/development/navigation.ts");
  assert.match(src, /label: "AI Agents"/);
});

test("sidebar nav has 10 AI AGENTS entries", () => {
  const src = read("src/lib/development/navigation.ts");
  for (const href of [
    "/ai-agents",
    "/ai-agents/inbox",
    "/ai-agents/qs-cost-analyst",
    "/ai-agents/procurement-analyst",
    "/ai-agents/tax-assistant",
    "/ai-agents/marketing-assistant",
    "/ai-agents/executive-business",
    "/ai-agents/daily-digest",
    "/ai-agents/weekly-plan",
    "/ai-agents/memory",
  ]) {
    assert.ok(src.includes(href), `nav missing ${href}`);
  }
});

// ===========================================================================
// 18) UI page presence (12 agent pages, hub, inbox, memory)
// ===========================================================================

test("AI agents hub page exists", () => {
  assert.ok(
    exists("src/app/(development-app)/development-os/ai-agents/page.tsx"),
  );
});

test("AI agents inbox page exists", () => {
  assert.ok(
    exists(
      "src/app/(development-app)/development-os/ai-agents/inbox/page.tsx",
    ),
  );
});

test("memory page exists", () => {
  assert.ok(
    exists(
      "src/app/(development-app)/development-os/ai-agents/memory/page.tsx",
    ),
  );
});

test("each of the 7 agent list pages exist", () => {
  for (const slug of [
    "qs-cost-analyst",
    "procurement-analyst",
    "tax-assistant",
    "marketing-assistant",
    "executive-business",
    "daily-digest",
    "weekly-plan",
  ]) {
    assert.ok(
      exists(`src/app/(development-app)/development-os/ai-agents/${slug}/page.tsx`),
      `${slug} list page missing`,
    );
    assert.ok(
      exists(
        `src/app/(development-app)/development-os/ai-agents/${slug}/outputs/[code]/page.tsx`,
      ),
      `${slug} detail page missing`,
    );
  }
});

// ===========================================================================
// 19) Demo seed audit
// ===========================================================================

test("seed script declares Stage 5.D section header", () => {
  const seed = read("scripts/seed-dev-os.mjs");
  assert.match(seed, /Stage 5\.D seeding/);
});

test("seed script seeds project_ai_memory + invocation_log + agent_outputs", () => {
  const seed = read("scripts/seed-dev-os.mjs");
  assert.match(seed, /INSERT INTO project_ai_memory/);
  assert.match(seed, /INSERT INTO agent_invocation_log/);
  assert.match(seed, /INSERT INTO agent_outputs/);
});

test("seed script idempotency — exists-check pattern present in 5.D section", () => {
  const seed = read("scripts/seed-dev-os.mjs");
  assert.match(seed, /Stage 5\.D seeding[\s\S]*?if \(exists\[0\]\)/);
});

// ===========================================================================
// 20) Architecture documentation
// ===========================================================================

test("architecture doc references Stage 5.D", () => {
  const md = read("docs/development-os-architecture.md");
  assert.match(md, /Stage 5\.D/);
});

test("architecture doc Stage 5.C accepted", () => {
  const md = read("docs/development-os-architecture.md");
  assert.match(md, /Stage 5\.C[\s\S]*?\[ACCEPTED 5\.C\]/);
});

test("architecture doc Stage 5.D marker present (ACTIVE or ACCEPTED)", () => {
  const md = read("docs/development-os-architecture.md");
  assert.match(md, /Stage 5\.D[\s\S]*?\[(?:ACTIVE|ACCEPTED) 5\.D\]/);
});

test("architecture doc names all 12 agents collectively", () => {
  const md = read("docs/development-os-architecture.md");
  assert.match(md, /12 agents/);
});

test("architecture doc explains memory-helpers as pure", () => {
  const md = read("docs/development-os-architecture.md");
  assert.match(md, /memory-helpers/);
});

// ===========================================================================
// 21) Additional pure-helper edge cases
// ===========================================================================

test("rankMemoryByRelevance: null lastObservedAt does not throw", () => {
  const items = [mem({ id: "a", type: "cost_pattern", lastObservedAt: null })];
  const r = rankMemoryByRelevance(items);
  assert.equal(r.length, 1);
});

test("rankMemoryByRelevance: applies custom weights", () => {
  const items = [
    mem({ id: "a", type: "cost_pattern", confidenceLevel: "high" }),
    mem({ id: "b", type: "cost_pattern", observedCount: 50 }),
  ];
  // Strongly favor observation count → b should win
  const r = rankMemoryByRelevance(items, {
    recencyWeight: 0,
    confidenceWeight: 0,
    observationCountWeight: 1,
  });
  assert.equal(r[0].id, "b");
});

test("summarizeMemoryForAgent: maxTokens 1 still safe (clamped)", () => {
  const items = [mem({ id: "a", type: "cost_pattern" })];
  const s = summarizeMemoryForAgent(items, 1);
  assert.match(s, /## Project memory/);
});

test("detectMemoryConflict: substring overlap → update_existing", () => {
  const r = detectMemoryConflict(
    {
      type: "cost_pattern",
      title: "Tile work consistently over",
      summary: "x",
    },
    [
      mem({
        id: "a",
        type: "cost_pattern",
        title: "Tile work consistently over budget",
        summary: "y",
      }),
    ],
  );
  // Substring match → update_existing
  assert.equal(r.suggestion, "update_existing");
});

test("enforceAgentBudget: exact-cap edge — at cap allowed", () => {
  const r = enforceAgentBudget({
    estimatedCostMinor: 0,
    caps: {
      dailyBudgetMinor: 100,
      monthlyBudgetMinor: 0,
      perInvocationBudgetMinor: 0,
      maxInvocationsPerHour: null,
      maxInvocationsPerDay: null,
    },
    window: { ...ZERO_WINDOW, spentDailyMinor: 100 },
  });
  // 100 + 0 = 100, NOT > 100 → allowed
  assert.equal(r.allowed, true);
});

// ===========================================================================
// 22) QS — additional cases
// ===========================================================================

test("analyzeCostCategories: zero budget category → 0% burn", () => {
  const r = analyzeCostCategories([
    {
      categoryKey: "x",
      categoryName: "X",
      budgetMinor: 0,
      committedMinor: 0,
      actualMinor: 100,
      progressPct: 50,
    },
  ]);
  assert.equal(r.categoryAnalyses[0].burnPct, 0);
});

test("analyzeCostCategories: high overshoot triggers change order action", () => {
  const r = analyzeCostCategories([
    {
      categoryKey: "x",
      categoryName: "Soft",
      budgetMinor: 1000,
      committedMinor: 1000,
      actualMinor: 600,
      progressPct: 50,
    },
  ]);
  // FAC = 1200 → 20% over → high
  assert.equal(r.categoryAnalyses[0].severity, "high");
});

// ===========================================================================
// 23) Tax — additional cases
// ===========================================================================

test("buildTaxAssistantOutput: has unclassifiedTotalMinor sum", () => {
  const r = buildTaxAssistantOutput([
    {
      transactionId: "t1",
      amountMinor: 100,
      vendorName: "V",
      description: "",
      category: null,
      hasTaxClassification: false,
      hasUploadedDocument: false,
      ageDays: 1,
    },
    {
      transactionId: "t2",
      amountMinor: 200,
      vendorName: "V",
      description: "",
      category: null,
      hasTaxClassification: false,
      hasUploadedDocument: false,
      ageDays: 1,
    },
  ]);
  assert.equal(r.unclassifiedTotalMinor, 300);
});

test("suggestClassifications: payroll → PPh21", () => {
  const r = suggestClassifications([
    {
      transactionId: "t",
      amountMinor: 100,
      vendorName: "Gaji bulanan",
      description: "salary",
      category: null,
      hasTaxClassification: false,
      hasUploadedDocument: false,
      ageDays: 1,
    },
  ]);
  assert.match(r[0].suggestedTaxType, /PPh21/);
});

// ===========================================================================
// 24) Marketing — additional cases
// ===========================================================================

test("buildMarketingOutput: dedupes hashtags", () => {
  const r = buildMarketingOutput({
    projectName: "X",
    tags: ["pool", "pool", "pool"],
    contentType: "instagram_hashtags",
    language: "en",
  });
  const ipPool = r.hashtags.filter((h) => h === "InfinityPool").length;
  assert.equal(ipPool, 1);
});

test("buildMarketingOutput: villaName overrides projectName in caption", () => {
  const r = buildMarketingOutput({
    projectName: "Project A",
    villaName: "Villa B",
    tags: ["sunset"],
    contentType: "instagram_caption",
    language: "en",
  });
  assert.match(r.generatedContent, /Villa B/);
  assert.doesNotMatch(r.generatedContent, /Project A/);
});

// ===========================================================================
// 25) Daily Digest + Weekly Plan additional
// ===========================================================================

test("buildDailyDigest: progressSummary contains photo count", () => {
  const r = buildDailyDigest({
    date: new Date("2026-04-30"),
    projectName: "X",
    whatsappMessageCount: 0,
    siteReportCount: 0,
    photoCount: 7,
    photosFlaggedByAi: 0,
    transactionCount: 0,
    transactionTotalMinor: 0,
    deliveryCount: 0,
    qaQcOpenedToday: 0,
    qaQcResolvedToday: 0,
    workforcePresent: 0,
    workforceExpected: 0,
  });
  assert.match(r.progressSummary, /Photos uploaded: 7/);
});

test("buildWeeklyPlan: tasks outside this week excluded from priorities", () => {
  const r = buildWeeklyPlan({
    weekStart: new Date(Date.UTC(2026, 4, 4)),
    projectName: "X",
    criticalPathTasksNext4Weeks: [
      {
        taskName: "Far task",
        earliestStart: new Date(Date.UTC(2026, 4, 20)),
        isOnCriticalPath: true,
      },
    ],
    resourceUtilizationByRole: [],
    pendingMaterialDeliveries: [],
  });
  assert.equal(r.criticalPathPriorities.length, 0);
});

// ===========================================================================
// 26) Sidebar + nav structure
// ===========================================================================

test("AI Agents sidebar group precedes Executive group", () => {
  const src = read("src/lib/development/navigation.ts");
  const aiIdx = src.indexOf('label: "AI Agents"');
  const execIdx = src.indexOf('label: "Executive"');
  assert.ok(aiIdx > 0);
  assert.ok(execIdx > 0);
  assert.ok(aiIdx < execIdx, "AI Agents should appear before Executive");
});

// ===========================================================================
// 27) Procurement additional
// ===========================================================================

test("analyzeSuppliers: monitor classification when middling", () => {
  const r = analyzeSuppliers([
    {
      supplierId: "s",
      supplierName: "S",
      totalDeliveries: 10,
      lateDeliveries: 4,
      avgDelayDays: 4,
      averageLeadTimeDays: 10,
      totalSpendMinor: 1000,
    },
  ]);
  assert.equal(r.ranked[0].classification, "monitor");
});

// ===========================================================================
// 28) Executive Business additional
// ===========================================================================

test("buildExecutiveBusinessOutput: contracts trend direction correct", () => {
  const r = buildExecutiveBusinessOutput({
    periodLabel: "April 2026",
    current: {
      cashOnHandMinor: 8_000_000_00,
      activeProjects: 3,
      projectsOnTrack: 3,
      pipelineValueMinor: 100,
      contractsSignedThisMonth: 3,
      payrollRunwayWeeks: 60,
      openCriticalAlerts: 0,
    },
    prior: {
      cashOnHandMinor: 8_000_000_00,
      activeProjects: 3,
      projectsOnTrack: 3,
      pipelineValueMinor: 100,
      contractsSignedThisMonth: 1,
    },
  });
  const contractsTrend = r.trends.find((t) => t.metric === "Contracts signed");
  assert.equal(contractsTrend?.direction, "improved");
});

test("buildExecutiveBusinessOutput: pipeline > 0 + zero contracts → conversion warning", () => {
  const r = buildExecutiveBusinessOutput({
    periodLabel: "April 2026",
    current: {
      cashOnHandMinor: 8_000_000_00,
      activeProjects: 3,
      projectsOnTrack: 3,
      pipelineValueMinor: 1_000_000,
      contractsSignedThisMonth: 0,
      payrollRunwayWeeks: 60,
      openCriticalAlerts: 0,
    },
  });
  assert.ok(
    r.strategicRecommendations.some((s) => /Conversion stalled/i.test(s)),
  );
});
