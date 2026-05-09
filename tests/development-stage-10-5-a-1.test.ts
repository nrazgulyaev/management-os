/**
 * Stage 10.5.A.1 — First-batch cabinet dashboards (Owner / CFO / PM)
 * acceptance tests.
 *
 * 10.5.A.1.1 — /dashboard/owner (Mgmt OS) renders PageHeaderHero + 4
 *              DashboardKpi + portfolio + alerts. Backed by a new
 *              owner-cabinet-queries helper.
 * 10.5.A.1.2 — /development-os/cabinets/cfo-accountant replatformed
 *              from MetricCard → DashboardKpi with trend deltas vs
 *              the previous executive_metrics_snapshots row + a
 *              recent-transactions side feed.
 * 10.5.A.1.3 — /development-os/cabinets/project-manager replatformed
 *              with at-risk project mini-feed (riskScore = qa+2*risk
 *              +cos sorted desc, top 5).
 * 10.5.A.1.4 — Pattern doc shipped at docs/stage-10-5-cabinet-dashboard-pattern.md.
 *
 * Tests assert wiring contracts: file presence, primitive imports,
 * query helper return shape, threshold / trend helpers. Live DB
 * round-trips stay out of scope (covered by integration suites).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE =
  typeof __dirname !== "undefined"
    ? __dirname
    : dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8");
}
function exists(rel: string): boolean {
  return existsSync(resolve(ROOT, rel));
}

const OWNER_PAGE = "src/app/(dashboard)/dashboard/owner/page.tsx";
const OWNER_QUERIES =
  "src/lib/development/server/cabinets/owner-cabinet-queries.ts";
const CFO_PAGE =
  "src/app/(development-app)/development-os/cabinets/cfo-accountant/page.tsx";
const CFO_QUERIES =
  "src/lib/development/server/cabinets/cfo-cabinet-queries.ts";
const PM_PAGE =
  "src/app/(development-app)/development-os/cabinets/project-manager/page.tsx";
const PM_QUERIES =
  "src/lib/development/server/cabinets/project-manager-cabinet-queries.ts";
const PATTERN_DOC = "docs/stage-10-5-cabinet-dashboard-pattern.md";

// ============================================================================
// 10.5.A.1.1 — Owner dashboard (Mgmt OS)
// ============================================================================

test("10.5.A.1.1 — owner cabinet page exists at /dashboard/owner", () => {
  assert.ok(exists(OWNER_PAGE), `expected ${OWNER_PAGE} to exist`);
});

test("10.5.A.1.1 — owner page imports the cabinet primitives barrel", () => {
  const src = read(OWNER_PAGE);
  assert.match(src, /from "@\/components\/ui\/primitives"/);
  assert.match(src, /\bDashboardKpi\b/);
  assert.match(src, /\bPageHeaderHero\b/);
  assert.match(src, /\bNoItemsYet\b/);
});

test("10.5.A.1.1 — owner page resolves the current user for the hero greeting", () => {
  const src = read(OWNER_PAGE);
  assert.match(src, /getCurrentAppUser/);
  // firstName is split off the full name and passed to PageHeaderHero.
  assert.match(src, /firstName/);
});

test("10.5.A.1.1 — owner page wraps data load in safeQuery", () => {
  const src = read(OWNER_PAGE);
  assert.match(src, /safeQuery\(\s*"ownerCabinet"/);
});

test("10.5.A.1.1 — owner page renders 4 KPI tiles and a portfolio + alerts split", () => {
  const src = read(OWNER_PAGE);
  const kpiMatches = src.match(/<DashboardKpi/g) ?? [];
  assert.ok(
    kpiMatches.length >= 4,
    `expected ≥4 DashboardKpi tiles, got ${kpiMatches.length}`,
  );
  // 2/3-1/3 split body (portfolio main + alerts aside).
  assert.match(src, /lg:col-span-2/);
  assert.match(src, /<aside/);
});

test("10.5.A.1.1 — owner cabinet queries helper exists and is server-only", () => {
  assert.ok(exists(OWNER_QUERIES));
  const src = read(OWNER_QUERIES);
  assert.match(src, /^import "server-only"/m);
  assert.match(src, /export async function loadOwnerCabinet/);
});

test("10.5.A.1.1 — owner queries return the documented shape (counts, deltas, alerts)", () => {
  const src = read(OWNER_QUERIES);
  // Interface field names must remain stable — the page reads them.
  for (const field of [
    "villasCount",
    "villasInGoodHealthCount",
    "villasInGoodHealthDeltaPct",
    "averageHealthScore",
    "averageHealthScoreDelta",
    "reviewsCount",
    "negativeReviewsCount",
    "villas",
    "alerts",
  ]) {
    assert.match(
      src,
      new RegExp(`\\b${field}\\b`),
      `OwnerCabinetData missing field ${field}`,
    );
  }
});

test("10.5.A.1.1 — owner queries reuse the existing owner-intelligence services", () => {
  const src = read(OWNER_QUERIES);
  // No new SQL — purely an aggregation over the existing services.
  assert.match(src, /listOwnerVillasForCurrentUser/);
  assert.match(src, /listOwnerVillaHealthSnapshots/);
  assert.match(src, /listOwnerVisibleReviews/);
  assert.doesNotMatch(
    src,
    /db\.execute\(/,
    "owner cabinet should not run raw SQL — pure aggregation only",
  );
});

// ============================================================================
// 10.5.A.1.2 — CFO/Accountant dashboard
// ============================================================================

test("10.5.A.1.2 — CFO page imports DashboardKpi + PageHeaderHero (not legacy MetricCard)", () => {
  const src = read(CFO_PAGE);
  assert.match(src, /\bDashboardKpi\b/);
  assert.match(src, /\bPageHeaderHero\b/);
  assert.doesNotMatch(
    src,
    /from "@\/components\/ui\/metric-card"/,
    "CFO cabinet must no longer import the legacy MetricCard",
  );
});

test("10.5.A.1.2 — CFO page renders 4 headline KPIs + cashflow / inbox sub-grids", () => {
  const src = read(CFO_PAGE);
  const kpiMatches = src.match(/<DashboardKpi/g) ?? [];
  // 4 headline + 3 cashflow + 3 inbox = 10 minimum.
  assert.ok(
    kpiMatches.length >= 10,
    `expected ≥10 DashboardKpi tiles across headline + sub-grids, got ${kpiMatches.length}`,
  );
});

test("10.5.A.1.2 — CFO page passes trend deltas via the deltaFor helper (vs prior snapshot)", () => {
  const src = read(CFO_PAGE);
  assert.match(src, /function deltaFor/);
  // Helper must call trendDeltaPct (the canonical helper).
  assert.match(src, /trendDeltaPct/);
  // Headline KPIs receive deltaFor results.
  assert.match(src, /delta=\{deltaFor\(/);
});

test("10.5.A.1.2 — CFO page status helpers encode thresholds (cash, payables, anomalies)", () => {
  const src = read(CFO_PAGE);
  assert.match(src, /function cashStatus/);
  assert.match(src, /function payablesStatus/);
  assert.match(src, /function anomalyStatus/);
});

test("10.5.A.1.2 — CFO page renders a recent-transactions side feed", () => {
  const src = read(CFO_PAGE);
  assert.match(src, /Recent transactions/);
  assert.match(src, /recentTransactions/);
});

test("10.5.A.1.2 — CFO cabinet queries fetch latest + previous snapshots (LIMIT 2)", () => {
  const src = read(CFO_QUERIES);
  assert.match(src, /LIMIT 2/);
  assert.match(src, /previousSnapshot/);
});

test("10.5.A.1.2 — CFO cabinet queries fetch the last 8 dev_transactions", () => {
  const src = read(CFO_QUERIES);
  assert.match(src, /FROM dev_transactions/);
  assert.match(src, /LIMIT 8/);
  assert.match(src, /recentTransactions/);
});

test("10.5.A.1.2 — CFO page is still gated by gateCabinetForCurrentOrg", () => {
  const src = read(CFO_PAGE);
  assert.match(src, /gateCabinetForCurrentOrg\("cfo-accountant"\)/);
});

// ============================================================================
// 10.5.A.1.3 — Project Manager dashboard
// ============================================================================

test("10.5.A.1.3 — PM page imports DashboardKpi + PageHeaderHero (not legacy MetricCard)", () => {
  const src = read(PM_PAGE);
  assert.match(src, /\bDashboardKpi\b/);
  assert.match(src, /\bPageHeaderHero\b/);
  assert.doesNotMatch(src, /from "@\/components\/ui\/metric-card"/);
});

test("10.5.A.1.3 — PM page renders 4 KPI tiles + a critical-path side feed", () => {
  const src = read(PM_PAGE);
  const kpiMatches = src.match(/<DashboardKpi/g) ?? [];
  assert.ok(kpiMatches.length >= 4);
  assert.match(src, /Projects at risk/);
  assert.match(src, /projectsAtRisk/);
});

test("10.5.A.1.3 — PM page is gated by gateCabinetForCurrentOrg", () => {
  const src = read(PM_PAGE);
  assert.match(src, /gateCabinetForCurrentOrg\("project-manager"\)/);
});

test("10.5.A.1.3 — PM cabinet queries return projectsAtRisk with riskScore + budget", () => {
  const src = read(PM_QUERIES);
  assert.match(src, /projectsAtRisk/);
  assert.match(src, /riskScore/);
  // Risk score weighting: qa + 2 * risks + cos.
  assert.match(src, /qaqc \+ risks \* 2 \+ cos/);
  // Budget snapshot per project (sum of dev_budget_lines).
  assert.match(src, /dev_budget_lines/);
  assert.match(src, /budgetUsdMinor/);
});

test("10.5.A.1.3 — PM at-risk query orders projects by risk descending and limits to 5", () => {
  const src = read(PM_QUERIES);
  assert.match(src, /ORDER BY[\s\S]*DESC[\s\S]*LIMIT 5/m);
});

// ============================================================================
// 10.5.A.1.4 — Pattern documentation
// ============================================================================

test("10.5.A.1.4 — pattern doc shipped at docs/stage-10-5-cabinet-dashboard-pattern.md", () => {
  assert.ok(exists(PATTERN_DOC));
  const doc = read(PATTERN_DOC);
  // Required sections.
  assert.match(doc, /Page skeleton/);
  assert.match(doc, /PageHeaderHero/);
  assert.match(doc, /Threshold conventions/);
  assert.match(doc, /Anti-patterns/);
});

test("10.5.A.1.4 — pattern doc references the three reference cabinets", () => {
  const doc = read(PATTERN_DOC);
  assert.match(doc, /dashboard\/owner\/page\.tsx/);
  assert.match(doc, /cfo-accountant\/page\.tsx/);
  assert.match(doc, /project-manager\/page\.tsx/);
});

test("10.5.A.1.4 — pattern doc forbids legacy MetricCard on cabinet dashboards", () => {
  const doc = read(PATTERN_DOC);
  assert.match(doc, /Don't use `<MetricCard>`/);
});

// ============================================================================
// Decisions doc
// ============================================================================

test("10.5.A.1 — decisions doc shipped + acceptance gate present", () => {
  const path = "tmp/stage-10-5-a-1-decisions.md";
  assert.ok(exists(path));
  const doc = read(path);
  assert.match(doc, /STAGE 10\.5 \/ PHASE 10\.5\.A\.1 ACCEPTED/);
  assert.match(doc, /Owner/);
  assert.match(doc, /CFO/);
  assert.match(doc, /Project Manager/);
});
