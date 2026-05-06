/**
 * Stage 5.B — Strategic Features tests.
 *
 * Mix of:
 *   - Migration shape tests (0057, 0058, 0059)
 *   - Schema export tests
 *   - Pure helper tests:
 *     - cycle-helpers (computePayrollRunway, predictTeamIdle, computeProjectCycleAdvisory)
 *     - profitability-helpers (computeUnitCostBasis, computeMarginPercentage, verifyAllocationConservation)
 *     - cashflow-helpers (computeMonthlyCashflowProjection)
 *   - Server module tests (server-only guards)
 *   - Cron wiring + dispatcher + route audit
 *   - Sidebar audit
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  computePayrollRunway,
  predictTeamIdle,
  computeProjectCycleAdvisory,
} from "../src/lib/development/server/project-cycle/cycle-helpers";
import {
  computeUnitCostBasis,
  computeMarginPercentage,
  verifyAllocationConservation,
} from "../src/lib/development/server/profitability/profitability-helpers";
import { computeMonthlyCashflowProjection } from "../src/lib/development/server/cashflow/cashflow-helpers";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");
const exists = (rel: string) => existsSync(resolve(ROOT, rel));

const MIG_0057 = "drizzle/0057_development_os_stage_5_b_1_multi_asset.sql";
const MIG_0058 = "drizzle/0058_development_os_stage_5_b_2_project_cycle.sql";
const MIG_0059 = "drizzle/0059_development_os_stage_5_b_3_profitability_cashflow.sql";

// ===========================================================================
// 1) Migration 0057 — Multi-Asset (Strategy B)
// ===========================================================================

test("migration 0057 file exists + wraps in BEGIN/COMMIT", () => {
  assert.ok(exists(MIG_0057));
  const sql = read(MIG_0057);
  assert.match(sql, /^BEGIN;/m);
  assert.match(sql, /^COMMIT;/m);
});

test("migration 0057 creates asset_types registry", () => {
  const sql = read(MIG_0057);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "asset_types"/);
  assert.match(sql, /"type_key" TEXT/);
  assert.match(sql, /UNIQUE/);
});

test("migration 0057 seeds 12 default asset types", () => {
  const sql = read(MIG_0057);
  for (const k of [
    "villa", "apartment", "hotel_room", "hotel_suite", "restaurant_table",
    "spa_treatment_room", "mixed_use_unit", "retail_space", "office_space",
    "land_parcel", "pool", "common_area",
  ]) {
    assert.ok(sql.includes(`'${k}'`), `seed type_key '${k}' missing`);
  }
});

test("migration 0057 extends villas with asset_type_id + asset_attributes", () => {
  const sql = read(MIG_0057);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "asset_type_id"/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "asset_attributes"/);
});

test("migration 0057 backfills villas to villa type before SET NOT NULL", () => {
  const sql = read(MIG_0057);
  assert.match(sql, /UPDATE "villas"[\s\S]*?SET "asset_type_id"/);
  assert.match(sql, /ALTER TABLE "villas"[\s\S]*?ALTER COLUMN "asset_type_id" SET NOT NULL/);
});

test("migration 0057 creates assets read-only view joining villas + asset_types", () => {
  const sql = read(MIG_0057);
  assert.match(sql, /CREATE OR REPLACE VIEW "assets"/);
  assert.match(sql, /FROM "villas"/);
  assert.match(sql, /JOIN "asset_types"/);
});

test("migration 0057 does NOT rename villas table (Strategy B preserves FKs)", () => {
  const sql = read(MIG_0057);
  assert.doesNotMatch(sql, /ALTER TABLE "villas" RENAME TO/);
  assert.doesNotMatch(sql, /DROP TABLE "villas"/);
});

test("migration 0057 creates revenue_streams with bigint amounts", () => {
  const sql = read(MIG_0057);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "revenue_streams"/);
  assert.match(sql, /"gross_revenue_minor" BIGINT/);
  assert.match(sql, /"net_revenue_minor" BIGINT GENERATED ALWAYS AS/);
});

test("migration 0057 enables RLS + internal_only policies on new tables", () => {
  const sql = read(MIG_0057);
  for (const t of ["asset_types", "revenue_streams"]) {
    assert.ok(
      sql.includes(`'${t}'`) || sql.includes(`"${t}"`),
      `${t} missing from RLS block`,
    );
  }
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /is_internal_user\(\)/);
});

// ===========================================================================
// 2) Migration 0058 — Project Cycle Intelligence
// ===========================================================================

test("migration 0058 file exists + wraps in BEGIN/COMMIT", () => {
  assert.ok(exists(MIG_0058));
  const sql = read(MIG_0058);
  assert.match(sql, /^BEGIN;/m);
  assert.match(sql, /^COMMIT;/m);
});

test("migration 0058 creates payroll_periods", () => {
  const sql = read(MIG_0058);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "payroll_periods"/);
  assert.match(sql, /"period_label" TEXT NOT NULL UNIQUE/);
  assert.match(sql, /CHECK \("period_end" >= "period_start"\)/);
});

test("migration 0058 payroll period_type enum has 4 values", () => {
  const sql = read(MIG_0058);
  for (const v of ["weekly", "biweekly", "monthly", "quarterly"]) {
    assert.ok(sql.includes(`'${v}'`), `period_type '${v}' missing`);
  }
});

test("migration 0058 payroll status enum has 4 values", () => {
  const sql = read(MIG_0058);
  for (const v of ["projected", "committed", "paid", "archived"]) {
    assert.ok(sql.includes(`'${v}'`), `status '${v}' missing`);
  }
});

test("migration 0058 creates team_capacity_tracking with GENERATED utilization_rate", () => {
  const sql = read(MIG_0058);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "team_capacity_tracking"/);
  assert.match(
    sql,
    /"utilization_rate" NUMERIC\(7,2\) GENERATED ALWAYS AS[\s\S]*?STORED/,
  );
});

test("migration 0058 team_capacity_tracking idle_hours is GENERATED with GREATEST(...,0)", () => {
  const sql = read(MIG_0058);
  assert.match(
    sql,
    /"idle_hours" NUMERIC\(10,2\) GENERATED ALWAYS AS[\s\S]*?GREATEST/,
  );
});

test("migration 0058 team_capacity role_type covers 10 roles", () => {
  const sql = read(MIG_0058);
  for (const r of [
    "pm", "qs", "site_supervisor", "engineer", "architect",
    "designer", "admin", "sales", "finance", "other",
  ]) {
    assert.ok(sql.includes(`'${r}'`), `role_type '${r}' missing`);
  }
});

test("migration 0058 creates project_cycle_recommendations with 7 actions", () => {
  const sql = read(MIG_0058);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "project_cycle_recommendations"/);
  for (const a of [
    "start_new_project_now",
    "start_new_project_in_X_weeks",
    "pause_team_capacity",
    "reduce_team_size",
    "increase_team_size",
    "continue_current_pace",
    "reallocate_capacity",
  ]) {
    assert.ok(sql.includes(`'${a}'`), `recommended_action '${a}' missing`);
  }
});

test("migration 0058 recommendations has 5 operator_status values", () => {
  const sql = read(MIG_0058);
  for (const s of [
    "unreviewed", "reviewed", "accepted", "rejected", "partially_accepted",
  ]) {
    assert.ok(sql.includes(`'${s}'`), `operator_status '${s}' missing`);
  }
});

test("migration 0058 enables RLS + internal_only policies", () => {
  const sql = read(MIG_0058);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /is_internal_user\(\)/);
});

// ===========================================================================
// 3) Migration 0059 — Profitability + Cashflow
// ===========================================================================

test("migration 0059 file exists + wraps in BEGIN/COMMIT", () => {
  assert.ok(exists(MIG_0059));
  const sql = read(MIG_0059);
  assert.match(sql, /^BEGIN;/m);
  assert.match(sql, /^COMMIT;/m);
});

test("migration 0059 creates unit_cost_allocations", () => {
  const sql = read(MIG_0059);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "unit_cost_allocations"/);
  assert.match(sql, /"asset_id" UUID NOT NULL REFERENCES "villas"/);
});

test("migration 0059 unit_cost_allocations has GENERATED total_cost_basis_minor", () => {
  const sql = read(MIG_0059);
  assert.match(
    sql,
    /"total_cost_basis_minor" BIGINT GENERATED ALWAYS AS[\s\S]*?STORED/,
  );
});

test("migration 0059 unit_cost_allocations has GENERATED expected_margin_minor", () => {
  const sql = read(MIG_0059);
  assert.match(
    sql,
    /"expected_margin_minor" BIGINT GENERATED ALWAYS AS[\s\S]*?STORED/,
  );
});

test("migration 0059 enforces partial unique current allocation per asset", () => {
  const sql = read(MIG_0059);
  assert.match(
    sql,
    /CREATE UNIQUE INDEX IF NOT EXISTS "unit_cost_allocations_asset_current_unique"[\s\S]*?WHERE "is_current" = TRUE/,
  );
});

test("migration 0059 creates cashflow_forecasts", () => {
  const sql = read(MIG_0059);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "cashflow_forecasts"/);
});

test("migration 0059 cashflow scope is project XOR company_wide via CHECK", () => {
  const sql = read(MIG_0059);
  assert.match(sql, /CONSTRAINT "cashflow_forecasts_scope_xor"/);
  assert.match(sql, /scope = 'company_wide' AND project_id IS NULL/);
  assert.match(sql, /scope = 'project' AND project_id IS NOT NULL/);
});

test("migration 0059 cashflow status enum has 4 values", () => {
  const sql = read(MIG_0059);
  for (const s of ["draft", "active", "archived", "superseded"]) {
    assert.ok(sql.includes(`'${s}'`), `cashflow status '${s}' missing`);
  }
});

test("migration 0059 enables RLS + internal_only policies", () => {
  const sql = read(MIG_0059);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /is_internal_user\(\)/);
});

// ===========================================================================
// 4) Schema exports
// ===========================================================================

test("schema/index.ts exports new 5.B schema files", () => {
  const idx = read("src/lib/db/schema/index.ts");
  assert.match(idx, /export \* from "\.\/asset-types"/);
  assert.match(idx, /export \* from "\.\/revenue-streams"/);
  assert.match(idx, /export \* from "\.\/project-cycle"/);
  assert.match(idx, /export \* from "\.\/profitability-cashflow"/);
});

test("schema/asset-types defines assetTypes table", async () => {
  const m = await import("../src/lib/db/schema/asset-types");
  assert.ok(m.assetTypes);
});

test("schema/revenue-streams defines revenueStreams table", async () => {
  const m = await import("../src/lib/db/schema/revenue-streams");
  assert.ok(m.revenueStreams);
});

test("schema/project-cycle defines payrollPeriods + teamCapacityTracking + projectCycleRecommendations", async () => {
  const m = await import("../src/lib/db/schema/project-cycle");
  assert.ok(m.payrollPeriods);
  assert.ok(m.teamCapacityTracking);
  assert.ok(m.projectCycleRecommendations);
});

test("schema/profitability-cashflow defines unitCostAllocations + cashflowForecasts", async () => {
  const m = await import("../src/lib/db/schema/profitability-cashflow");
  assert.ok(m.unitCostAllocations);
  assert.ok(m.cashflowForecasts);
});

test("schema/projects.villas now has assetTypeId + assetAttributes", async () => {
  const m = await import("../src/lib/db/schema/projects");
  assert.ok(m.villas, "villas export missing");
  // Drizzle columns expose .name on the column metadata.
  const cols: Record<string, unknown> = m.villas as unknown as Record<string, unknown>;
  assert.ok("assetTypeId" in cols, "assetTypeId column missing");
  assert.ok("assetAttributes" in cols, "assetAttributes column missing");
});

// ===========================================================================
// 5) computePayrollRunway pure helper
// ===========================================================================

test("payroll runway: cash with no inflows burns down", () => {
  const r = computePayrollRunway({
    cashOnHand: 1_000_000,
    monthlyPayrollCommitment: 100_000,
    monthlyOtherFixedCosts: 50_000,
    expectedInflowsByMonth: [],
  });
  assert.equal(r.runwayMonths, 6); // 1M / 150k = 6.66 → walks 6 months before negative
  assert.equal(r.riskLevel, "watch");
});

test("payroll runway: zero burn → max runway 60 months", () => {
  const r = computePayrollRunway({
    cashOnHand: 1_000_000,
    monthlyPayrollCommitment: 0,
    monthlyOtherFixedCosts: 0,
    expectedInflowsByMonth: [],
  });
  assert.equal(r.runwayMonths, 60);
  assert.equal(r.riskLevel, "safe");
});

test("payroll runway: critical when < 3 months runway", () => {
  const r = computePayrollRunway({
    cashOnHand: 200_000,
    monthlyPayrollCommitment: 100_000,
    monthlyOtherFixedCosts: 50_000,
    expectedInflowsByMonth: [],
  });
  assert.equal(r.riskLevel, "critical");
});

test("payroll runway: concerning at 3-5 months", () => {
  const r = computePayrollRunway({
    cashOnHand: 500_000,
    monthlyPayrollCommitment: 100_000,
    monthlyOtherFixedCosts: 50_000,
    expectedInflowsByMonth: [],
  });
  assert.equal(r.riskLevel, "concerning");
});

test("payroll runway: watch at 6-11 months", () => {
  const r = computePayrollRunway({
    cashOnHand: 1_200_000,
    monthlyPayrollCommitment: 100_000,
    monthlyOtherFixedCosts: 50_000,
    expectedInflowsByMonth: [],
  });
  assert.equal(r.riskLevel, "watch");
});

test("payroll runway: safe at 12+ months", () => {
  const r = computePayrollRunway({
    cashOnHand: 2_000_000,
    monthlyPayrollCommitment: 100_000,
    monthlyOtherFixedCosts: 50_000,
    expectedInflowsByMonth: [],
  });
  assert.equal(r.riskLevel, "safe");
});

test("payroll runway: inflows extend runway", () => {
  const noInflow = computePayrollRunway({
    cashOnHand: 200_000,
    monthlyPayrollCommitment: 100_000,
    monthlyOtherFixedCosts: 50_000,
    expectedInflowsByMonth: [],
  });
  const withInflow = computePayrollRunway({
    cashOnHand: 200_000,
    monthlyPayrollCommitment: 100_000,
    monthlyOtherFixedCosts: 50_000,
    expectedInflowsByMonth: [200_000, 200_000, 200_000],
  });
  assert.ok(withInflow.runwayMonths > noInflow.runwayMonths);
});

test("payroll runway: cashAt30/60/90 reflect monthly walk", () => {
  const r = computePayrollRunway({
    cashOnHand: 500_000,
    monthlyPayrollCommitment: 100_000,
    monthlyOtherFixedCosts: 0,
    expectedInflowsByMonth: [],
  });
  assert.equal(r.cashAt30Days, 400_000);
  assert.equal(r.cashAt60Days, 300_000);
  assert.equal(r.cashAt90Days, 200_000);
});

test("payroll runway: throws on negative payroll commitment", () => {
  assert.throws(() =>
    computePayrollRunway({
      cashOnHand: 0,
      monthlyPayrollCommitment: -1,
      monthlyOtherFixedCosts: 0,
      expectedInflowsByMonth: [],
    }),
  );
});

test("payroll runway: throws on non-finite cash", () => {
  assert.throws(() =>
    computePayrollRunway({
      cashOnHand: NaN,
      monthlyPayrollCommitment: 100,
      monthlyOtherFixedCosts: 0,
      expectedInflowsByMonth: [],
    }),
  );
});

test("payroll runway: cash sufficient for 11 months → watch", () => {
  const r = computePayrollRunway({
    cashOnHand: 1_650_000,
    monthlyPayrollCommitment: 100_000,
    monthlyOtherFixedCosts: 50_000,
    expectedInflowsByMonth: [],
  });
  assert.equal(r.riskLevel, "watch");
});

test("payroll runway: zero cash + zero burn returns max", () => {
  const r = computePayrollRunway({
    cashOnHand: 0,
    monthlyPayrollCommitment: 0,
    monthlyOtherFixedCosts: 0,
    expectedInflowsByMonth: [],
  });
  assert.equal(r.runwayMonths, 60);
});

test("payroll runway: huge cash → 60 month cap", () => {
  const r = computePayrollRunway({
    cashOnHand: 1_000_000_000,
    monthlyPayrollCommitment: 1,
    monthlyOtherFixedCosts: 0,
    expectedInflowsByMonth: [],
  });
  assert.equal(r.runwayMonths, 60);
});

// ===========================================================================
// 6) predictTeamIdle pure helper
// ===========================================================================

test("predictTeamIdle: zero capacity returns nulls", () => {
  const r = predictTeamIdle({
    activeProjects: [],
    teamTotalCapacity: 0,
    currentDate: new Date("2026-01-01"),
  });
  assert.equal(r.predictedIdleStartDate, null);
  assert.equal(r.weeksUntilIdle, null);
});

test("predictTeamIdle: no active projects → idle today", () => {
  const today = new Date("2026-01-01");
  const r = predictTeamIdle({
    activeProjects: [],
    teamTotalCapacity: 100,
    currentDate: today,
  });
  assert.equal(r.weeksUntilIdle, 0);
  assert.equal(r.predictedIdleHoursPerWeek, 100);
  assert.equal(r.predictedIdleStartDate?.getTime(), today.getTime());
});

test("predictTeamIdle: more than 20% idle currently → idle now", () => {
  const r = predictTeamIdle({
    activeProjects: [
      {
        progressPct: 50,
        expectedCompletionDate: new Date("2027-01-01"),
        monthlyTeamHours: 100,
      },
    ],
    teamTotalCapacity: 200,
    currentDate: new Date("2026-01-01"),
  });
  // 100 monthly / 4.33 ≈ 23 weekly; 200-23 ≈ 177 idle, > 40 (20% of 200)
  assert.equal(r.weeksUntilIdle, 0);
});

test("predictTeamIdle: full utilization until completion", () => {
  const today = new Date("2026-01-01");
  const completion = new Date("2026-04-01");
  const r = predictTeamIdle({
    activeProjects: [
      {
        progressPct: 50,
        expectedCompletionDate: completion,
        monthlyTeamHours: 800, // ~185 weekly
      },
    ],
    teamTotalCapacity: 200,
    currentDate: today,
  });
  assert.equal(r.predictedIdleStartDate?.getTime(), completion.getTime());
  assert.ok(r.weeksUntilIdle != null && r.weeksUntilIdle > 0);
});

test("predictTeamIdle: earliest-completion project is the trigger", () => {
  const r = predictTeamIdle({
    activeProjects: [
      {
        progressPct: 50,
        expectedCompletionDate: new Date("2027-06-01"),
        monthlyTeamHours: 400,
      },
      {
        progressPct: 80,
        expectedCompletionDate: new Date("2026-03-01"),
        monthlyTeamHours: 400,
      },
    ],
    teamTotalCapacity: 200,
    currentDate: new Date("2026-01-01"),
  });
  assert.equal(
    r.predictedIdleStartDate?.toISOString().slice(0, 10),
    "2026-03-01",
  );
});

// ===========================================================================
// 7) computeProjectCycleAdvisory pure helper (decision tree)
// ===========================================================================

test("advisory: critical runway → pause_team_capacity", () => {
  const r = computeProjectCycleAdvisory({
    currentDate: new Date("2026-01-01"),
    cashOnHand: 100_000,
    receivablesNext30Days: 0,
    payablesNext30Days: 0,
    monthlyPayrollCommitment: 100_000,
    monthlyOtherFixedCosts: 0,
    expectedInflowsByMonth: [],
    activeProjects: [],
    teamRoles: [{ role: "pm", totalCapacity: 100, utilizedCapacity: 80 }],
    unsoldUnits: 0,
    cashFromExpectedSales: 0,
  });
  assert.equal(r.recommendedAction, "pause_team_capacity");
  assert.equal(r.payrollRunwayRisk, "critical");
});

test("advisory: concerning runway → continue_current_pace + medium confidence", () => {
  const r = computeProjectCycleAdvisory({
    currentDate: new Date("2026-01-01"),
    cashOnHand: 400_000,
    receivablesNext30Days: 0,
    payablesNext30Days: 0,
    monthlyPayrollCommitment: 100_000,
    monthlyOtherFixedCosts: 0,
    expectedInflowsByMonth: [],
    activeProjects: [],
    teamRoles: [{ role: "pm", totalCapacity: 100, utilizedCapacity: 80 }],
    unsoldUnits: 0,
    cashFromExpectedSales: 0,
  });
  assert.equal(r.recommendedAction, "continue_current_pace");
  assert.equal(r.confidenceLevel, "medium");
});

test("advisory: idle capacity + safe → start_new_project_now", () => {
  const r = computeProjectCycleAdvisory({
    currentDate: new Date("2026-01-01"),
    cashOnHand: 5_000_000,
    receivablesNext30Days: 0,
    payablesNext30Days: 0,
    monthlyPayrollCommitment: 100_000,
    monthlyOtherFixedCosts: 0,
    expectedInflowsByMonth: [],
    activeProjects: [],
    teamRoles: [{ role: "pm", totalCapacity: 100, utilizedCapacity: 30 }],
    unsoldUnits: 0,
    cashFromExpectedSales: 0,
  });
  assert.equal(r.recommendedAction, "start_new_project_now");
});

test("advisory: utilization > 95% + safe → increase_team_size", () => {
  const r = computeProjectCycleAdvisory({
    currentDate: new Date("2026-01-01"),
    cashOnHand: 5_000_000,
    receivablesNext30Days: 0,
    payablesNext30Days: 0,
    monthlyPayrollCommitment: 100_000,
    monthlyOtherFixedCosts: 0,
    expectedInflowsByMonth: [],
    activeProjects: [
      {
        projectId: "p1",
        progressPercentage: 30,
        expectedCompletionDate: new Date("2027-12-01"),
        monthlyBurnRate: 50_000,
        monthlyTeamHours: 400,
      },
    ],
    teamRoles: [{ role: "pm", totalCapacity: 100, utilizedCapacity: 99 }],
    unsoldUnits: 0,
    cashFromExpectedSales: 0,
  });
  assert.equal(r.recommendedAction, "increase_team_size");
});

test("advisory: timing window → start_new_project_in_X_weeks", () => {
  const r = computeProjectCycleAdvisory({
    currentDate: new Date("2026-01-01"),
    cashOnHand: 5_000_000,
    receivablesNext30Days: 0,
    payablesNext30Days: 0,
    monthlyPayrollCommitment: 100_000,
    monthlyOtherFixedCosts: 0,
    expectedInflowsByMonth: [],
    activeProjects: [
      {
        projectId: "p1",
        progressPercentage: 80,
        expectedCompletionDate: new Date("2026-03-01"),
        monthlyTeamHours: 800,
        monthlyBurnRate: 50_000,
      },
    ],
    teamRoles: [{ role: "pm", totalCapacity: 200, utilizedCapacity: 180 }],
    unsoldUnits: 0,
    cashFromExpectedSales: 0,
  });
  assert.equal(r.recommendedAction, "start_new_project_in_X_weeks");
  assert.match(r.recommendedTiming, /\d+ weeks/);
});

test("advisory: includes all roles in roleUtilization", () => {
  const r = computeProjectCycleAdvisory({
    currentDate: new Date("2026-01-01"),
    cashOnHand: 5_000_000,
    receivablesNext30Days: 0,
    payablesNext30Days: 0,
    monthlyPayrollCommitment: 100_000,
    monthlyOtherFixedCosts: 0,
    expectedInflowsByMonth: [],
    activeProjects: [],
    teamRoles: [
      { role: "pm", totalCapacity: 100, utilizedCapacity: 70 },
      { role: "engineer", totalCapacity: 200, utilizedCapacity: 140 },
      { role: "finance", totalCapacity: 80, utilizedCapacity: 50 },
    ],
    unsoldUnits: 0,
    cashFromExpectedSales: 0,
  });
  assert.equal(r.roleUtilization.length, 3);
  assert.equal(r.roleUtilization[0].role, "pm");
  assert.equal(r.roleUtilization[1].role, "engineer");
});

test("advisory: utilization percentages computed correctly", () => {
  const r = computeProjectCycleAdvisory({
    currentDate: new Date("2026-01-01"),
    cashOnHand: 5_000_000,
    receivablesNext30Days: 0,
    payablesNext30Days: 0,
    monthlyPayrollCommitment: 100_000,
    monthlyOtherFixedCosts: 0,
    expectedInflowsByMonth: [],
    activeProjects: [],
    teamRoles: [{ role: "pm", totalCapacity: 100, utilizedCapacity: 75 }],
    unsoldUnits: 0,
    cashFromExpectedSales: 0,
  });
  assert.equal(r.teamUtilizationPercentage, 75);
  assert.equal(r.idleCapacityPercentage, 25);
});

test("advisory: supportingMetrics includes runway months", () => {
  const r = computeProjectCycleAdvisory({
    currentDate: new Date("2026-01-01"),
    cashOnHand: 5_000_000,
    receivablesNext30Days: 0,
    payablesNext30Days: 0,
    monthlyPayrollCommitment: 100_000,
    monthlyOtherFixedCosts: 0,
    expectedInflowsByMonth: [],
    activeProjects: [],
    teamRoles: [{ role: "pm", totalCapacity: 100, utilizedCapacity: 50 }],
    unsoldUnits: 5,
    cashFromExpectedSales: 200_000,
  });
  assert.ok("payrollRunwayMonths" in r.supportingMetrics);
  assert.equal(r.supportingMetrics.unsoldUnits, 5);
  assert.equal(r.supportingMetrics.cashFromExpectedSales, 200_000);
});

test("advisory: empty teamRoles → 0% utilization", () => {
  const r = computeProjectCycleAdvisory({
    currentDate: new Date("2026-01-01"),
    cashOnHand: 5_000_000,
    receivablesNext30Days: 0,
    payablesNext30Days: 0,
    monthlyPayrollCommitment: 100_000,
    monthlyOtherFixedCosts: 0,
    expectedInflowsByMonth: [],
    activeProjects: [],
    teamRoles: [],
    unsoldUnits: 0,
    cashFromExpectedSales: 0,
  });
  assert.equal(r.teamUtilizationPercentage, 0);
  assert.equal(r.idleCapacityPercentage, 100);
});

test("advisory: reasoning is non-empty markdown", () => {
  const r = computeProjectCycleAdvisory({
    currentDate: new Date("2026-01-01"),
    cashOnHand: 5_000_000,
    receivablesNext30Days: 0,
    payablesNext30Days: 0,
    monthlyPayrollCommitment: 100_000,
    monthlyOtherFixedCosts: 0,
    expectedInflowsByMonth: [],
    activeProjects: [],
    teamRoles: [{ role: "pm", totalCapacity: 100, utilizedCapacity: 75 }],
    unsoldUnits: 0,
    cashFromExpectedSales: 0,
  });
  assert.ok(r.reasoning.length > 0);
  assert.match(r.reasoning, /^###/m);
});

// ===========================================================================
// 8) computeUnitCostBasis pure helper
// ===========================================================================

const A1 = { assetId: "A1", sqm: 200, expectedPrice: 1_000_000 };
const A2 = { assetId: "A2", sqm: 100, expectedPrice: 500_000 };
const A3 = { assetId: "A3", sqm: 200, expectedPrice: 500_000 };

test("by_floor_area: 200/500 sqm gets 40% of pool", () => {
  const r = computeUnitCostBasis({
    assetId: "A1",
    projectTotalLandCost: 1_000_000,
    projectTotalSoftCost: 0,
    projectTotalMarketingCost: 0,
    allMarketingProjectAssets: [A1, A2, A3],
    allocationMethod: "by_floor_area",
    directCosts: 0,
    contingencyUsed: 0,
  });
  assert.equal(r.landAllocated, 400_000);
});

test("by_floor_area: smaller asset gets less", () => {
  const r = computeUnitCostBasis({
    assetId: "A2",
    projectTotalLandCost: 1_000_000,
    projectTotalSoftCost: 0,
    projectTotalMarketingCost: 0,
    allMarketingProjectAssets: [A1, A2, A3],
    allocationMethod: "by_floor_area",
    directCosts: 0,
    contingencyUsed: 0,
  });
  assert.equal(r.landAllocated, 200_000);
});

test("by_market_value: allocates by expected price share", () => {
  const r = computeUnitCostBasis({
    assetId: "A1",
    projectTotalLandCost: 1_000_000,
    projectTotalSoftCost: 0,
    projectTotalMarketingCost: 0,
    allMarketingProjectAssets: [A1, A2, A3],
    allocationMethod: "by_market_value",
    directCosts: 0,
    contingencyUsed: 0,
  });
  assert.equal(r.landAllocated, 500_000);
});

test("by_unit_count: each asset gets equal share", () => {
  const r = computeUnitCostBasis({
    assetId: "A2",
    projectTotalLandCost: 900_000,
    projectTotalSoftCost: 0,
    projectTotalMarketingCost: 0,
    allMarketingProjectAssets: [A1, A2, A3],
    allocationMethod: "by_unit_count",
    directCosts: 0,
    contingencyUsed: 0,
  });
  assert.equal(r.landAllocated, 300_000);
});

test("by_volume: zero volume → zero share", () => {
  const r = computeUnitCostBasis({
    assetId: "A1",
    projectTotalLandCost: 1_000_000,
    projectTotalSoftCost: 0,
    projectTotalMarketingCost: 0,
    allMarketingProjectAssets: [
      { ...A1, volume: 0 },
      { ...A2, volume: 100 },
    ],
    allocationMethod: "by_volume",
    directCosts: 0,
    contingencyUsed: 0,
  });
  assert.equal(r.landAllocated, 0);
});

test("totalCostBasis sums all components", () => {
  const r = computeUnitCostBasis({
    assetId: "A1",
    projectTotalLandCost: 1_000_000,
    projectTotalSoftCost: 100_000,
    projectTotalMarketingCost: 50_000,
    allMarketingProjectAssets: [A1, A2, A3],
    allocationMethod: "by_floor_area",
    directCosts: 200_000,
    hardCostAllocated: 80_000,
    financingCost: 30_000,
    contingencyUsed: 10_000,
  });
  // Land 400k + Soft 40k + Marketing 20k + Direct 200k + HardAlloc 80k + Fin 30k + Contingency 10k
  assert.equal(r.totalCostBasis, 780_000);
});

test("missing target asset throws", () => {
  assert.throws(() =>
    computeUnitCostBasis({
      assetId: "A99",
      projectTotalLandCost: 1_000_000,
      projectTotalSoftCost: 0,
      projectTotalMarketingCost: 0,
      allMarketingProjectAssets: [A1],
      allocationMethod: "by_floor_area",
      directCosts: 0,
      contingencyUsed: 0,
    }),
  );
});

test("negative pool throws", () => {
  assert.throws(() =>
    computeUnitCostBasis({
      assetId: "A1",
      projectTotalLandCost: -1,
      projectTotalSoftCost: 0,
      projectTotalMarketingCost: 0,
      allMarketingProjectAssets: [A1],
      allocationMethod: "by_floor_area",
      directCosts: 0,
      contingencyUsed: 0,
    }),
  );
});

test("reasoning includes allocation method label", () => {
  const r = computeUnitCostBasis({
    assetId: "A1",
    projectTotalLandCost: 1000,
    projectTotalSoftCost: 0,
    projectTotalMarketingCost: 0,
    allMarketingProjectAssets: [A1],
    allocationMethod: "by_floor_area",
    directCosts: 0,
    contingencyUsed: 0,
  });
  assert.match(r.reasoning, /by_floor_area/);
});

test("zero total metric → zero share (no division by zero)", () => {
  const r = computeUnitCostBasis({
    assetId: "X1",
    projectTotalLandCost: 1_000_000,
    projectTotalSoftCost: 0,
    projectTotalMarketingCost: 0,
    allMarketingProjectAssets: [
      { assetId: "X1", sqm: 0, expectedPrice: 0 },
    ],
    allocationMethod: "by_floor_area",
    directCosts: 0,
    contingencyUsed: 0,
  });
  assert.equal(r.landAllocated, 0);
});

// ===========================================================================
// 9) computeMarginPercentage
// ===========================================================================

test("margin: 100k profit on 1M sale = 10%", () => {
  assert.equal(
    computeMarginPercentage({ costBasis: 900_000, salePrice: 1_000_000 }),
    10,
  );
});

test("margin: zero sale price returns 0 (no div-by-zero)", () => {
  assert.equal(computeMarginPercentage({ costBasis: 100, salePrice: 0 }), 0);
});

test("margin: negative when cost > sale", () => {
  assert.equal(
    computeMarginPercentage({ costBasis: 1_200_000, salePrice: 1_000_000 }),
    -20,
  );
});

test("margin: throws on non-finite inputs", () => {
  assert.throws(() =>
    computeMarginPercentage({ costBasis: NaN, salePrice: 1 }),
  );
  assert.throws(() =>
    computeMarginPercentage({ costBasis: 1, salePrice: Infinity }),
  );
});

// ===========================================================================
// 10) verifyAllocationConservation
// ===========================================================================

test("conservation: exact match → conserved, drift 0", () => {
  const r = verifyAllocationConservation({
    projectPool: 1_000_000,
    perAssetAllocations: [400_000, 300_000, 300_000],
  });
  assert.equal(r.conserved, true);
  assert.equal(r.drift, 0);
});

test("conservation: 1-cent drift per asset within tolerance", () => {
  const r = verifyAllocationConservation({
    projectPool: 1_000_000,
    perAssetAllocations: [400_001, 299_999, 300_000],
  });
  assert.equal(r.conserved, true);
});

test("conservation: large drift fails", () => {
  const r = verifyAllocationConservation({
    projectPool: 1_000_000,
    perAssetAllocations: [500_000, 500_000, 500_000],
  });
  assert.equal(r.conserved, false);
  assert.equal(r.drift, 500_000);
});

test("conservation: empty allocation → drift = -pool", () => {
  const r = verifyAllocationConservation({
    projectPool: 1_000_000,
    perAssetAllocations: [],
  });
  assert.equal(r.drift, -1_000_000);
  assert.equal(r.conserved, false);
});

// ===========================================================================
// 11) computeMonthlyCashflowProjection
// ===========================================================================

test("cashflow: simple steady burn produces 12 months", () => {
  const start = new Date(Date.UTC(2026, 0, 1));
  const r = computeMonthlyCashflowProjection({
    startMonth: start,
    horizonMonths: 12,
    startingCash: 10_000_000,
    expectedSalesByMonth: [],
    expectedCapitalCallsByMonth: [],
    expectedRentalIncomeByMonth: [],
    monthlyPayrollCommitment: 100_000,
    monthlyFixedCosts: 50_000,
    expectedConstructionCostsByMonth: [],
    expectedTaxPaymentsByMonth: [],
    expectedDistributionsByMonth: [],
    expectedLandPaymentsByMonth: [],
  });
  assert.equal(r.projections.length, 12);
});

test("cashflow: ending cash = starting + sum(net)", () => {
  const start = new Date(Date.UTC(2026, 0, 1));
  const r = computeMonthlyCashflowProjection({
    startMonth: start,
    horizonMonths: 6,
    startingCash: 1_000_000,
    expectedSalesByMonth: [],
    expectedCapitalCallsByMonth: [],
    expectedRentalIncomeByMonth: [],
    monthlyPayrollCommitment: 100_000,
    monthlyFixedCosts: 0,
    expectedConstructionCostsByMonth: [],
    expectedTaxPaymentsByMonth: [],
    expectedDistributionsByMonth: [],
    expectedLandPaymentsByMonth: [],
  });
  assert.equal(r.endingCash, 400_000);
});

test("cashflow: gap detected when cash goes negative", () => {
  const start = new Date(Date.UTC(2026, 0, 1));
  const r = computeMonthlyCashflowProjection({
    startMonth: start,
    horizonMonths: 12,
    startingCash: 100_000,
    expectedSalesByMonth: [],
    expectedCapitalCallsByMonth: [],
    expectedRentalIncomeByMonth: [],
    monthlyPayrollCommitment: 100_000,
    monthlyFixedCosts: 50_000,
    expectedConstructionCostsByMonth: [],
    expectedTaxPaymentsByMonth: [],
    expectedDistributionsByMonth: [],
    expectedLandPaymentsByMonth: [],
  });
  assert.ok(r.identifiedGaps.length > 0);
  assert.ok(r.peakCapitalRequired > 0);
});

test("cashflow: gap severity bands minor/moderate/critical", () => {
  const start = new Date(Date.UTC(2026, 0, 1));
  const r = computeMonthlyCashflowProjection({
    startMonth: start,
    horizonMonths: 12,
    startingCash: 0,
    expectedSalesByMonth: [],
    expectedCapitalCallsByMonth: [],
    expectedRentalIncomeByMonth: [],
    monthlyPayrollCommitment: 100_000_00, // $100k cents
    monthlyFixedCosts: 0,
    expectedConstructionCostsByMonth: [],
    expectedTaxPaymentsByMonth: [],
    expectedDistributionsByMonth: [],
    expectedLandPaymentsByMonth: [],
  });
  // $100k/mo for 12 months → cumulative goes -$100k, -$200k... up to $1.2M (in cents)
  // Should hit minor → moderate → critical bands.
  const sevs = new Set(r.identifiedGaps.map((g) => g.severity));
  assert.ok(sevs.has("critical"));
});

test("cashflow: no gaps when starting cash covers horizon", () => {
  const start = new Date(Date.UTC(2026, 0, 1));
  const r = computeMonthlyCashflowProjection({
    startMonth: start,
    horizonMonths: 6,
    startingCash: 10_000_000,
    expectedSalesByMonth: [],
    expectedCapitalCallsByMonth: [],
    expectedRentalIncomeByMonth: [],
    monthlyPayrollCommitment: 100_000,
    monthlyFixedCosts: 0,
    expectedConstructionCostsByMonth: [],
    expectedTaxPaymentsByMonth: [],
    expectedDistributionsByMonth: [],
    expectedLandPaymentsByMonth: [],
  });
  assert.equal(r.identifiedGaps.length, 0);
  assert.equal(r.peakCapitalRequired, 0);
});

test("cashflow: rejects horizonMonths > 60", () => {
  const start = new Date(Date.UTC(2026, 0, 1));
  assert.throws(() =>
    computeMonthlyCashflowProjection({
      startMonth: start,
      horizonMonths: 61,
      startingCash: 0,
      expectedSalesByMonth: [],
      expectedCapitalCallsByMonth: [],
      expectedRentalIncomeByMonth: [],
      monthlyPayrollCommitment: 0,
      monthlyFixedCosts: 0,
      expectedConstructionCostsByMonth: [],
      expectedTaxPaymentsByMonth: [],
      expectedDistributionsByMonth: [],
      expectedLandPaymentsByMonth: [],
    }),
  );
});

test("cashflow: rejects horizonMonths <= 0", () => {
  const start = new Date(Date.UTC(2026, 0, 1));
  assert.throws(() =>
    computeMonthlyCashflowProjection({
      startMonth: start,
      horizonMonths: 0,
      startingCash: 0,
      expectedSalesByMonth: [],
      expectedCapitalCallsByMonth: [],
      expectedRentalIncomeByMonth: [],
      monthlyPayrollCommitment: 0,
      monthlyFixedCosts: 0,
      expectedConstructionCostsByMonth: [],
      expectedTaxPaymentsByMonth: [],
      expectedDistributionsByMonth: [],
      expectedLandPaymentsByMonth: [],
    }),
  );
});

test("cashflow: rejects negative monthly costs", () => {
  const start = new Date(Date.UTC(2026, 0, 1));
  assert.throws(() =>
    computeMonthlyCashflowProjection({
      startMonth: start,
      horizonMonths: 6,
      startingCash: 0,
      expectedSalesByMonth: [],
      expectedCapitalCallsByMonth: [],
      expectedRentalIncomeByMonth: [],
      monthlyPayrollCommitment: -1,
      monthlyFixedCosts: 0,
      expectedConstructionCostsByMonth: [],
      expectedTaxPaymentsByMonth: [],
      expectedDistributionsByMonth: [],
      expectedLandPaymentsByMonth: [],
    }),
  );
});

test("cashflow: sales bucket into correct month", () => {
  const start = new Date(Date.UTC(2026, 0, 1));
  const m3 = new Date(Date.UTC(2026, 2, 15));
  const r = computeMonthlyCashflowProjection({
    startMonth: start,
    horizonMonths: 6,
    startingCash: 0,
    expectedSalesByMonth: [
      { month: m3, amount: 500_000, certainty: "committed" },
    ],
    expectedCapitalCallsByMonth: [],
    expectedRentalIncomeByMonth: [],
    monthlyPayrollCommitment: 0,
    monthlyFixedCosts: 0,
    expectedConstructionCostsByMonth: [],
    expectedTaxPaymentsByMonth: [],
    expectedDistributionsByMonth: [],
    expectedLandPaymentsByMonth: [],
  });
  assert.equal(r.projections[2].inflow, 500_000);
  assert.equal(r.projections[0].inflow, 0);
  assert.equal(r.totalInflow, 500_000);
});

test("cashflow: construction + tax + distribution + land buckets aggregate into outflow", () => {
  const start = new Date(Date.UTC(2026, 0, 1));
  const m1 = new Date(Date.UTC(2026, 0, 15));
  const r = computeMonthlyCashflowProjection({
    startMonth: start,
    horizonMonths: 3,
    startingCash: 10_000_000,
    expectedSalesByMonth: [],
    expectedCapitalCallsByMonth: [],
    expectedRentalIncomeByMonth: [],
    monthlyPayrollCommitment: 0,
    monthlyFixedCosts: 0,
    expectedConstructionCostsByMonth: [{ month: m1, amount: 100_000 }],
    expectedTaxPaymentsByMonth: [{ month: m1, amount: 50_000 }],
    expectedDistributionsByMonth: [{ month: m1, amount: 25_000 }],
    expectedLandPaymentsByMonth: [{ month: m1, amount: 10_000 }],
  });
  assert.equal(r.projections[0].outflow, 185_000);
});

test("cashflow: peakCapitalRequired = magnitude of lowest cumulative", () => {
  const start = new Date(Date.UTC(2026, 0, 1));
  const r = computeMonthlyCashflowProjection({
    startMonth: start,
    horizonMonths: 4,
    startingCash: 200_000,
    expectedSalesByMonth: [],
    expectedCapitalCallsByMonth: [],
    expectedRentalIncomeByMonth: [],
    monthlyPayrollCommitment: 100_000,
    monthlyFixedCosts: 0,
    expectedConstructionCostsByMonth: [],
    expectedTaxPaymentsByMonth: [],
    expectedDistributionsByMonth: [],
    expectedLandPaymentsByMonth: [],
  });
  // Cum: 100, 0, -100, -200 → peak = 200
  assert.equal(r.peakCapitalRequired, 200_000);
});

test("cashflow: peakAt is the lowest-cash month", () => {
  const start = new Date(Date.UTC(2026, 0, 1));
  const r = computeMonthlyCashflowProjection({
    startMonth: start,
    horizonMonths: 4,
    startingCash: 200_000,
    expectedSalesByMonth: [],
    expectedCapitalCallsByMonth: [],
    expectedRentalIncomeByMonth: [],
    monthlyPayrollCommitment: 100_000,
    monthlyFixedCosts: 0,
    expectedConstructionCostsByMonth: [],
    expectedTaxPaymentsByMonth: [],
    expectedDistributionsByMonth: [],
    expectedLandPaymentsByMonth: [],
  });
  assert.equal(r.peakAt.toISOString().slice(0, 7), "2026-04");
});

test("cashflow: monthly net = inflow - outflow per month", () => {
  const start = new Date(Date.UTC(2026, 0, 1));
  const m1 = new Date(Date.UTC(2026, 0, 1));
  const r = computeMonthlyCashflowProjection({
    startMonth: start,
    horizonMonths: 1,
    startingCash: 0,
    expectedSalesByMonth: [{ month: m1, amount: 300_000, certainty: "likely" }],
    expectedCapitalCallsByMonth: [],
    expectedRentalIncomeByMonth: [],
    monthlyPayrollCommitment: 100_000,
    monthlyFixedCosts: 0,
    expectedConstructionCostsByMonth: [],
    expectedTaxPaymentsByMonth: [],
    expectedDistributionsByMonth: [],
    expectedLandPaymentsByMonth: [],
  });
  assert.equal(r.projections[0].net, 200_000);
});

// ===========================================================================
// 12) Cron wiring + dispatcher + route audit
// ===========================================================================

test("cron index re-exports 3 new Stage 5.B runners", () => {
  const idx = read("src/lib/development/server/cron/index.ts");
  assert.match(idx, /runDevOsProjectCycleAdvisory/);
  assert.match(idx, /runDevOsProfitabilityRecompute/);
  assert.match(idx, /runDevOsCashflowAutoGenerate/);
});

test("cron index DEV_OS_JOB_KEYS includes 3 new keys", () => {
  const idx = read("src/lib/development/server/cron/index.ts");
  for (const k of [
    "dev_os_project_cycle_advisory",
    "dev_os_profitability_recompute",
    "dev_os_cashflow_autogenerate",
  ]) {
    assert.ok(idx.includes(`"${k}"`), `key '${k}' missing from DEV_OS_JOB_KEYS`);
  }
});

test("dispatcher KNOWN_JOBS includes 3 new keys", () => {
  const src = read("src/features/jobs/actions.ts");
  for (const k of [
    "dev_os_project_cycle_advisory",
    "dev_os_profitability_recompute",
    "dev_os_cashflow_autogenerate",
  ]) {
    assert.ok(src.includes(`"${k}"`), `KNOWN_JOBS missing '${k}'`);
  }
});

test("dispatcher executeJob switch covers 3 new keys", () => {
  const src = read("src/features/jobs/actions.ts");
  assert.match(src, /case "dev_os_project_cycle_advisory":/);
  assert.match(src, /case "dev_os_profitability_recompute":/);
  assert.match(src, /case "dev_os_cashflow_autogenerate":/);
});

test("dispatcher JobKey union extended with 3 new keys", () => {
  const src = read("src/features/jobs/actions.ts");
  assert.match(src, /\| "dev_os_project_cycle_advisory"/);
  assert.match(src, /\| "dev_os_profitability_recompute"/);
  assert.match(src, /\| "dev_os_cashflow_autogenerate"/);
});

test("3 new HTTP cron route files exist", () => {
  for (const slug of [
    "dev-os-project-cycle-advisory",
    "dev-os-profitability-recompute",
    "dev-os-cashflow-autogenerate",
  ]) {
    assert.ok(
      exists(`src/app/api/cron/${slug}/route.ts`),
      `route file missing for ${slug}`,
    );
  }
});

test("each new route uses handleCronJobRequest", () => {
  for (const slug of [
    "dev-os-project-cycle-advisory",
    "dev-os-profitability-recompute",
    "dev-os-cashflow-autogenerate",
  ]) {
    const src = read(`src/app/api/cron/${slug}/route.ts`);
    assert.match(src, /handleCronJobRequest/);
    assert.match(src, /export const dynamic = "force-dynamic"/);
  }
});

test("VERCEL-CRON-CHECKLIST documents 3 new routes", () => {
  const md = read("docs/VERCEL-CRON-CHECKLIST.md");
  assert.match(md, /\/api\/cron\/dev-os-project-cycle-advisory/);
  assert.match(md, /\/api\/cron\/dev-os-profitability-recompute/);
  assert.match(md, /\/api\/cron\/dev-os-cashflow-autogenerate/);
});

// ===========================================================================
// 13) Sidebar nav audit — Strategic + Multi-Asset entries
// ===========================================================================

test("sidebar nav has Strategic group with 3 5.B entries", () => {
  const src = read("src/lib/development/navigation.ts");
  assert.match(src, /label: "Strategic"/);
  assert.match(src, /\/project-cycle/);
  assert.match(src, /\/profitability/);
  assert.match(src, /\/cashflow-forecast/);
});

test("sidebar nav has Assets + Asset types in Build & sell", () => {
  const src = read("src/lib/development/navigation.ts");
  assert.match(src, /\/assets/);
  assert.match(src, /\/asset-types/);
});

test("sidebar nav has Revenue streams in Capital", () => {
  const src = read("src/lib/development/navigation.ts");
  assert.match(src, /\/revenue-streams/);
});

// ===========================================================================
// 14) Documentation audit
// ===========================================================================

test("architecture doc references Stage 5.B", () => {
  const md = read("docs/development-os-architecture.md");
  assert.match(md, /Stage 5\.B/);
});

test("architecture doc explains Strategy B (preserve villas table)", () => {
  const md = read("docs/development-os-architecture.md");
  assert.match(md, /Strategy B/i);
});

// ===========================================================================
// 15) Migration 0057 — additional shape tests
// ===========================================================================

test("migration 0057 asset_category enum has 9 values", () => {
  const sql = read(MIG_0057);
  for (const c of [
    "residential", "hospitality", "food_beverage", "wellness", "mixed_use",
    "commercial", "land", "amenity", "other",
  ]) {
    assert.ok(sql.includes(`'${c}'`), `asset_category '${c}' missing`);
  }
});

test("migration 0057 asset_types has is_saleable / is_rentable / is_revenue_generating flags", () => {
  const sql = read(MIG_0057);
  assert.match(sql, /"is_saleable" BOOLEAN/);
  assert.match(sql, /"is_rentable" BOOLEAN/);
  assert.match(sql, /"is_revenue_generating" BOOLEAN/);
});

test("migration 0057 villas asset_type_id references asset_types", () => {
  const sql = read(MIG_0057);
  assert.match(
    sql,
    /"asset_type_id" UUID REFERENCES "asset_types"\("id"\)/,
  );
});

test("migration 0057 asset_attributes defaults to empty jsonb", () => {
  const sql = read(MIG_0057);
  assert.match(sql, /"asset_attributes" JSONB NOT NULL DEFAULT '\{\}'::jsonb/);
});

test("migration 0057 asset_types ON CONFLICT for idempotent reseed", () => {
  const sql = read(MIG_0057);
  assert.match(sql, /ON CONFLICT \(type_key\) DO NOTHING/);
});

test("migration 0057 revenue_streams stream_type enum has 8 values", () => {
  const sql = read(MIG_0057);
  for (const t of [
    "hotel_room_revenue", "restaurant_revenue", "spa_revenue",
    "rental_income", "service_fee", "membership_fee",
    "event_revenue", "other",
  ]) {
    assert.ok(sql.includes(`'${t}'`), `stream_type '${t}' missing`);
  }
});

test("migration 0057 revenue_streams enforces period_end >= period_start", () => {
  const sql = read(MIG_0057);
  assert.match(sql, /CHECK \("period_end" >= "period_start"\)/);
});

test("migration 0057 revenue_streams asset_id references villas (multi-asset)", () => {
  const sql = read(MIG_0057);
  assert.match(sql, /"asset_id" UUID NOT NULL REFERENCES "villas"\("id"\)/);
});

test("migration 0057 indexes asset_types by category and active", () => {
  const sql = read(MIG_0057);
  assert.match(sql, /asset_types_category_idx/);
  assert.match(sql, /asset_types_active_idx/);
});

test("migration 0057 indexes revenue_streams by asset, project, period, type", () => {
  const sql = read(MIG_0057);
  assert.match(sql, /revenue_streams_asset_idx/);
  assert.match(sql, /revenue_streams_project_idx/);
  assert.match(sql, /revenue_streams_period_idx/);
  assert.match(sql, /revenue_streams_type_idx/);
});

test("migration 0057 villas_asset_type_idx for fast lookup", () => {
  const sql = read(MIG_0057);
  assert.match(sql, /villas_asset_type_idx/);
});

// ===========================================================================
// 16) Migration 0058 — additional shape tests
// ===========================================================================

test("migration 0058 payroll_periods has period_label UNIQUE", () => {
  const sql = read(MIG_0058);
  assert.match(sql, /"period_label" TEXT NOT NULL UNIQUE/);
});

test("migration 0058 payroll_periods has BIGINT amount + currency default", () => {
  const sql = read(MIG_0058);
  assert.match(sql, /"total_payroll_amount_minor" BIGINT/);
  assert.match(sql, /"currency" TEXT NOT NULL DEFAULT 'IDR'/);
});

test("migration 0058 payroll_periods has related_transactions UUID array", () => {
  const sql = read(MIG_0058);
  assert.match(sql, /"related_transactions" UUID\[\] NOT NULL DEFAULT '\{\}'/);
});

test("migration 0058 payroll_periods updated_at trigger registered", () => {
  const sql = read(MIG_0058);
  assert.match(sql, /trg_payroll_periods_updated_at/);
});

test("migration 0058 team_capacity utilization_rate computed as percent", () => {
  const sql = read(MIG_0058);
  assert.match(sql, /\* 100/); // utilization * 100 → percent
});

test("migration 0058 team_capacity period range CHECK constraint", () => {
  const sql = read(MIG_0058);
  assert.match(sql, /CHECK \("tracking_period_end" >= "tracking_period_start"\)/);
});

test("migration 0058 recommendations confidence_level enum", () => {
  const sql = read(MIG_0058);
  for (const v of ["low", "medium", "high"]) {
    assert.ok(
      sql.includes(`'${v}'`),
      `confidence_level '${v}' missing`,
    );
  }
});

test("migration 0058 recommendations indexed by date DESC + status", () => {
  const sql = read(MIG_0058);
  assert.match(sql, /project_cycle_recommendations_date_idx/);
  assert.match(sql, /project_cycle_recommendations_status_idx/);
});

test("migration 0058 recommendation_code UNIQUE", () => {
  const sql = read(MIG_0058);
  assert.match(sql, /"recommendation_code" TEXT UNIQUE NOT NULL/);
});

test("migration 0058 reviewed_by references app_users", () => {
  const sql = read(MIG_0058);
  assert.match(sql, /"reviewed_by" UUID REFERENCES "app_users"\("id"\)/);
});

test("migration 0058 generated_by_agent default", () => {
  const sql = read(MIG_0058);
  assert.match(sql, /"generated_by_agent" TEXT NOT NULL DEFAULT 'project_cycle_intelligence'/);
});

// ===========================================================================
// 17) Migration 0059 — additional shape tests
// ===========================================================================

test("migration 0059 unit_cost_allocations has all 6 cost-share columns", () => {
  const sql = read(MIG_0059);
  for (const c of [
    "land_cost_allocated_minor",
    "hard_cost_direct_minor",
    "hard_cost_allocated_minor",
    "soft_cost_allocated_minor",
    "marketing_cost_allocated_minor",
    "financing_cost_allocated_minor",
  ]) {
    assert.ok(sql.includes(c), `${c} missing`);
  }
});

test("migration 0059 unit_cost_allocations indexed by asset, project, current", () => {
  const sql = read(MIG_0059);
  assert.match(sql, /unit_cost_allocations_asset_idx/);
  assert.match(sql, /unit_cost_allocations_project_idx/);
  assert.match(sql, /unit_cost_allocations_current_idx/);
});

test("migration 0059 unit_cost_allocations defaults is_current TRUE", () => {
  const sql = read(MIG_0059);
  assert.match(sql, /"is_current" BOOLEAN NOT NULL DEFAULT TRUE/);
});

test("migration 0059 unit_cost_allocations has expected_sale_price + actual_sale_price", () => {
  const sql = read(MIG_0059);
  assert.match(sql, /"expected_sale_price_minor" BIGINT/);
  assert.match(sql, /"actual_sale_price_minor" BIGINT/);
});

test("migration 0059 cashflow_forecasts horizon + start month required", () => {
  const sql = read(MIG_0059);
  assert.match(sql, /"forecast_horizon_months" INTEGER NOT NULL/);
  assert.match(sql, /"forecast_start_month" DATE NOT NULL/);
});

test("migration 0059 cashflow_forecasts identified_cash_gaps JSONB column", () => {
  const sql = read(MIG_0059);
  assert.match(sql, /"identified_cash_gaps" JSONB/);
});

test("migration 0059 cashflow_forecasts approved_by + approved_at", () => {
  const sql = read(MIG_0059);
  assert.match(sql, /"approved_by" UUID REFERENCES "app_users"\("id"\)/);
  assert.match(sql, /"approved_at" TIMESTAMPTZ/);
});

test("migration 0059 cashflow_forecasts indexed by scope/project/status/start", () => {
  const sql = read(MIG_0059);
  assert.match(sql, /cashflow_forecasts_scope_idx/);
  assert.match(sql, /cashflow_forecasts_project_idx/);
  assert.match(sql, /cashflow_forecasts_status_idx/);
  assert.match(sql, /cashflow_forecasts_start_idx/);
});

test("migration 0059 monthly_projections JSONB NOT NULL", () => {
  const sql = read(MIG_0059);
  assert.match(sql, /"monthly_projections" JSONB NOT NULL/);
});

// ===========================================================================
// 18) Server actions / queries module exports
// ===========================================================================

test("asset-actions exports the 3 expected functions", () => {
  const src = read("src/lib/development/server/assets/asset-actions.ts");
  assert.match(src, /export async function createAsset/);
  assert.match(src, /export async function updateAssetAttributes/);
  assert.match(src, /export async function changeAssetType/);
});

test("asset-actions has server-only import guard", () => {
  const src = read("src/lib/development/server/assets/asset-actions.ts");
  assert.match(src, /import "server-only"/);
});

test("asset-type-actions exports createAssetType + deactivateAssetType", () => {
  const src = read("src/lib/development/server/assets/asset-type-actions.ts");
  assert.match(src, /export async function createAssetType/);
  assert.match(src, /export async function deactivateAssetType/);
});

test("asset-queries exports listAssets + getAssetByCode + listAssetTypes", () => {
  const src = read("src/lib/development/server/assets/asset-queries.ts");
  assert.match(src, /export async function listAssets/);
  assert.match(src, /export async function getAssetByCode/);
  assert.match(src, /export async function listAssetTypes/);
});

test("asset-queries has countAssetsViaView regression helper", () => {
  const src = read("src/lib/development/server/assets/asset-queries.ts");
  assert.match(src, /countAssetsViaView/);
});

test("revenue-streams actions exposes createRevenueStream", () => {
  const src = read("src/lib/development/server/revenue-streams/revenue-stream-actions.ts");
  assert.match(src, /export async function createRevenueStream/);
});

test("revenue-streams actions validates asset is rentable / revenue_generating", () => {
  const src = read("src/lib/development/server/revenue-streams/revenue-stream-actions.ts");
  assert.match(src, /is_rentable|isRentable|is_revenue_generating|isRevenueGenerating/);
});

test("project-cycle actions exposes 4 functions", () => {
  const src = read("src/lib/development/server/project-cycle/cycle-actions.ts");
  assert.match(src, /export async function createPayrollPeriod/);
  assert.match(src, /export async function trackTeamCapacity/);
  assert.match(src, /export async function generateCycleRecommendation/);
  assert.match(src, /export async function reviewCycleRecommendation/);
});

test("project-cycle generateCycleRecommendation uses pure helper", () => {
  const src = read("src/lib/development/server/project-cycle/cycle-actions.ts");
  assert.match(src, /computeProjectCycleAdvisory/);
});

test("profitability actions exposes recompute + override", () => {
  const src = read("src/lib/development/server/profitability/profitability-actions.ts");
  assert.match(src, /export async function recomputeUnitAllocation/);
  assert.match(src, /export async function overrideUnitAllocation/);
});

test("profitability recompute is atomic (transaction wrapper)", () => {
  const src = read("src/lib/development/server/profitability/profitability-actions.ts");
  assert.match(src, /\.transaction\(/);
});

test("cashflow actions exposes generate + transition", () => {
  const src = read("src/lib/development/server/cashflow/cashflow-actions.ts");
  assert.match(src, /export async function generateCashflowForecast/);
  assert.match(src, /export async function transitionCashflowForecast/);
});

test("cashflow generateCashflowForecast enforces scope XOR via Zod superRefine", () => {
  const src = read("src/lib/development/server/cashflow/cashflow-actions.ts");
  assert.match(src, /superRefine|refine/);
});

// ===========================================================================
// 19) Cron job runner exports (file-grep — server-only modules)
// ===========================================================================

test("project-cycle-advisory job file exists + exports the runner fn", () => {
  const src = read(
    "src/lib/development/server/cron/project-cycle-advisory-job.ts",
  );
  assert.match(src, /export async function runDevOsProjectCycleAdvisory/);
});

test("profitability-recompute job file exists + exports the runner fn", () => {
  const src = read(
    "src/lib/development/server/cron/profitability-recompute-job.ts",
  );
  assert.match(src, /export async function runDevOsProfitabilityRecompute/);
});

test("cashflow-autogenerate job file exists + exports the runner fn", () => {
  const src = read(
    "src/lib/development/server/cron/cashflow-autogenerate-job.ts",
  );
  assert.match(src, /export async function runDevOsCashflowAutoGenerate/);
});

test("project-cycle-advisory job persists with PCR-YYYY-### code prefix", () => {
  const src = read(
    "src/lib/development/server/cron/project-cycle-advisory-job.ts",
  );
  assert.match(src, /PCR-/);
});

test("cashflow-autogenerate job inserts company_wide draft", () => {
  const src = read(
    "src/lib/development/server/cron/cashflow-autogenerate-job.ts",
  );
  assert.match(src, /company_wide/);
});

// ===========================================================================
// 20) More cycle-helper edge cases
// ===========================================================================

test("payroll runway: inflow exactly covers burn → infinite-style runway", () => {
  const r = computePayrollRunway({
    cashOnHand: 100_000,
    monthlyPayrollCommitment: 100_000,
    monthlyOtherFixedCosts: 0,
    expectedInflowsByMonth: Array(60).fill(100_000),
  });
  assert.equal(r.runwayMonths, 60);
  assert.equal(r.riskLevel, "safe");
});

test("payroll runway: inflows array shorter than horizon → zero after", () => {
  const r = computePayrollRunway({
    cashOnHand: 600_000,
    monthlyPayrollCommitment: 100_000,
    monthlyOtherFixedCosts: 0,
    expectedInflowsByMonth: [200_000, 200_000], // months 1+2 only
  });
  // M1: 600+200-100 = 700, M2: 800, M3: 700, M4: 600... lasts at least 8 months
  assert.ok(r.runwayMonths >= 6);
});

test("predictTeamIdle: completion in past → weeksUntilIdle = 0", () => {
  const r = predictTeamIdle({
    activeProjects: [
      {
        progressPct: 99,
        expectedCompletionDate: new Date("2025-01-01"),
        monthlyTeamHours: 100,
      },
    ],
    teamTotalCapacity: 200,
    currentDate: new Date("2026-01-01"),
  });
  assert.equal(r.weeksUntilIdle, 0);
});

test("advisory: identical inputs → identical output (determinism)", () => {
  const input = {
    currentDate: new Date("2026-01-01"),
    cashOnHand: 5_000_000,
    receivablesNext30Days: 0,
    payablesNext30Days: 0,
    monthlyPayrollCommitment: 100_000,
    monthlyOtherFixedCosts: 0,
    expectedInflowsByMonth: [],
    activeProjects: [],
    teamRoles: [{ role: "pm", totalCapacity: 100, utilizedCapacity: 75 }],
    unsoldUnits: 0,
    cashFromExpectedSales: 0,
  };
  const r1 = computeProjectCycleAdvisory(input);
  const r2 = computeProjectCycleAdvisory(input);
  assert.equal(r1.recommendedAction, r2.recommendedAction);
  assert.equal(r1.reasoning, r2.reasoning);
});

// ===========================================================================
// 21) More profitability edge cases
// ===========================================================================

test("by_floor_area: single asset gets 100%", () => {
  const r = computeUnitCostBasis({
    assetId: "ONLY",
    projectTotalLandCost: 1_000_000,
    projectTotalSoftCost: 0,
    projectTotalMarketingCost: 0,
    allMarketingProjectAssets: [{ assetId: "ONLY", sqm: 100, expectedPrice: 1 }],
    allocationMethod: "by_floor_area",
    directCosts: 0,
    contingencyUsed: 0,
  });
  assert.equal(r.landAllocated, 1_000_000);
});

test("hardCostAllocated default zero when not provided", () => {
  const r = computeUnitCostBasis({
    assetId: "A1",
    projectTotalLandCost: 0,
    projectTotalSoftCost: 0,
    projectTotalMarketingCost: 0,
    allMarketingProjectAssets: [A1],
    allocationMethod: "by_floor_area",
    directCosts: 100,
    contingencyUsed: 0,
  });
  assert.equal(r.hardCostAllocated, 0);
});

test("financingCost default zero when not provided", () => {
  const r = computeUnitCostBasis({
    assetId: "A1",
    projectTotalLandCost: 0,
    projectTotalSoftCost: 0,
    projectTotalMarketingCost: 0,
    allMarketingProjectAssets: [A1],
    allocationMethod: "by_floor_area",
    directCosts: 0,
    contingencyUsed: 0,
  });
  assert.equal(r.financingCostAllocated, 0);
});

test("conservation: pool zero, allocations zero → conserved", () => {
  const r = verifyAllocationConservation({
    projectPool: 0,
    perAssetAllocations: [0, 0, 0],
  });
  assert.equal(r.conserved, true);
  assert.equal(r.drift, 0);
});

test("margin: 100% margin when cost is zero", () => {
  assert.equal(
    computeMarginPercentage({ costBasis: 0, salePrice: 1_000_000 }),
    100,
  );
});

// ===========================================================================
// 22) More cashflow edge cases
// ===========================================================================

test("cashflow: capital calls increase inflow", () => {
  const start = new Date(Date.UTC(2026, 0, 1));
  const m1 = new Date(Date.UTC(2026, 0, 1));
  const r = computeMonthlyCashflowProjection({
    startMonth: start,
    horizonMonths: 1,
    startingCash: 0,
    expectedSalesByMonth: [],
    expectedCapitalCallsByMonth: [{ month: m1, amount: 1_000_000 }],
    expectedRentalIncomeByMonth: [],
    monthlyPayrollCommitment: 0,
    monthlyFixedCosts: 0,
    expectedConstructionCostsByMonth: [],
    expectedTaxPaymentsByMonth: [],
    expectedDistributionsByMonth: [],
    expectedLandPaymentsByMonth: [],
  });
  assert.equal(r.projections[0].inflow, 1_000_000);
});

test("cashflow: rental income aggregates into inflow", () => {
  const start = new Date(Date.UTC(2026, 0, 1));
  const m1 = new Date(Date.UTC(2026, 0, 5));
  const m1b = new Date(Date.UTC(2026, 0, 25));
  const r = computeMonthlyCashflowProjection({
    startMonth: start,
    horizonMonths: 1,
    startingCash: 0,
    expectedSalesByMonth: [],
    expectedCapitalCallsByMonth: [],
    expectedRentalIncomeByMonth: [
      { month: m1, amount: 50_000 },
      { month: m1b, amount: 25_000 },
    ],
    monthlyPayrollCommitment: 0,
    monthlyFixedCosts: 0,
    expectedConstructionCostsByMonth: [],
    expectedTaxPaymentsByMonth: [],
    expectedDistributionsByMonth: [],
    expectedLandPaymentsByMonth: [],
  });
  assert.equal(r.projections[0].inflow, 75_000);
});

test("cashflow: empty input still produces single-month projection", () => {
  const start = new Date(Date.UTC(2026, 0, 1));
  const r = computeMonthlyCashflowProjection({
    startMonth: start,
    horizonMonths: 1,
    startingCash: 100,
    expectedSalesByMonth: [],
    expectedCapitalCallsByMonth: [],
    expectedRentalIncomeByMonth: [],
    monthlyPayrollCommitment: 0,
    monthlyFixedCosts: 0,
    expectedConstructionCostsByMonth: [],
    expectedTaxPaymentsByMonth: [],
    expectedDistributionsByMonth: [],
    expectedLandPaymentsByMonth: [],
  });
  assert.equal(r.projections.length, 1);
  assert.equal(r.endingCash, 100);
});

test("cashflow: cumulative cash carries across months", () => {
  const start = new Date(Date.UTC(2026, 0, 1));
  const r = computeMonthlyCashflowProjection({
    startMonth: start,
    horizonMonths: 3,
    startingCash: 1_000_000,
    expectedSalesByMonth: [],
    expectedCapitalCallsByMonth: [],
    expectedRentalIncomeByMonth: [],
    monthlyPayrollCommitment: 100_000,
    monthlyFixedCosts: 0,
    expectedConstructionCostsByMonth: [],
    expectedTaxPaymentsByMonth: [],
    expectedDistributionsByMonth: [],
    expectedLandPaymentsByMonth: [],
  });
  assert.equal(r.projections[0].cumulativeCash, 900_000);
  assert.equal(r.projections[1].cumulativeCash, 800_000);
  assert.equal(r.projections[2].cumulativeCash, 700_000);
});

test("cashflow: month dates are first-of-month UTC", () => {
  const start = new Date(Date.UTC(2026, 5, 17));
  const r = computeMonthlyCashflowProjection({
    startMonth: start,
    horizonMonths: 2,
    startingCash: 0,
    expectedSalesByMonth: [],
    expectedCapitalCallsByMonth: [],
    expectedRentalIncomeByMonth: [],
    monthlyPayrollCommitment: 0,
    monthlyFixedCosts: 0,
    expectedConstructionCostsByMonth: [],
    expectedTaxPaymentsByMonth: [],
    expectedDistributionsByMonth: [],
    expectedLandPaymentsByMonth: [],
  });
  assert.equal(r.projections[0].month.toISOString().slice(0, 10), "2026-06-01");
  assert.equal(r.projections[1].month.toISOString().slice(0, 10), "2026-07-01");
});

test("cashflow: gap severity 'minor' under $100k", () => {
  const start = new Date(Date.UTC(2026, 0, 1));
  const r = computeMonthlyCashflowProjection({
    startMonth: start,
    horizonMonths: 1,
    startingCash: -50_000 * 100, // already at -$50k cents
    expectedSalesByMonth: [],
    expectedCapitalCallsByMonth: [],
    expectedRentalIncomeByMonth: [],
    monthlyPayrollCommitment: 0,
    monthlyFixedCosts: 0,
    expectedConstructionCostsByMonth: [],
    expectedTaxPaymentsByMonth: [],
    expectedDistributionsByMonth: [],
    expectedLandPaymentsByMonth: [],
  });
  assert.ok(r.identifiedGaps.length >= 1);
  assert.equal(r.identifiedGaps[0].severity, "minor");
});

// ===========================================================================
// 23) vercel.json/checklist crons match
// ===========================================================================

test("cron checklist contains exactly one row per dev-os 5.B route", () => {
  const md = read("docs/VERCEL-CRON-CHECKLIST.md");
  for (const slug of [
    "dev-os-project-cycle-advisory",
    "dev-os-profitability-recompute",
    "dev-os-cashflow-autogenerate",
  ]) {
    const occurrencesInTable = md
      .split("\n")
      .filter((l) => l.includes(`| \`/api/cron/${slug}\``))
      .length;
    assert.equal(occurrencesInTable, 1, `${slug} should appear exactly once in the routes table`);
  }
});

test("cron checklist json snippet contains 3 new entries", () => {
  const md = read("docs/VERCEL-CRON-CHECKLIST.md");
  for (const slug of [
    "dev-os-project-cycle-advisory",
    "dev-os-profitability-recompute",
    "dev-os-cashflow-autogenerate",
  ]) {
    const inJson = md.includes(`{ "path": "/api/cron/${slug}"`);
    assert.ok(inJson, `${slug} missing from vercel.json snippet`);
  }
});

// ===========================================================================
// 24) Demo seed audit — Stage 5.B section present and idempotent
// ===========================================================================

test("seed script declares Stage 5.B section header", () => {
  const seed = read("scripts/seed-dev-os.mjs");
  assert.match(seed, /Stage 5\.B seeding/);
});

test("seed script seeds payroll_periods + team_capacity_tracking + recommendations", () => {
  const seed = read("scripts/seed-dev-os.mjs");
  assert.match(seed, /INSERT INTO payroll_periods/);
  assert.match(seed, /INSERT INTO team_capacity_tracking/);
  assert.match(seed, /INSERT INTO project_cycle_recommendations/);
});

test("seed script seeds unit_cost_allocations + cashflow_forecasts", () => {
  const seed = read("scripts/seed-dev-os.mjs");
  assert.match(seed, /INSERT INTO unit_cost_allocations/);
  assert.match(seed, /INSERT INTO cashflow_forecasts/);
});

test("seed script uses ON CONFLICT or exists-check pattern for idempotency", () => {
  const seed = read("scripts/seed-dev-os.mjs");
  // 5.B section uses exists-check + continue pattern.
  assert.match(seed, /Stage 5\.B seeding[\s\S]*?if \(exists\[0\]\)/);
});

test("seed script seeds at least one non-villa asset type sample", () => {
  const seed = read("scripts/seed-dev-os.mjs");
  // Should reference at least one of the 11 non-villa keys.
  const hasNonVilla = ["apartment", "restaurant_table", "land_parcel", "pool"].some(
    (k) => seed.includes(`"${k}"`),
  );
  assert.ok(hasNonVilla, "no non-villa asset_type in seed");
});
