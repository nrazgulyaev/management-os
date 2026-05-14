/**
 * Stage 10.5.A.2 — Second-batch cabinet dashboards (Site Supervisor /
 * QS / Procurement / Marketing) acceptance tests.
 *
 * Pure replatform: existing cabinet query helpers reused unchanged.
 * Each page swaps PageHeader → PageHeaderHero, MetricCard →
 * status-coded DashboardKpi, and adopts the 2/3-1/3 body split
 * pattern from 10.5.A.1.4.
 *
 * Tests assert the contract: file presence, no-MetricCard, KPI count,
 * primitive imports, gating retained, side panels present.
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

const SITE = "src/app/(development-app)/development-os/cabinets/site-supervisor/page.tsx";
const QS = "src/app/(development-app)/development-os/cabinets/qs/page.tsx";
const PROC =
  "src/app/(development-app)/development-os/cabinets/procurement-manager/page.tsx";
const MKT =
  "src/app/(development-app)/development-os/cabinets/marketing-staff/page.tsx";
const DECISIONS_DOC = "tmp/stage-10-5-a-2-decisions.md";

// Mega-Sprint Phase 1 — Site Supervisor cabinet migrated off the
// 10.5.A.2 contract (CabinetGreetingBlock + PageHeaderHero + 2/3-1/3
// body split) onto the Sprint-4 gold standard (HeroGreetingAI +
// KpiRowMixed + Today's pulse). Removed from the looped contract;
// per-cabinet assertions below are updated separately.
// Other phases will remove their cabinets from this loop as they land.
// Mega-Sprint Phases 3 + 4 — Procurement Manager (Phase 3) and QS
// (Phase 4) migrated off the 10.5.A.2 contract onto the Sprint-4 gold
// standard. Removed from the looped contract; per-cabinet assertions
// below are updated separately.
const PAGES: Array<{ key: string; path: string; gate: string }> = [
  { key: "marketing-staff", path: MKT, gate: "marketing-staff" },
];

// ============================================================================
// Cross-cabinet contract — every page replatformed cleanly
// ============================================================================

for (const p of PAGES) {
  test(`10.5.A.2 — ${p.key} page imports DashboardKpi + PageHeaderHero (no legacy MetricCard)`, () => {
    const src = read(p.path);
    assert.match(src, /\bDashboardKpi\b/);
    assert.match(src, /\bPageHeaderHero\b/);
    assert.doesNotMatch(
      src,
      /from "@\/components\/ui\/metric-card"/,
      `${p.key} cabinet must no longer import the legacy MetricCard`,
    );
  });

  test(`10.5.A.2 — ${p.key} page renders ≥ 4 headline KPI tiles`, () => {
    const src = read(p.path);
    const kpiMatches = src.match(/<DashboardKpi/g) ?? [];
    assert.ok(
      kpiMatches.length >= 4,
      `${p.key}: expected ≥4 DashboardKpi tiles, got ${kpiMatches.length}`,
    );
  });

  test(`10.5.A.2 — ${p.key} page resolves firstName for the hero greeting`, () => {
    const src = read(p.path);
    assert.match(src, /getCurrentAppUser/);
    assert.match(src, /firstName/);
  });

  test(`10.5.A.2 — ${p.key} page wraps data load in safeQuery`, () => {
    const src = read(p.path);
    assert.match(src, /safeQuery\(/);
  });

  test(`10.5.A.2 — ${p.key} page is still gated by gateCabinetForCurrentOrg("${p.gate}")`, () => {
    const src = read(p.path);
    assert.match(
      src,
      new RegExp(`gateCabinetForCurrentOrg\\("${p.gate}"\\)`),
    );
  });

  test(`10.5.A.2 — ${p.key} page uses the 2/3-1/3 body split pattern (lg:col-span-2 + <aside>)`, () => {
    const src = read(p.path);
    assert.match(src, /lg:col-span-2/);
    assert.match(src, /<aside/);
  });
}

// ============================================================================
// Per-cabinet specifics
// ============================================================================

test("mega-sprint phase-1 — Site Supervisor exposes a quick-action strip to capture photos + raise QA/QC", () => {
  const src = read(SITE);
  // The Sprint-4 quick-action strip replaces the Stage-10.5.A.2.1
  // touch-target row. Same operator intent, different visual mass:
  // 3 tiles linking to site-reports/new + qa-qc + the AI agent.
  assert.match(src, /Quick photo · file report/);
  assert.match(src, /Raise QA\/QC issue/);
  assert.match(src, /AI daily digest/);
});

test("mega-sprint phase-1 — Site Supervisor maps existing data into the KpiRowMixed labels", () => {
  const src = read(SITE);
  // KpiRowMixed labels reuse the same fields the 10.5.A.2.1 hero
  // KPI grid surfaced, with operator vocabulary tightened.
  assert.match(src, /Reports today/);
  assert.match(src, /Open QA \/ QC \(mine\)/);
  assert.match(src, /Workforce yesterday/);
  assert.match(src, /Photos yesterday/);
});

test("10.5.A.2.2 — QS surfaces the 'Latest analysis' KPI as a drill into the AI agent output", () => {
  const src = read(QS);
  // Mega-Sprint Phase 4 — KPI now lives in the side rail instead of
  // the headline grid. The drill href + the latest-output binding
  // still anchor the assertion.
  assert.match(src, /Latest analysis/);
  assert.match(src, /qs-cost-analyst\/outputs\//);
});

test("10.5.A.2.2 — QS recent-BOQs list is now a vertical link list (not a flat ul)", () => {
  const src = read(QS);
  // Replatformed list lives inside a divided rounded container.
  assert.match(
    src,
    /rounded-md border border-line-soft bg-surface divide-y divide-line-soft/,
  );
});

test("mega-sprint phase-4 — QS KpiRowMixed surfaces BoQ review / change orders / AI anomaly labels", () => {
  const src = read(QS);
  assert.match(src, /BoQs under review/);
  assert.match(src, /Open change orders/);
  assert.match(src, /AI anomalies \(7d\)/);
});

test("mega-sprint phase-4 — QS exposes a quick-action strip to review BoQ + change orders + AI analyst", () => {
  const src = read(QS);
  assert.match(src, /Review BoQ/);
  assert.match(src, /Change orders/);
  assert.match(src, /AI cost analyst/);
});

test("mega-sprint phase-4 — QS renders inline qs-cost-analyst output grid", () => {
  const src = read(QS);
  assert.match(src, /recentQsAnalystOutputs/);
});

test("mega-sprint phase-3 — Procurement KpiRowMixed surfaces PR / RFQ / PO / Spend MTD labels", () => {
  const src = read(PROC);
  // Mega-Sprint Phase 3 rebuilt the headline KPIs on KpiRowMixed.
  // "Deliveries (7d)" retired — replaced by "Spend (MTD)" sourced
  // from material_purchase_orders this month.
  assert.match(src, /PRs awaiting quotation/);
  assert.match(src, /RFQs to compare/);
  assert.match(src, /Open POs/);
  assert.match(src, /Spend \(MTD\)/);
});

test("10.5.A.2.3 — Procurement side panel cross-links to vendor + inventory surfaces", () => {
  const src = read(PROC);
  assert.match(src, /\/development-os\/vendors/);
  assert.match(src, /\/development-os\/inventory/);
});

test("mega-sprint phase-3 — Procurement exposes a quick-action strip to raise PR + compare quotations + AI analyst", () => {
  const src = read(PROC);
  assert.match(src, /Raise new PR/);
  assert.match(src, /Compare quotations/);
  assert.match(src, /AI procurement analyst/);
});

test("mega-sprint phase-3 — Procurement renders inline procurement-analyst output grid", () => {
  const src = read(PROC);
  assert.match(src, /recentProcurementAnalystOutputs/);
  assert.match(src, /procurement-analyst\/outputs\//);
});

test("10.5.A.2.4 — Marketing headline KPIs surface lead + content signals", () => {
  const src = read(MKT);
  assert.match(src, /Hot leads/);
  assert.match(src, /Leads this week/);
  assert.match(src, /Approval queue/);
  assert.match(src, /Active campaigns/);
});

test("10.5.A.2.4 — Marketing renders the per-status content breakdown when data exists", () => {
  const src = read(MKT);
  // Status entries are sorted DESC by count and rendered as a divided list.
  assert.match(src, /statusEntries/);
  assert.match(src, /b\[1\] - a\[1\]/);
  assert.match(src, /Content by status/);
});

// ============================================================================
// Decisions doc + acceptance gate
// ============================================================================

test("10.5.A.2 — decisions doc shipped + acceptance gate present", () => {
  assert.ok(exists(DECISIONS_DOC));
  const doc = read(DECISIONS_DOC);
  assert.match(doc, /STAGE 10\.5 \/ PHASE 10\.5\.A\.2 ACCEPTED/);
  // All four cabinets named.
  assert.match(doc, /Site Supervisor/i);
  assert.match(doc, /QS/);
  assert.match(doc, /Procurement/);
  assert.match(doc, /Marketing/);
});

test("10.5.A.2 — decisions doc documents the marketing-stays-in-Dev-OS choice", () => {
  const doc = read(DECISIONS_DOC);
  assert.match(doc, /Mgmt OS|Dev OS/);
  assert.match(doc, /marketing/i);
});
