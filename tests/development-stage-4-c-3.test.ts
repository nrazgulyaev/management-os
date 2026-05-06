/**
 * Stage 4.C.3 — Project Memory + Variations tests.
 *
 * Static-source tests for migration 0053, schema, server modules,
 * UI routes (Decisions, Risks, Change Orders).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");
const exists = (rel: string) => existsSync(resolve(ROOT, rel));

const MIG_0053 = "drizzle/0053_development_os_stage_4_c_3_memory_variations.sql";

// ===========================================================================
// 1) Migration 0053 — shape
// ===========================================================================

test("migration 0053 file exists and wraps in BEGIN/COMMIT", () => {
  assert.ok(exists(MIG_0053));
  const sql = read(MIG_0053);
  assert.match(sql, /^BEGIN;/m);
  assert.match(sql, /^COMMIT;/m);
});

test("migration 0053 creates 3 new tables", () => {
  const sql = read(MIG_0053);
  for (const t of ["project_decisions", "project_risks", "change_orders"]) {
    assert.match(
      sql,
      new RegExp(`CREATE TABLE IF NOT EXISTS "${t}"`),
      `${t} create missing`,
    );
  }
});

test("migration 0053 project_decisions has 4 statuses", () => {
  const sql = read(MIG_0053);
  for (const s of ["draft", "active", "superseded", "reversed"]) {
    assert.ok(sql.includes(`'${s}'`), `decision status '${s}' missing`);
  }
});

test("migration 0053 project_decisions has self-FK supersede flow", () => {
  const sql = read(MIG_0053);
  assert.match(
    sql,
    /"superseded_by" UUID REFERENCES "project_decisions"\("id"\)/,
  );
});

test("migration 0053 project_risks has 14 risk categories", () => {
  const sql = read(MIG_0053);
  for (const c of [
    "land_legal",
    "permit_delay",
    "weather",
    "supplier_delay",
    "fx_currency",
    "buyer_payment_delay",
    "cost_overrun",
    "quality_issue",
    "labor_shortage",
    "investor_funding_delay",
    "tax_uncertainty",
    "design_change",
    "safety",
    "other",
  ]) {
    assert.ok(sql.includes(`'${c}'`), `risk category '${c}' missing`);
  }
});

test("migration 0053 project_risks has 5-level probability + 5-level impact", () => {
  const sql = read(MIG_0053);
  for (const p of ["very_low", "low", "medium", "high", "very_high"]) {
    assert.ok(sql.includes(`'${p}'`), `probability '${p}' missing`);
  }
  for (const i of ["minor", "moderate", "major", "severe", "catastrophic"]) {
    assert.ok(sql.includes(`'${i}'`), `impact '${i}' missing`);
  }
});

test("migration 0053 project_risks risk_score is GENERATED STORED (P × I)", () => {
  const sql = read(MIG_0053);
  assert.match(sql, /"risk_score" INTEGER GENERATED ALWAYS AS \(/);
  assert.match(sql, /CASE "probability"/);
  assert.match(sql, /CASE "impact"/);
  assert.match(sql, /\) STORED/);
});

test("migration 0053 project_risks has 6 mitigation_status values", () => {
  const sql = read(MIG_0053);
  for (const s of [
    "identified",
    "planning_mitigation",
    "mitigating",
    "monitored",
    "closed_resolved",
    "closed_realized",
  ]) {
    assert.ok(sql.includes(`'${s}'`), `mitigation status '${s}' missing`);
  }
});

test("migration 0053 change_orders has 7 initiation types", () => {
  const sql = read(MIG_0053);
  for (const t of [
    "arconique_internal",
    "buyer_request",
    "investor_request",
    "vendor_proposed",
    "regulatory",
    "design_correction",
    "site_condition",
  ]) {
    assert.ok(sql.includes(`'${t}'`), `initiation type '${t}' missing`);
  }
});

test("migration 0053 change_orders has 7 statuses", () => {
  const sql = read(MIG_0053);
  for (const s of [
    "requested",
    "under_review",
    "approved",
    "in_progress",
    "completed",
    "rejected",
    "cancelled",
  ]) {
    assert.ok(sql.includes(`'${s}'`), `change order status '${s}' missing`);
  }
});

test("migration 0053 change_orders cost_impact_minor is BIGINT (allows negative for downgrades)", () => {
  const sql = read(MIG_0053);
  assert.match(sql, /"cost_impact_minor" BIGINT NOT NULL DEFAULT 0/);
  // No CHECK >= 0 — must allow negative.
  assert.doesNotMatch(sql, /CHECK \("cost_impact_minor" >= 0\)/);
});

test("migration 0053 adds forward-FK constraints", () => {
  const sql = read(MIG_0053);
  assert.match(sql, /qa_qc_issues_change_order_fk/);
  assert.match(sql, /project_decisions_change_order_fk/);
});

test("migration 0053 RLS protects all 3 new tables", () => {
  const sql = read(MIG_0053);
  for (const t of ["project_decisions", "project_risks", "change_orders"]) {
    assert.ok(sql.includes(`'${t}'`), `RLS loop missing ${t}`);
  }
  assert.match(sql, /FORCE ROW LEVEL SECURITY/);
});

// ===========================================================================
// 2) Schema files
// ===========================================================================

test("Stage 4.C.3 schema files exist + re-exported", () => {
  assert.ok(exists("src/lib/db/schema/project-memory.ts"));
  const idx = read("src/lib/db/schema/index.ts");
  assert.match(idx, /export \* from "\.\/project-memory";/);
});

// ===========================================================================
// 3) Server modules
// ===========================================================================

test("Stage 4.C.3 server modules exist + use server-only", () => {
  for (const rel of [
    "src/lib/development/server/decisions/decision-queries.ts",
    "src/lib/development/server/decisions/decision-actions.ts",
    "src/lib/development/server/risks/risk-queries.ts",
    "src/lib/development/server/risks/risk-actions.ts",
    "src/lib/development/server/change-orders/change-order-queries.ts",
    "src/lib/development/server/change-orders/change-order-actions.ts",
  ]) {
    assert.ok(exists(rel), `missing ${rel}`);
    const src = read(rel);
    assert.match(src, /^(import "server-only"|"use server")/m, `${rel} missing server-only`);
  }
});

test("decision-actions: supersede flow is atomic (db.transaction)", () => {
  const src = read(
    "src/lib/development/server/decisions/decision-actions.ts",
  );
  assert.match(src, /db\.transaction/);
  assert.match(src, /superseded/);
  assert.match(src, /supersededBy: newDec\.id/);
});

test("decision-actions: supersede refuses non-active source", () => {
  const src = read(
    "src/lib/development/server/decisions/decision-actions.ts",
  );
  assert.match(src, /cannot supersede decision in status/);
});

test("change-order-actions: enforces status transition table", () => {
  const src = read(
    "src/lib/development/server/change-orders/change-order-actions.ts",
  );
  assert.match(src, /VALID_NEXT/);
  assert.match(src, /cannot transition change_order from/);
});

test("change-order-actions: lookupChangeOrderApproval reuses Stage 4.A approval-helpers", () => {
  const src = read(
    "src/lib/development/server/change-orders/change-order-actions.ts",
  );
  assert.match(src, /lookupRequiredApproval/);
});

test("change-order-actions: uses absolute cost for threshold lookup (downgrades still need approval)", () => {
  const src = read(
    "src/lib/development/server/change-orders/change-order-actions.ts",
  );
  assert.match(src, /absCost/);
});

test("risk-actions: closing the risk stamps closedAt", () => {
  const src = read("src/lib/development/server/risks/risk-actions.ts");
  assert.match(src, /closed_/);
  assert.match(src, /closedAt/);
});

// ===========================================================================
// 4) UI routes — REQUIRED, no deferral
// ===========================================================================

const DECISION_ROUTES = [
  "src/app/(development-app)/development-os/projects/[slug]/decisions/page.tsx",
  "src/app/(development-app)/development-os/projects/[slug]/decisions/[code]/page.tsx",
  "src/app/(development-app)/development-os/projects/[slug]/decisions/new/page.tsx",
];

const RISK_ROUTES = [
  "src/app/(development-app)/development-os/projects/[slug]/risks/page.tsx",
  "src/app/(development-app)/development-os/projects/[slug]/risks/[code]/page.tsx",
  "src/app/(development-app)/development-os/projects/[slug]/risks/new/page.tsx",
  "src/app/(development-app)/development-os/projects/[slug]/risks/heatmap/page.tsx",
];

const CO_ROUTES = [
  "src/app/(development-app)/development-os/projects/[slug]/change-orders/page.tsx",
  "src/app/(development-app)/development-os/projects/[slug]/change-orders/[code]/page.tsx",
  "src/app/(development-app)/development-os/projects/[slug]/change-orders/new/page.tsx",
];

test("Decisions: list + detail + create routes all exist", () => {
  for (const rel of DECISION_ROUTES) {
    assert.ok(exists(rel), `missing ${rel}`);
  }
});

test("Risks: list + detail + create + heatmap routes all exist", () => {
  for (const rel of RISK_ROUTES) {
    assert.ok(exists(rel), `missing ${rel}`);
  }
});

test("Change Orders: list + detail + create routes all exist", () => {
  for (const rel of CO_ROUTES) {
    assert.ok(exists(rel), `missing ${rel}`);
  }
});

test("All Stage 4.C.3 UI routes wrap in DevelopmentShell + force-dynamic", () => {
  for (const rel of [...DECISION_ROUTES, ...RISK_ROUTES, ...CO_ROUTES]) {
    const src = read(rel);
    assert.match(src, /DevelopmentShell/, `${rel} missing DevelopmentShell`);
    assert.match(src, /force-dynamic/, `${rel} missing force-dynamic`);
  }
});

test("Risk heatmap renders P × I matrix table", () => {
  const src = read(
    "src/app/(development-app)/development-os/projects/[slug]/risks/heatmap/page.tsx",
  );
  assert.match(src, /Probability × Impact/);
  // 5 probability levels × 5 impact levels.
  assert.match(src, /PROBABILITIES/);
  assert.match(src, /IMPACTS/);
  // Color bands.
  assert.match(src, /bg-red-200|bg-amber-200|bg-yellow-100|bg-green-100/);
});

test("RiskForm shows live preview of risk_score (P × I) before submission", () => {
  const src = read("src/components/development/risks/risk-form.tsx");
  assert.match(src, /previewScore/);
  assert.match(src, /useMemo/);
});

test("RiskForm covers all 5 probability + 5 impact levels", () => {
  const src = read("src/components/development/risks/risk-form.tsx");
  for (const p of ["very_low", "low", "medium", "high", "very_high"]) {
    assert.ok(src.includes(`"${p}"`));
  }
  for (const i of ["minor", "moderate", "major", "severe", "catastrophic"]) {
    assert.ok(src.includes(`"${i}"`));
  }
});

test("ChangeOrderForm allows negative cost + schedule impact (downgrades)", () => {
  const src = read(
    "src/components/development/change-orders/change-order-form.tsx",
  );
  // Must NOT have min="0" on the cost / schedule inputs.
  assert.doesNotMatch(src, /name="costImpact"[^>]*min="0"/);
  assert.match(src, /can be negative/);
});

test("ChangeOrderForm covers all 7 initiation types", () => {
  const src = read(
    "src/components/development/change-orders/change-order-form.tsx",
  );
  for (const t of [
    "arconique_internal",
    "buyer_request",
    "investor_request",
    "vendor_proposed",
    "regulatory",
    "design_correction",
    "site_condition",
  ]) {
    assert.ok(src.includes(`"${t}"`));
  }
});

test("DecisionForm covers categories + tag input", () => {
  const src = read("src/components/development/decisions/decision-form.tsx");
  assert.match(src, /CATEGORIES/);
  assert.match(src, /tags/);
});

test("All Stage 4.C.3 client components use 'use client' + useTransition", () => {
  for (const rel of [
    "src/components/development/decisions/decision-form.tsx",
    "src/components/development/risks/risk-form.tsx",
    "src/components/development/change-orders/change-order-form.tsx",
  ]) {
    const src = read(rel);
    assert.match(src, /^"use client"/m);
    assert.match(src, /useTransition/);
  }
});

test("All Stage 4.C.3 list pages route through safeQuery", () => {
  for (const rel of [
    "src/app/(development-app)/development-os/projects/[slug]/decisions/page.tsx",
    "src/app/(development-app)/development-os/projects/[slug]/risks/page.tsx",
    "src/app/(development-app)/development-os/projects/[slug]/change-orders/page.tsx",
  ]) {
    const src = read(rel);
    assert.match(src, /safeQuery/);
  }
});
