/**
 * Stage 3.C — Distribution Preview Assistant + Document Understanding agent.
 *
 * Mix of:
 *   - Runtime tests for the Distribution Preview's conservative-clamp
 *     helper (pure module, no DB needed).
 *   - Static-source tests for everything that imports `server-only`.
 *   - Migration shape tests.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");
const exists = (rel: string) => existsSync(resolve(ROOT, rel));

// ===========================================================================
// 1) Migration 0043 — schema shape
// ===========================================================================

const MIGRATION_PATH = "drizzle/0043_development_os_stage_3_c.sql";

test("migration 0043 file exists", () => {
  assert.ok(exists(MIGRATION_PATH));
});

test("migration 0043 wraps in BEGIN/COMMIT", () => {
  const sql = read(MIGRATION_PATH);
  assert.match(sql, /^BEGIN;/m);
  assert.match(sql, /^COMMIT;/m);
});

test("migration 0043 creates ai_distribution_suggestions with all CHECK constraints", () => {
  const sql = read(MIGRATION_PATH);
  assert.match(
    sql,
    /CREATE TABLE IF NOT EXISTS "ai_distribution_suggestions"/,
  );
  assert.match(
    sql,
    /'capital_return', 'profit_distribution', 'mixed', 'none'/,
  );
  assert.match(sql, /'low', 'medium', 'high'/);
  assert.match(
    sql,
    /'draft', 'reviewed', 'declared', 'rejected', 'superseded'/,
  );
  assert.match(sql, /'cron_check', 'manual_request', 'threshold_event'/);
});

test("migration 0043 enforces non-negative suggested amount (defense in depth)", () => {
  const sql = read(MIGRATION_PATH);
  assert.match(sql, /ai_distribution_suggestions_amount_nonneg_check/);
  assert.match(sql, /"suggested_amount_usd_minor" >= 0/);
});

test("migration 0043 enforces one ACTIVE suggestion per project (partial unique index)", () => {
  const sql = read(MIGRATION_PATH);
  assert.match(
    sql,
    /UNIQUE INDEX IF NOT EXISTS "ai_distribution_suggestions_one_active_idx"/,
  );
  assert.match(sql, /WHERE "status" IN \('draft', 'reviewed'\)/);
});

test("migration 0043 creates ai_document_extractions with type/status/quality CHECKs", () => {
  const sql = read(MIGRATION_PATH);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "ai_document_extractions"/);
  assert.match(
    sql,
    /'receipt', 'invoice', 'delivery_note', 'contract', 'other'/,
  );
  assert.match(sql, /'high', 'medium', 'low', 'unreadable'/);
  assert.match(
    sql,
    /'pending_review', 'approved', 'edited_approved', 'rejected', 'duplicate', 'superseded'/,
  );
});

test("migration 0043 enforces confidence is BETWEEN 0 AND 1", () => {
  const sql = read(MIGRATION_PATH);
  assert.match(sql, /"vendor_match_confidence" BETWEEN 0 AND 1/);
  assert.match(sql, /"category_match_confidence" BETWEEN 0 AND 1/);
});

test("migration 0043 enforces one ACTIVE extraction per document", () => {
  const sql = read(MIGRATION_PATH);
  assert.match(
    sql,
    /UNIQUE INDEX IF NOT EXISTS "ai_document_extractions_one_active_idx"/,
  );
  assert.match(
    sql,
    /WHERE "status" IN \('pending_review', 'approved', 'edited_approved', 'duplicate'\)/,
  );
});

test("migration 0043 enables RLS on both new tables", () => {
  const sql = read(MIGRATION_PATH);
  for (const t of [
    "ai_distribution_suggestions",
    "ai_document_extractions",
  ]) {
    assert.ok(sql.includes(`'${t}'`), `RLS loop missing ${t}`);
  }
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /FORCE ROW LEVEL SECURITY/);
});

test("migration 0043 seeds two Stage 3.C agent budgets idempotently", () => {
  const sql = read(MIGRATION_PATH);
  assert.match(sql, /'dev_os\.distribution_preview'/);
  assert.match(sql, /'dev_os\.document_understanding'/);
  assert.match(sql, /ON CONFLICT \("assistant_key"\) DO UPDATE/);
});

// ===========================================================================
// 2) Drizzle schemas
// ===========================================================================

test("Drizzle schema exports aiDistributionSuggestions + aiDocumentExtractions", () => {
  const src = read("src/lib/db/schema/ai-development.ts");
  assert.match(src, /export const aiDistributionSuggestions /);
  assert.match(src, /export const aiDocumentExtractions /);
  assert.match(src, /export type AiDistributionSuggestion /);
  assert.match(src, /export type AiDocumentExtraction /);
});

test("Drizzle schema mirrors active partial unique indexes", () => {
  const src = read("src/lib/db/schema/ai-development.ts");
  assert.match(
    src,
    /uniqueIndex\("ai_distribution_suggestions_one_active_idx"\)/,
  );
  assert.match(
    src,
    /uniqueIndex\("ai_document_extractions_one_active_idx"\)/,
  );
});

// ===========================================================================
// 3) Conservative clamps — RUNTIME tests
//
// applyConservativeClamps is the load-bearing safety helper for the
// Distribution Preview agent. Every clamp is enforced in code, not
// just the prompt — so it must have airtight unit tests.
// ===========================================================================

import {
  applyConservativeClamps,
  type DistributionContextSnapshot,
} from "../src/lib/development/ai/distribution-preview-helpers";

function snap(
  override: Partial<DistributionContextSnapshot> = {},
): DistributionContextSnapshot {
  return {
    projectId: "p1",
    projectName: "Test Project",
    isSelfSustaining: true,
    projectBalanceUsdMinor: 100_000_00n, // $100k
    companyBalanceUsdMinor: 200_000_00n,
    inflows90dUsdMinor: 30_000_00n,
    outflows90dUsdMinor: 18_000_00n,
    netCashFlow90dUsdMinor: 12_000_00n,
    bufferUsdMinor: 36_000_00n, // $36k (6 months × $6k/mo from $18k/90d)
    outstandingCapitalUsdMinor: 0n,
    outstandingInvoicesUsdMinor: 0n,
    outstandingCommitmentsUsdMinor: 0n,
    safeEnvelopeUsdMinor: 64_000_00n, // $100k − $36k − 0 − 0
    daysSinceLastDistribution: 60,
    lastDistributionType: null,
    cooldownActive: false,
    ...override,
  };
}

test("clamp: not self-sustaining → suggested amount forced to 0, type 'none'", () => {
  const out = applyConservativeClamps(
    {
      suggested_amount_usd_minor: 50_000_00,
      suggested_distribution_type: "capital_return",
      suggested_effective_date: "2026-05-01",
      reasoning: "go for it",
      confidence_level: "high",
      risk_factors: [],
      recommendations: [],
    },
    snap({ isSelfSustaining: false }),
  );
  assert.equal(out.suggestedAmountUsdMinor, 0n);
  assert.equal(out.suggestedDistributionType, "none");
  assert.equal(out.confidenceLevel, "low");
  assert.ok(
    out.riskFactors.some((r) => r.includes("not self-sustaining")),
    "risk factor must mention self-sustaining",
  );
});

test("clamp: cooldown active → forced to 0 + low confidence", () => {
  const out = applyConservativeClamps(
    {
      suggested_amount_usd_minor: 30_000_00,
      suggested_distribution_type: "capital_return",
      suggested_effective_date: "2026-05-01",
      reasoning: "fine",
      confidence_level: "medium",
      risk_factors: [],
      recommendations: [],
    },
    snap({ cooldownActive: true, daysSinceLastDistribution: 12 }),
  );
  assert.equal(out.suggestedAmountUsdMinor, 0n);
  assert.equal(out.confidenceLevel, "low");
  assert.ok(out.riskFactors.some((r) => /days since last distribution/i.test(r)));
  assert.match(out.adjustedReasoning, /cooldown/i);
});

test("clamp: amount > safe envelope → capped to envelope, confidence downgraded if was high", () => {
  const out = applyConservativeClamps(
    {
      suggested_amount_usd_minor: 200_000_00, // $200k — way over the $64k envelope
      suggested_distribution_type: "capital_return",
      suggested_effective_date: "2026-05-01",
      reasoning: "all in",
      confidence_level: "high",
      risk_factors: [],
      recommendations: [],
    },
    snap(),
  );
  assert.equal(out.suggestedAmountUsdMinor, 64_000_00n);
  assert.equal(out.confidenceLevel, "medium");
  assert.ok(out.riskFactors.some((r) => /safe envelope/i.test(r)));
});

test("clamp: outstanding capital > 0 + type was 'profit_distribution' → forced to 'capital_return'", () => {
  const out = applyConservativeClamps(
    {
      suggested_amount_usd_minor: 30_000_00,
      suggested_distribution_type: "profit_distribution",
      suggested_effective_date: "2026-05-01",
      reasoning: "let's do profit",
      confidence_level: "high",
      risk_factors: [],
      recommendations: [],
    },
    snap({ outstandingCapitalUsdMinor: 50_000_00n }),
  );
  assert.equal(out.suggestedDistributionType, "capital_return");
  assert.ok(out.riskFactors.some((r) => /capital_return/.test(r)));
});

test("clamp: amount becomes 0 → type forced to 'none' for storage clarity", () => {
  const out = applyConservativeClamps(
    {
      suggested_amount_usd_minor: 0,
      suggested_distribution_type: "capital_return",
      suggested_effective_date: "2026-05-01",
      reasoning: "no",
      confidence_level: "low",
      risk_factors: [],
      recommendations: [],
    },
    snap(),
  );
  assert.equal(out.suggestedAmountUsdMinor, 0n);
  assert.equal(out.suggestedDistributionType, "none");
});

test("clamp: amount within envelope → passes through unchanged", () => {
  const out = applyConservativeClamps(
    {
      suggested_amount_usd_minor: 30_000_00,
      suggested_distribution_type: "capital_return",
      suggested_effective_date: "2026-05-01",
      reasoning: "reasonable",
      confidence_level: "medium",
      risk_factors: [],
      recommendations: [],
    },
    snap({ outstandingCapitalUsdMinor: 50_000_00n }),
  );
  assert.equal(out.suggestedAmountUsdMinor, 30_000_00n);
  assert.equal(out.suggestedDistributionType, "capital_return");
  assert.equal(out.confidenceLevel, "medium");
});

test("clamp: adjustedReasoning preserves the LLM reasoning + adds code-level notes", () => {
  const out = applyConservativeClamps(
    {
      suggested_amount_usd_minor: 5_000_000_00,
      suggested_distribution_type: "capital_return",
      suggested_effective_date: "2026-05-01",
      reasoning: "Original LLM reasoning text.",
      confidence_level: "high",
      risk_factors: [],
      recommendations: [],
    },
    snap(),
  );
  assert.match(out.adjustedReasoning, /Original LLM reasoning text\./);
  assert.match(out.adjustedReasoning, /Code-level adjustment/);
});

// ===========================================================================
// 4) Distribution Preview agent — static-source
// ===========================================================================

const DP_PATH = "src/lib/development/ai/distribution-preview.ts";
const DP_HELPERS_PATH = "src/lib/development/ai/distribution-preview-helpers.ts";

test("distribution-preview agent file exists with server-only guard", () => {
  assert.ok(exists(DP_PATH));
  assert.match(read(DP_PATH), /^import "server-only";/m);
});

test("DISTRIBUTION_PREVIEW_KEY is the canonical assistant key", () => {
  const src = read(DP_PATH);
  assert.match(src, /DISTRIBUTION_PREVIEW_KEY = "dev_os\.distribution_preview"/);
});

test("agent refuses when there's already an active suggestion (skipped_active)", () => {
  const src = read(DP_PATH);
  assert.match(src, /skipped_active/);
  assert.match(src, /'draft','reviewed'/);
});

test("agent enforces 30-day cooldown BEFORE provider call (no AI spend on cooldown projects)", () => {
  const src = read(DP_PATH);
  // The cooldown constant lives in the helpers module (extracted for testability).
  assert.match(read(DP_HELPERS_PATH), /COOLDOWN_DAYS = 30/);
  // The cooldown gate in the agent must come BEFORE the provider call.
  const cooldownIdx = src.indexOf("snapshot.cooldownActive");
  const providerIdx = src.indexOf("provider.complete");
  assert.ok(
    cooldownIdx >= 0 && cooldownIdx < providerIdx,
    "cooldown check must appear before provider.complete",
  );
});

test("agent enforces budget BEFORE provider call", () => {
  const src = read(DP_PATH);
  const budgetIdx = src.indexOf("checkBudget(DISTRIBUTION_PREVIEW_KEY)");
  const providerIdx = src.indexOf("provider.complete");
  assert.ok(budgetIdx >= 0 && providerIdx > budgetIdx);
});

test("agent uses a 6-month operating buffer (BUFFER_MONTHS = 6)", () => {
  // BUFFER_MONTHS lives in the helpers module — agent imports it.
  assert.match(read(DP_HELPERS_PATH), /BUFFER_MONTHS = 6/);
  assert.match(read(DP_PATH), /BUFFER_MONTHS/);
});

test("agent uses the existing previewDistribution helper for allocation preview", () => {
  const src = read(DP_PATH);
  assert.match(src, /previewDistribution\(/);
});

test("agent records cost columns and links suggestion to ai_assistant_runs row", () => {
  const src = read(DP_PATH);
  assert.match(src, /computeCallCost/);
  assert.match(src, /aiRunId: runId/);
});

test("agent inserts suggestion with status='draft' (HITL gate)", () => {
  const src = read(DP_PATH);
  assert.match(src, /status: "draft"/);
});

test("agent applies clamps AFTER LLM responds (defensive)", () => {
  const src = read(DP_PATH);
  // applyConservativeClamps must be CALLED between parse + insert.
  // Search for the call expression specifically (not the import).
  const parseIdx = src.indexOf("ResponseSchema.parse");
  const clampIdx = src.indexOf("applyConservativeClamps(parsed, snapshot)");
  const insertIdx = src.indexOf(
    ".insert(aiDistributionSuggestions)",
  );
  assert.ok(
    parseIdx > 0 && clampIdx > parseIdx && insertIdx > clampIdx,
    "clamp must run after parse and before insert",
  );
});

test("findProjectsNeedingSuggestion filters to self-sustaining + no active suggestion", () => {
  const src = read(DP_PATH);
  assert.match(src, /eq\(developmentProjectMeta\.isSelfSustaining, true\)/);
  // Active-set check is a sql template literal, not the isNull helper.
  assert.match(src, /aiDistributionSuggestions\.id\} IS NULL/);
});

// ===========================================================================
// 5) Distribution Preview HITL actions
// ===========================================================================

const DP_ACTIONS_PATH =
  "src/lib/development/server/distribution-suggestion-actions.ts";

test("distribution-suggestion-actions file exists with server-only guard + 5 HITL actions", () => {
  assert.ok(exists(DP_ACTIONS_PATH));
  const src = read(DP_ACTIONS_PATH);
  assert.match(src, /^import "server-only";/m);
  for (const fn of [
    "requestDistributionSuggestion",
    "regenerateSuggestion",
    "approveDistributionSuggestion",
    "rejectDistributionSuggestion",
    "getActiveSuggestionForProject",
  ]) {
    assert.match(
      src,
      new RegExp(`export async function ${fn}`),
      `missing ${fn}`,
    );
  }
});

test("approveDistributionSuggestion calls existing declareDistribution (never auto-declares)", () => {
  const src = read(DP_ACTIONS_PATH);
  assert.match(src, /declareDistribution\(/);
});

test("approveDistributionSuggestion refuses 'none' type without explicit operator override", () => {
  const src = read(DP_ACTIONS_PATH);
  assert.match(src, /Suggestion was 'none'/);
});

test("approveDistributionSuggestion re-checks safe envelope at approval time (defense in depth)", () => {
  const src = read(DP_ACTIONS_PATH);
  assert.match(src, /safeEnvelope/);
  assert.match(src, /amountBig > safeEnvelope/);
});

test("approveDistributionSuggestion refuses amount <= 0", () => {
  const src = read(DP_ACTIONS_PATH);
  assert.match(src, /Cannot declare a distribution with amount 0/);
});

test("rejectDistributionSuggestion refuses non-draft/non-reviewed states", () => {
  const src = read(DP_ACTIONS_PATH);
  assert.match(src, /Cannot reject suggestion in/);
});

// ===========================================================================
// 6) Distribution Preview cron + dispatcher wiring
// ===========================================================================

test("distribution-preview cron exists and stops on budget_exceeded", () => {
  const path = "src/lib/development/server/cron/distribution-preview-job.ts";
  assert.ok(exists(path));
  const src = read(path);
  assert.match(src, /res\.status === "budget_exceeded"/);
  assert.match(src, /break;/);
});

test("distribution-preview cron route exists at /api/cron/dev-os-distribution-preview", () => {
  const r = "src/app/api/cron/dev-os-distribution-preview/route.ts";
  assert.ok(exists(r));
  assert.match(read(r), /handleCronJobRequest\(request, "dev_os_distribution_preview"\)/);
});

test("dev_os_distribution_preview wired into KNOWN_JOBS + dispatcher + DEV_OS_JOB_KEYS", () => {
  const a = read("src/features/jobs/actions.ts");
  const c = read("src/lib/development/server/cron/index.ts");
  assert.match(a, /"dev_os_distribution_preview"/);
  assert.match(
    a,
    /case "dev_os_distribution_preview":\s*\n\s*return runDevOsDistributionPreview/,
  );
  assert.match(c, /"dev_os_distribution_preview"/);
  assert.match(c, /runDevOsDistributionPreview/);
});

test("VERCEL-CRON-CHECKLIST.md documents distribution-preview at Monday 10am", () => {
  const md = read("docs/VERCEL-CRON-CHECKLIST.md");
  assert.match(md, /\/api\/cron\/dev-os-distribution-preview/);
  assert.match(md, /0 10 \* \* 1/);
});

// ===========================================================================
// 7) Document Understanding agent — static-source
// ===========================================================================

const DU_PATH = "src/lib/development/ai/document-understanding.ts";

test("document-understanding agent file exists with server-only guard", () => {
  assert.ok(exists(DU_PATH));
  assert.match(read(DU_PATH), /^import "server-only";/m);
});

test("DOCUMENT_UNDERSTANDING_KEY is the canonical assistant key", () => {
  const src = read(DU_PATH);
  assert.match(
    src,
    /DOCUMENT_UNDERSTANDING_KEY = "dev_os\.document_understanding"/,
  );
});

test("agent refuses when there's already an active extraction (skipped_active)", () => {
  const src = read(DU_PATH);
  assert.match(src, /skipped_active/);
  assert.match(
    src,
    /'pending_review','approved','edited_approved','duplicate'/,
  );
});

test("agent enforces budget BEFORE provider call", () => {
  const src = read(DU_PATH);
  const budgetIdx = src.indexOf("checkBudget(DOCUMENT_UNDERSTANDING_KEY)");
  const providerIdx = src.indexOf("provider.complete");
  assert.ok(budgetIdx >= 0 && providerIdx > budgetIdx);
});

test("agent downloads bytes from the storage abstraction (not Supabase directly)", () => {
  const src = read(DU_PATH);
  assert.match(src, /getStorageProvider\(\)/);
  assert.match(src, /storage\.download/);
});

test("agent inserts extraction with status='pending_review' (HITL gate)", () => {
  const src = read(DU_PATH);
  assert.match(src, /status: "pending_review"/);
});

test("agent forces low quality + ambiguity entry for non-image MIMEs (defense in depth)", () => {
  const src = read(DU_PATH);
  assert.match(src, /MIME type/);
  assert.match(src, /vision; the model worked from metadata only/);
});

test("agent records cost columns and links extraction to ai_assistant_runs row", () => {
  const src = read(DU_PATH);
  assert.match(src, /computeCallCost/);
  assert.match(src, /aiRunId: runId/);
});

test("agent supports four document types: receipt, invoice, delivery_note, contract", () => {
  const src = read(DU_PATH);
  assert.match(src, /SUPPORTED_TYPES = \[\s*"receipt",\s*"invoice",\s*"delivery_note",\s*"contract",\s*"other"/);
});

test("agent fuzzy-matches vendor names with confidence ≥ 0.4 threshold", () => {
  const src = read(DU_PATH);
  assert.match(src, /resolveVendorByName/);
  assert.match(src, /best\.score >= 0\.4/);
});

test("agent fuzzy-matches cost categories using displayName + isActive filter", () => {
  const src = read(DU_PATH);
  assert.match(src, /resolveCategoryByName/);
  assert.match(src, /devCostCategories\.displayName/);
  assert.match(src, /eq\(devCostCategories\.isActive, true\)/);
});

test("agent system prompt is type-specific (different schemas per document_type)", () => {
  const src = read(DU_PATH);
  assert.match(src, /buildSystemPrompt/);
  assert.match(src, /typeSpecific:/);
});

test("findDocumentsNeedingExtraction filters to receipt/invoice/delivery_note/contract types", () => {
  const src = read(DU_PATH);
  assert.match(
    src,
    /'receipt','invoice','delivery_note','contract'/,
  );
  assert.match(src, /isNull\(aiDocumentExtractions\.id\)/);
});

// ===========================================================================
// 8) Document Understanding HITL actions
// ===========================================================================

const DU_ACTIONS_PATH =
  "src/lib/development/server/document-extraction-actions.ts";

test("document-extraction-actions has server-only guard + 6 HITL actions", () => {
  assert.ok(exists(DU_ACTIONS_PATH));
  const src = read(DU_ACTIONS_PATH);
  assert.match(src, /^import "server-only";/m);
  for (const fn of [
    "extractFromDocumentNow",
    "approveExtractionAsTransaction",
    "rejectExtraction",
    "markExtractionDuplicate",
    "regenerateExtraction",
    "getDocumentExtractions",
  ]) {
    assert.match(
      src,
      new RegExp(`export async function ${fn}`),
      `missing ${fn}`,
    );
  }
});

test("approveExtractionAsTransaction calls existing recordTransaction (never auto-creates)", () => {
  const src = read(DU_ACTIONS_PATH);
  assert.match(src, /recordTransaction\(/);
});

test("approveExtractionAsTransaction only accepts receipt/invoice document types", () => {
  const src = read(DU_ACTIONS_PATH);
  assert.match(
    src,
    /ext\.documentType !== "receipt" && ext\.documentType !== "invoice"/,
  );
});

test("approval distinguishes 'approved' vs 'edited_approved' based on operator overrides", () => {
  const src = read(DU_ACTIONS_PATH);
  assert.match(src, /detectOperatorEdits/);
  assert.match(src, /wasEdited \? "edited_approved" : "approved"/);
});

test("rejectExtraction refuses non-pending_review states", () => {
  const src = read(DU_ACTIONS_PATH);
  assert.match(src, /Cannot reject extraction in/);
});

test("regenerateExtraction supersedes the active row before re-running", () => {
  const src = read(DU_ACTIONS_PATH);
  assert.match(src, /status: "superseded"/);
});

// ===========================================================================
// 9) Document Understanding cron + dispatcher wiring
// ===========================================================================

test("document-extraction cron exists and stops on budget_exceeded", () => {
  const path = "src/lib/development/server/cron/document-extraction-job.ts";
  assert.ok(exists(path));
  const src = read(path);
  assert.match(src, /res\.status === "budget_exceeded"/);
  assert.match(src, /break;/);
});

test("document-extraction cron route exists at /api/cron/dev-os-document-extraction", () => {
  const r = "src/app/api/cron/dev-os-document-extraction/route.ts";
  assert.ok(exists(r));
  assert.match(read(r), /handleCronJobRequest\(request, "dev_os_document_extraction"\)/);
});

test("dev_os_document_extraction wired into KNOWN_JOBS + dispatcher + DEV_OS_JOB_KEYS", () => {
  const a = read("src/features/jobs/actions.ts");
  const c = read("src/lib/development/server/cron/index.ts");
  assert.match(a, /"dev_os_document_extraction"/);
  assert.match(
    a,
    /case "dev_os_document_extraction":\s*\n\s*return runDevOsDocumentExtraction/,
  );
  assert.match(c, /"dev_os_document_extraction"/);
  assert.match(c, /runDevOsDocumentExtraction/);
});

test("VERCEL-CRON-CHECKLIST.md documents document-extraction every 30 min", () => {
  const md = read("docs/VERCEL-CRON-CHECKLIST.md");
  assert.match(md, /\/api\/cron\/dev-os-document-extraction/);
  assert.match(md, /\*\/30 \* \* \* \*/);
});

