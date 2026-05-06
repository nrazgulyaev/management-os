/**
 * Stage 3.B — Construction Supervisor + Investor Relations + closure
 * items (translation cache, vendor-performance cron, OpenAI fallback,
 * manual re-analyze button).
 *
 * Mix of:
 *   - Runtime tests for the cost calculator's OpenAI rates (pure module).
 *   - Static-source tests for everything that imports `server-only`.
 *   - Migration shape tests.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { computeCallCost, getModelRate, listModelRates } from "../src/lib/ai/cost";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");
const exists = (rel: string) => existsSync(resolve(ROOT, rel));

// =============================================================================
// 1) Migration 0042 — schema shape
// =============================================================================

const MIGRATION_PATH = "drizzle/0042_development_os_stage_3_b.sql";

test("migration 0042 file exists", () => {
  assert.ok(exists(MIGRATION_PATH));
});

test("migration 0042 wraps in BEGIN/COMMIT", () => {
  const sql = read(MIGRATION_PATH);
  assert.match(sql, /^BEGIN;/m);
  assert.match(sql, /^COMMIT;/m);
});

test("migration 0042 drops the legacy ai_assistant_runs status CHECK", () => {
  // Stage 3.A widened a NEW constraint but missed the legacy one. 3.B
  // removes the legacy one so 'dry_run' / 'budget_exceeded' rows
  // actually persist.
  const sql = read(MIGRATION_PATH);
  assert.match(
    sql,
    /DROP CONSTRAINT IF EXISTS "ai_assistant_runs_status_check"/,
  );
});

test("migration 0042 creates ai_translation_cache idempotent + RLS", () => {
  const sql = read(MIGRATION_PATH);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "ai_translation_cache"/);
  assert.match(sql, /UNIQUE \("source_text_hash", "target_language"\)/);
  assert.match(sql, /'ai_translation_cache'/);
  assert.match(sql, /public\.is_internal_user\(\)/);
});

test("migration 0042 creates ai_construction_analyses with safety+status CHECKs", () => {
  const sql = read(MIGRATION_PATH);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "ai_construction_analyses"/);
  assert.match(sql, /'normal', 'minor_concerns', 'serious_concerns'/);
  assert.match(
    sql,
    /'draft', 'approved', 'edited_approved', 'rejected', 'superseded'/,
  );
});

test("migration 0042 enforces one ACTIVE analysis per report (partial unique index)", () => {
  const sql = read(MIGRATION_PATH);
  assert.match(sql, /UNIQUE INDEX IF NOT EXISTS "ai_construction_analyses_one_active_idx"/);
  assert.match(sql, /WHERE "status" IN \('draft', 'approved', 'edited_approved'\)/);
});

test("migration 0042 creates ai_investor_qa_drafts with status + sent_via CHECKs", () => {
  const sql = read(MIGRATION_PATH);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "ai_investor_qa_drafts"/);
  assert.match(
    sql,
    /'draft', 'approved', 'edited_approved', 'rejected', 'sent'/,
  );
  assert.match(sql, /'email', 'manual_copy', 'whatsapp', 'portal'/);
});

test("migration 0042 seeds three Stage 3.B agent budgets idempotently", () => {
  const sql = read(MIGRATION_PATH);
  assert.match(sql, /'dev_os\.construction_supervisor'/);
  assert.match(sql, /'dev_os\.investor_relations'/);
  assert.match(sql, /'dev_os\.translator'/);
  assert.match(sql, /ON CONFLICT \("assistant_key"\) DO UPDATE/);
});

test("migration 0042 enables RLS on all three new tables", () => {
  const sql = read(MIGRATION_PATH);
  for (const t of [
    "ai_translation_cache",
    "ai_construction_analyses",
    "ai_investor_qa_drafts",
  ]) {
    assert.ok(sql.includes(`'${t}'`), `RLS loop missing ${t}`);
  }
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /FORCE ROW LEVEL SECURITY/);
});

// =============================================================================
// 2) Drizzle schema for new tables
// =============================================================================

test("Drizzle schema exports aiTranslationCache table + types", () => {
  const src = read("src/lib/db/schema/ai.ts");
  assert.match(src, /export const aiTranslationCache /);
  assert.match(src, /export type AiTranslationCacheRow/);
  assert.match(src, /sourceTextHash: text\("source_text_hash"\)/);
});

test("Drizzle schema exports aiConstructionAnalyses + aiInvestorQaDrafts", () => {
  const src = read("src/lib/db/schema/ai-development.ts");
  assert.match(src, /export const aiConstructionAnalyses /);
  assert.match(src, /export const aiInvestorQaDrafts /);
  assert.match(src, /export type AiConstructionAnalysis /);
  assert.match(src, /export type AiInvestorQaDraft /);
});

test("Drizzle schema active-analysis partial unique mirrors the migration", () => {
  const src = read("src/lib/db/schema/ai-development.ts");
  assert.match(src, /uniqueIndex\("ai_construction_analyses_one_active_idx"\)/);
  assert.match(src, /'draft','approved','edited_approved'/);
});

test("ai-development schema is re-exported from db/schema/index", () => {
  const src = read("src/lib/db/schema/index.ts");
  assert.match(src, /ai-development/);
});

// =============================================================================
// 3) OpenAI fallback provider
// =============================================================================

test("OpenAI provider file exists with server-only guard", () => {
  assert.ok(exists("src/lib/ai/providers/openai.ts"));
  assert.match(read("src/lib/ai/providers/openai.ts"), /^(import "server-only";|"use server";)/m);
});

test("OpenAIProvider implements the AIProvider interface (name, defaultModel, isAvailable, complete)", () => {
  const src = read("src/lib/ai/providers/openai.ts");
  assert.match(src, /readonly name = "openai"/);
  assert.match(src, /readonly defaultModel/);
  assert.match(src, /isAvailable\(\)/);
  assert.match(src, /async complete\(req: AICompletionRequest\)/);
});

test("OpenAIProvider sends image_url blocks with data URI for vision", () => {
  const src = read("src/lib/ai/providers/openai.ts");
  assert.match(src, /type: "image_url"/);
  assert.match(src, /data:\$\{img\.mediaType\};base64,/);
});

test("OpenAIProvider requests JSON mode when responseFormat='json'", () => {
  const src = read("src/lib/ai/providers/openai.ts");
  assert.match(src, /response_format = \{ type: "json_object" \}/);
});

test("provider factory selects OpenAIProvider when AI_PROVIDER=openai", () => {
  const src = read("src/lib/ai/providers/index.ts");
  assert.match(src, /process\.env\.AI_PROVIDER === "openai"/);
  assert.match(src, /new OpenAIProvider\(\)/);
});

test("provider factory still defaults to Anthropic when AI_PROVIDER unset", () => {
  const src = read("src/lib/ai/providers/index.ts");
  // The else branch must construct AnthropicProvider as the default
  // live path (after the dry-run + openai branches).
  assert.match(src, /} else \{\s*\n\s*cached = new AnthropicProvider\(\);\s*\n\s*\}/);
});

test("hasAnyAIKey accepts EITHER OPENAI_API_KEY or ANTHROPIC_API_KEY", () => {
  const src = read("src/lib/ai/providers/index.ts");
  assert.match(src, /hasAnyAIKey/);
  assert.match(src, /process\.env\.OPENAI_API_KEY/);
});

test("cost calculator includes OpenAI rates", () => {
  for (const m of ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"]) {
    const r = getModelRate(m);
    assert.ok(r, `missing rate for ${m}`);
    assert.equal(r!.vendor, "openai");
  }
});

test("cost calculator computes GPT-4o-mini cost (cheapest OpenAI rate)", () => {
  // GPT-4o-mini: input $0.15 / 1M, output $0.60 / 1M.
  // 100k in × $0.15/1M = $0.015; 50k out × $0.60/1M = $0.03; total $0.045.
  const out = computeCallCost({
    model: "gpt-4o-mini",
    promptTokens: 100_000,
    completionTokens: 50_000,
  });
  assert.ok(out);
  assert.equal(out.inputCostUsd, 0.015);
  assert.equal(out.outputCostUsd, 0.03);
  assert.equal(out.totalCostUsd, 0.045);
});

// =============================================================================
// 4) Translation service
// =============================================================================

const TRANSLATOR_PATH = "src/lib/development/ai/translator.ts";

test("translator.ts exists with server-only guard", () => {
  assert.ok(exists(TRANSLATOR_PATH));
  assert.match(read(TRANSLATOR_PATH), /^(import "server-only";|"use server";)/m);
});

test("translator exports translateText + translateSiteReportSummary", () => {
  const src = read(TRANSLATOR_PATH);
  assert.match(src, /export async function translateText/);
  assert.match(src, /export async function translateSiteReportSummary/);
  assert.match(src, /TRANSLATOR_KEY = "dev_os\.translator"/);
});

test("translator hashes (text + '|' + context) for cache key", () => {
  const src = read(TRANSLATOR_PATH);
  assert.match(src, /createHash\("sha256"\)/);
  assert.match(src, /\.update\(text\)/);
  assert.match(src, /\.update\("\|"\)/);
});

test("translator short-circuits when source === target language", () => {
  const src = read(TRANSLATOR_PATH);
  assert.match(src, /sourceLanguage === parsed\.targetLanguage/);
});

test("translator caches misses and bumps hit_count + last_used_at on hits", () => {
  const src = read(TRANSLATOR_PATH);
  assert.match(src, /\.onConflictDoNothing\(\)/);
  assert.match(src, /hitCount: sql`\$\{aiTranslationCache\.hitCount\} \+ 1`/);
  assert.match(src, /lastUsedAt: new Date\(\)/);
});

test("translator enforces budget on cache misses (records budget_exceeded)", () => {
  const src = read(TRANSLATOR_PATH);
  assert.match(src, /checkBudget\(TRANSLATOR_KEY\)/);
  assert.match(src, /budget_exceeded/);
});

test("translator records cost columns on every successful call", () => {
  const src = read(TRANSLATOR_PATH);
  assert.match(src, /computeCallCost/);
  assert.match(src, /inputCostUsd:/);
  assert.match(src, /totalCostUsd:/);
});

test("translateSiteReportSummary preserves existing translations not in target list", () => {
  const src = read(TRANSLATOR_PATH);
  assert.match(src, /\{ \.\.\.existing \}/);
  assert.match(src, /if \(existing\[lang\]\)/);
});

// =============================================================================
// 5) Auto-vendor-performance cron
// =============================================================================

const VENDOR_PERF_PATH =
  "src/lib/development/server/cron/vendor-performance-job.ts";

test("vendor-performance cron file exists with server-only guard", () => {
  assert.ok(exists(VENDOR_PERF_PATH));
  assert.match(read(VENDOR_PERF_PATH), /^(import "server-only";|"use server";)/m);
});

test("vendor-performance computes on-time rate (delivery <= expected)", () => {
  const src = read(VENDOR_PERF_PATH);
  assert.match(src, /md\.delivery_date <= po\.expected_delivery_date/);
});

test("vendor-performance computes weighted quality rating per spec (5/3.5/1)", () => {
  const src = read(VENDOR_PERF_PATH);
  assert.match(src, /'accepted' THEN 5\.0/);
  assert.match(src, /'partial_acceptance' THEN 3\.5/);
  assert.match(src, /'rejected' THEN 1\.0/);
  // Pending excluded — appears in the WHERE-IN filter but not in the CASE.
  assert.match(src, /quality_check_status IN \('accepted','partial_acceptance','rejected'\)/);
});

test("vendor-performance updates last_engagement_at to most recent of delivery / engagement", () => {
  const src = read(VENDOR_PERF_PATH);
  assert.match(src, /lastEngagementAt: lastDate/);
  assert.match(src, /lastDelivery > lastEngagement/);
});

test("vendor-performance sums commitments_value via dev_commitments_ledger", () => {
  const src = read(VENDOR_PERF_PATH);
  assert.match(src, /sum\(amount_usd_minor\)/);
  assert.match(src, /dev_commitments_ledger/);
});

test("vendor-performance cron route exists at /api/cron/dev-os-vendor-performance", () => {
  const route = "src/app/api/cron/dev-os-vendor-performance/route.ts";
  assert.ok(exists(route));
  assert.match(read(route), /handleCronJobRequest\(request, "dev_os_vendor_performance"\)/);
});

test("dev_os_vendor_performance is registered in KNOWN_JOBS + dispatcher", () => {
  const src = read("src/features/jobs/actions.ts");
  assert.match(src, /"dev_os_vendor_performance"/);
  assert.match(
    src,
    /case "dev_os_vendor_performance":\s*\n\s*return runDevOsVendorPerformance/,
  );
});

// =============================================================================
// 6) Manual Re-analyze server action + button
// =============================================================================

test("photo-analyst-actions exports reanalyzePhoto + canRunPhotoAnalyst", () => {
  const src = read("src/lib/development/server/photo-analyst-actions.ts");
  assert.match(src, /^"use server";/m);
  assert.match(src, /export async function reanalyzePhoto/);
  assert.match(src, /export async function canRunPhotoAnalyst/);
});

test("reanalyzePhoto clears ai_analyzed_at to force re-run", () => {
  const src = read("src/lib/development/server/photo-analyst-actions.ts");
  assert.match(src, /aiAnalyzedAt: null/);
  assert.match(src, /aiDetectedObjects: null/);
});

test("reanalyzePhoto checks budget BEFORE calling analyzer", () => {
  const src = read("src/lib/development/server/photo-analyst-actions.ts");
  // The budget check must appear before the call to analyzePhoto.
  const budgetIdx = src.indexOf("checkBudget");
  const analyzeIdx = src.indexOf("analyzePhoto(parsed.photoId)");
  assert.ok(budgetIdx >= 0 && analyzeIdx > budgetIdx, "budget check must precede analyzer call");
});

test("PhotoReanalyzeButton component exists as a client component", () => {
  const path = "src/components/development/site-reports/photo-reanalyze-button.tsx";
  assert.ok(exists(path));
  assert.match(read(path), /^"use client";/m);
});

test("PhotoReanalyzeButton disables itself when budget not allowed (defense in depth)", () => {
  const src = read("src/components/development/site-reports/photo-reanalyze-button.tsx");
  assert.match(src, /budgetAllowed/);
  assert.match(src, /disabled = !budgetAllowed/);
});

test("PhotoGallery passes reportId + budget to the button", () => {
  const src = read("src/components/development/site-reports/photo-gallery.tsx");
  assert.match(src, /reportId\?: string/);
  assert.match(src, /canRunPhotoAnalyst\(\)/);
  assert.match(src, /<PhotoReanalyzeButton/);
});

// =============================================================================
// 7) Construction Supervisor agent
// =============================================================================

const SUPERVISOR_PATH = "src/lib/development/ai/construction-supervisor.ts";

test("construction supervisor file exists with server-only guard", () => {
  assert.ok(exists(SUPERVISOR_PATH));
  assert.match(read(SUPERVISOR_PATH), /^(import "server-only";|"use server";)/m);
});

test("supervisor exports CONSTRUCTION_SUPERVISOR_KEY = 'dev_os.construction_supervisor'", () => {
  const src = read(SUPERVISOR_PATH);
  assert.match(src, /CONSTRUCTION_SUPERVISOR_KEY = "dev_os\.construction_supervisor"/);
});

test("supervisor refuses to run on draft reports", () => {
  const src = read(SUPERVISOR_PATH);
  assert.match(src, /report\.status !== "submitted" && report\.status !== "reviewed"/);
});

test("supervisor refuses when there's already an active analysis", () => {
  const src = read(SUPERVISOR_PATH);
  assert.match(src, /'draft','approved','edited_approved'/);
  assert.match(src, /skipped_active_analysis/);
});

test("supervisor budget gate runs BEFORE provider call", () => {
  const src = read(SUPERVISOR_PATH);
  const budgetIdx = src.indexOf("checkBudget(CONSTRUCTION_SUPERVISOR_KEY)");
  const providerIdx = src.indexOf("provider.complete");
  assert.ok(
    budgetIdx >= 0 && providerIdx > budgetIdx,
    "budget check must precede provider call",
  );
});

test("supervisor includes photo analysis + workforce + materials + vendors in context", () => {
  const src = read(SUPERVISOR_PATH);
  assert.match(src, /siteReportPhotos/);
  assert.match(src, /siteWorkforceLogs/);
  assert.match(src, /materialConsumptionLogs/);
  assert.match(src, /vendorEngagements/);
});

test("supervisor Zod-validates the response shape", () => {
  const src = read(SUPERVISOR_PATH);
  assert.match(src, /ResponseSchema = z\.object/);
  assert.match(src, /safety_status: z\.enum\(\["normal", "minor_concerns", "serious_concerns"\]\)/);
});

test("supervisor records cost columns and links analysis to ai_assistant_runs row", () => {
  const src = read(SUPERVISOR_PATH);
  assert.match(src, /computeCallCost/);
  assert.match(src, /aiRunId: runId/);
});

test("supervisor inserts analysis with status='draft' (HITL gate)", () => {
  const src = read(SUPERVISOR_PATH);
  assert.match(src, /status: "draft"/);
});

test("findReportsNeedingAnalysis filters out reports with active analysis via LEFT JOIN", () => {
  const src = read(SUPERVISOR_PATH);
  assert.match(src, /\.leftJoin\(\s*aiConstructionAnalyses/);
  assert.match(src, /isNull\(aiConstructionAnalyses\.id\)/);
});

test("supervisor cron job stops on budget_exceeded outcome", () => {
  const src = read("src/lib/development/server/cron/construction-supervisor-job.ts");
  assert.match(src, /res\.status === "budget_exceeded"/);
  assert.match(src, /break;/);
});

test("supervisor cron route exists at /api/cron/dev-os-construction-supervisor", () => {
  const r = "src/app/api/cron/dev-os-construction-supervisor/route.ts";
  assert.ok(exists(r));
  assert.match(read(r), /handleCronJobRequest\(request, "dev_os_construction_supervisor"\)/);
});

test("dev_os_construction_supervisor wired into dispatcher + KNOWN_JOBS + DEV_OS_JOB_KEYS", () => {
  const a = read("src/features/jobs/actions.ts");
  const c = read("src/lib/development/server/cron/index.ts");
  assert.match(a, /"dev_os_construction_supervisor"/);
  assert.match(a, /case "dev_os_construction_supervisor":\s*\n\s*return runDevOsConstructionSupervisor/);
  assert.match(c, /"dev_os_construction_supervisor"/);
  assert.match(c, /runDevOsConstructionSupervisor/);
});

// =============================================================================
// 8) Construction analysis HITL actions
// =============================================================================

const ANALYSIS_ACTIONS_PATH =
  "src/lib/development/server/construction-analysis-actions.ts";

test("construction-analysis actions has server-only guard + internal user gate", () => {
  const src = read(ANALYSIS_ACTIONS_PATH);
  assert.match(src, /^(import "server-only";|"use server";)/m);
  assert.match(src, /requireInternalUser\(\)/);
});

test("approveAnalysis runs in a transaction (atomic vs site_report update)", () => {
  const src = read(ANALYSIS_ACTIONS_PATH);
  assert.match(src, /db\.transaction\(async \(tx\) =>/);
});

test("editAndApproveAnalysis stores reviewer_edits + sets status='edited_approved'", () => {
  const src = read(ANALYSIS_ACTIONS_PATH);
  assert.match(src, /reviewerEdits:/);
  assert.match(src, /status: "edited_approved"/);
});

test("rejectAnalysis records rejection_reason + only against draft state", () => {
  const src = read(ANALYSIS_ACTIONS_PATH);
  assert.match(src, /rejectionReason: parsed\.reason/);
  assert.match(src, /eq\(aiConstructionAnalyses\.status, "draft"\)/);
});

test("regenerateAnalysisForReport supersedes the current draft before re-running", () => {
  const src = read(ANALYSIS_ACTIONS_PATH);
  assert.match(src, /status: "superseded"/);
  assert.match(src, /analyzeSiteReport\(parsed\.reportId\)/);
});

test("approveAnalysis merges AI translations into report (operator wins)", () => {
  const src = read(ANALYSIS_ACTIONS_PATH);
  assert.match(src, /\.\.\.aiTranslations, \.\.\.existing/);
});

// =============================================================================
// 9) Investor Relations agent + actions
// =============================================================================

const IR_PATH = "src/lib/development/ai/investor-relations.ts";

test("investor-relations file exists with server-only guard", () => {
  assert.ok(exists(IR_PATH));
  assert.match(read(IR_PATH), /^(import "server-only";|"use server";)/m);
});

test("investor-relations exports INVESTOR_RELATIONS_KEY", () => {
  const src = read(IR_PATH);
  assert.match(src, /INVESTOR_RELATIONS_KEY = "dev_os\.investor_relations"/);
});

test("draftInvestorResponse defaults responseLanguage to investor.reportingLanguage", () => {
  const src = read(IR_PATH);
  assert.match(src, /investor\.reportingLanguage/);
  assert.match(src, /responseLanguage =/);
});

test("draftInvestorResponse loads commitments / wallets / distributions in parallel", () => {
  const src = read(IR_PATH);
  assert.match(src, /Promise\.all\(\[/);
  assert.match(src, /capitalCommitments/);
  assert.match(src, /investorWallets/);
  assert.match(src, /distributions/);
});

test("draftInvestorResponse joins wallets through commitments (one wallet per commitment)", () => {
  const src = read(IR_PATH);
  assert.match(src, /investorWallets\.commitmentId/);
  assert.match(src, /eq\(capitalCommitments\.investorId, investor\.id\)/);
});

test("draftInvestorResponse persists draft with status='draft' (HITL gate)", () => {
  const src = read(IR_PATH);
  assert.match(src, /status: "draft"/);
});

test("draftInvestorResponse records cost on every call", () => {
  const src = read(IR_PATH);
  assert.match(src, /computeCallCost/);
  assert.match(src, /inputCostUsd:/);
});

test("draftInvestorResponse rejects unknown investor cleanly", () => {
  const src = read(IR_PATH);
  assert.match(src, /Investor not found/);
});

test("draftInvestorResponse returns 'budget_exceeded' status without calling provider", () => {
  const src = read(IR_PATH);
  const budgetIdx = src.indexOf("checkBudget(INVESTOR_RELATIONS_KEY)");
  const providerIdx = src.indexOf("provider.complete");
  assert.ok(budgetIdx >= 0 && providerIdx > budgetIdx);
});

test("system prompt forbids speculation / future-return guarantees", () => {
  const src = read(IR_PATH);
  assert.match(src, /Never speculate/);
  assert.match(src, /Never guarantee outcomes/);
});

test("dry-run path produces a localized greeting per language", () => {
  const src = read(IR_PATH);
  for (const greet of ["Dear", "Уважаемый", "Yth\\."]) {
    assert.ok(new RegExp(greet).test(src), `dry-run missing greeting: ${greet}`);
  }
});

test("investor-qa-actions has server-only guard + 5 HITL actions", () => {
  const src = read("src/lib/development/server/investor-qa-actions.ts");
  assert.match(src, /^(import "server-only";|"use server";)/m);
  for (const fn of [
    "generateInvestorDraft",
    "approveInvestorDraft",
    "editAndApproveInvestorDraft",
    "rejectInvestorDraft",
    "markInvestorDraftSent",
  ]) {
    assert.match(src, new RegExp(`export async function ${fn}`));
  }
});

test("markInvestorDraftSent only accepts known channels (defense in depth + DB CHECK)", () => {
  const src = read("src/lib/development/server/investor-qa-actions.ts");
  assert.match(src, /z\.enum\(\["email", "manual_copy", "whatsapp", "portal"\]\)/);
});

// =============================================================================
// 10) HITL inline UI components
// =============================================================================

test("ConstructionAnalysisCard is a client component with all 4 HITL actions", () => {
  const p = "src/components/development/site-reports/construction-analysis-card.tsx";
  assert.ok(exists(p));
  const src = read(p);
  assert.match(src, /^"use client";/m);
  for (const fn of [
    "approveAnalysis",
    "editAndApproveAnalysis",
    "rejectAnalysis",
    "regenerateAnalysisForReport",
  ]) {
    assert.ok(src.includes(fn), `missing button hookup for ${fn}`);
  }
});

test("ConstructionAnalysisCard surfaces safety status with distinct tones", () => {
  const src = read("src/components/development/site-reports/construction-analysis-card.tsx");
  assert.match(src, /SAFETY_TONE/);
  assert.match(src, /serious_concerns: "danger"/);
});

test("InvestorQaPanel is a client component with question form + draft list", () => {
  const p = "src/components/development/investors/investor-qa-panel.tsx";
  assert.ok(exists(p));
  const src = read(p);
  assert.match(src, /^"use client";/m);
  assert.match(src, /generateInvestorDraft/);
  assert.match(src, /markInvestorDraftSent/);
});

test("InvestorQaPanel offers email / manual_copy / whatsapp send channels", () => {
  const src = read("src/components/development/investors/investor-qa-panel.tsx");
  assert.match(src, /sentVia: "email"/);
  assert.match(src, /sentVia: "manual_copy"/);
  assert.match(src, /sentVia: "whatsapp"/);
});

test("Site report detail page mounts ConstructionAnalysisCard", () => {
  const src = read(
    "src/app/(development-app)/development-os/site-reports/[id]/page.tsx",
  );
  assert.match(src, /ConstructionAnalysisCard/);
  assert.match(src, /getActiveAnalysisForReport/);
});

test("Investor detail page mounts InvestorQaPanel", () => {
  const src = read(
    "src/app/(development-app)/development-os/investors/[code]/page.tsx",
  );
  assert.match(src, /InvestorQaPanel/);
  assert.match(src, /getInvestorDrafts/);
});

// =============================================================================
// 11) Cron checklist + Vercel config
// =============================================================================

test("VERCEL-CRON-CHECKLIST documents both Stage 3.B crons", () => {
  const md = read("docs/VERCEL-CRON-CHECKLIST.md");
  assert.match(md, /\/api\/cron\/dev-os-vendor-performance/);
  assert.match(md, /\/api\/cron\/dev-os-construction-supervisor/);
  assert.match(md, /dev_os_vendor_performance/);
  assert.match(md, /dev_os_construction_supervisor/);
});

// =============================================================================
// 12) Demo seed extension
// =============================================================================

test("seed-dev-os.mjs seeds three Stage 3.B agent budgets", () => {
  const src = read("scripts/seed-dev-os.mjs");
  assert.match(src, /dev_os\.construction_supervisor/);
  assert.match(src, /dev_os\.investor_relations/);
  assert.match(src, /dev_os\.translator/);
});

test("seed-dev-os.mjs pre-populates ai_translation_cache with sample EN translations", () => {
  const src = read("scripts/seed-dev-os.mjs");
  assert.match(src, /INSERT INTO ai_translation_cache/);
  assert.match(src, /sourceTranslations|sample.{0,20}translation/i);
});

test("seed-dev-os.mjs creates demo construction analyses across 3 statuses", () => {
  const src = read("scripts/seed-dev-os.mjs");
  assert.match(src, /INSERT INTO ai_construction_analyses/);
  assert.match(src, /draft|approved|edited_approved/);
});

test("seed-dev-os.mjs creates demo investor Q&A drafts", () => {
  const src = read("scripts/seed-dev-os.mjs");
  assert.match(src, /INSERT INTO ai_investor_qa_drafts/);
});