// ===========================================================================
// 10) HITL inline UI components
// ===========================================================================

test("DistributionSuggestionCard is a client component with all 4 HITL actions", () => {
  const path =
    "src/components/development/projects/distribution-suggestion-card.tsx";
  assert.ok(exists(path));
  const src = read(path);
  assert.match(src, /^"use client";/m);
  for (const fn of [
    "requestDistributionSuggestion",
    "approveDistributionSuggestion",
    "rejectDistributionSuggestion",
    "regenerateSuggestion",
  ]) {
    assert.ok(src.includes(fn), `missing button hookup for ${fn}`);
  }
});

test("DistributionSuggestionCard surfaces confidence + self-sustaining state", () => {
  const src = read(
    "src/components/development/projects/distribution-suggestion-card.tsx",
  );
  assert.match(src, /CONFIDENCE_TONE/);
  assert.match(src, /Not self-sustaining/);
});

test("ExtractionReviewPanel is a client component with all 4 HITL actions", () => {
  const path = "src/components/development/finance/extraction-review-panel.tsx";
  assert.ok(exists(path));
  const src = read(path);
  assert.match(src, /^"use client";/m);
  for (const fn of [
    "approveExtractionAsTransaction",
    "rejectExtraction",
    "markExtractionDuplicate",
    "regenerateExtraction",
  ]) {
    assert.ok(src.includes(fn), `missing button hookup for ${fn}`);
  }
});

test("Project detail Capital tab mounts DistributionSuggestionCard", () => {
  const src = read(
    "src/app/(development-app)/development-os/projects/[slug]/page.tsx",
  );
  assert.match(src, /DistributionSuggestionCard/);
  assert.match(src, /getActiveSuggestionForProject/);
});

test("Document extractions inbox page exists with status filters", () => {
  const path =
    "src/app/(development-app)/development-os/finance/document-extractions/page.tsx";
  assert.ok(exists(path));
  const src = read(path);
  assert.match(src, /pending_review/);
  assert.match(src, /getDocumentExtractions/);
});

test("Extraction review page exists and pulls bank accounts + categories", () => {
  const path =
    "src/app/(development-app)/development-os/finance/document-extractions/[id]/page.tsx";
  assert.ok(exists(path));
  const src = read(path);
  assert.match(src, /ExtractionReviewPanel/);
  assert.match(src, /getBankAccounts/);
  assert.match(src, /getCostCategories/);
});

// ===========================================================================
// 11) Demo seed extension
// ===========================================================================

test("seed-dev-os.mjs seeds two Stage 3.C agent budgets", () => {
  const src = read("scripts/seed-dev-os.mjs");
  assert.match(src, /dev_os\.distribution_preview/);
  assert.match(src, /dev_os\.document_understanding/);
});

test("seed-dev-os.mjs creates demo distribution suggestions across draft/reviewed/rejected", () => {
  const src = read("scripts/seed-dev-os.mjs");
  assert.match(src, /INSERT INTO ai_distribution_suggestions/);
  assert.match(src, /draft|reviewed|rejected/);
});

test("seed-dev-os.mjs creates demo document extractions across multiple statuses", () => {
  const src = read("scripts/seed-dev-os.mjs");
  assert.match(src, /INSERT INTO ai_document_extractions/);
  assert.match(src, /pending_review/);
});

test("seed-dev-os.mjs is idempotent (skips when active suggestion already exists)", () => {
  const src = read("scripts/seed-dev-os.mjs");
  assert.match(
    src,
    /SELECT id FROM ai_distribution_suggestions[\s\S]*?status IN \('draft','reviewed'\)/,
  );
});
