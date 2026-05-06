/**
 * Stage 4.B.2 — Capital account refinement + residual inventory tests.
 *
 * Mix of runtime tests (residual-helpers, allocation math) and
 * static-source tests (schema, migration shape, server modules).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  computeOwnershipBySettlementMethod,
  allocateAcrossResidualUnits,
} from "../src/lib/development/server/residual-inventory/residual-helpers";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");
const exists = (rel: string) => existsSync(resolve(ROOT, rel));

const MIG_0049 = "drizzle/0049_development_os_stage_4_b_2_capital_residual.sql";

// ===========================================================================
// 1) Migration 0049 — shape
// ===========================================================================

test("migration 0049 file exists and wraps in BEGIN/COMMIT", () => {
  assert.ok(exists(MIG_0049));
  const sql = read(MIG_0049);
  assert.match(sql, /^BEGIN;/m);
  assert.match(sql, /^COMMIT;/m);
});

test("migration 0049 extends investor_wallets with all 6 new bucket columns", () => {
  const sql = read(MIG_0049);
  for (const col of [
    "cash_balance_minor",
    "economic_balance_minor",
    "reinvestment_balance_minor",
    "committed_balance_minor",
    "pending_distribution_minor",
    "residual_inventory_value_minor",
    "last_recomputed_at",
  ]) {
    assert.match(
      sql,
      new RegExp(`ADD COLUMN IF NOT EXISTS "${col}"`),
      `wallet column '${col}' missing from 0049`,
    );
  }
});

test("migration 0049 creates wallet_movements with 9 movement_types + 6 bucket types", () => {
  const sql = read(MIG_0049);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "wallet_movements"/);
  for (const t of [
    "capital_contribution",
    "capital_return",
    "profit_distribution",
    "reinvestment_out",
    "reinvestment_in",
    "withdrawal_request",
    "withdrawal_executed",
    "manual_adjustment",
    "residual_inventory_realloc",
  ]) {
    assert.ok(sql.includes(`'${t}'`), `movement_type '${t}' missing`);
  }
  for (const b of [
    "cash",
    "economic",
    "reinvestment",
    "committed",
    "pending_distribution",
    "residual_inventory",
  ]) {
    assert.ok(sql.includes(`'${b}'`), `affects_balance '${b}' missing`);
  }
});

test("migration 0049 wallet_movements references actual table names (capital_commitments, capital_drawdowns)", () => {
  const sql = read(MIG_0049);
  // The spec referred to commitments(id) / drawdowns(id) but the actual
  // table names are different. Guard against accidental drift.
  assert.match(sql, /REFERENCES "capital_commitments"\("id"\)/);
  assert.match(sql, /REFERENCES "capital_drawdowns"\("id"\)/);
});

test("migration 0049 creates residual_inventory_units with 6 valuation methods + 5 statuses", () => {
  const sql = read(MIG_0049);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "residual_inventory_units"/);
  for (const m of [
    "list_price",
    "current_market_value",
    "conservative_liquidation_value",
    "internal_minimum_sale_price",
    "rental_income_valuation",
    "manual_valuation",
  ]) {
    assert.ok(sql.includes(`'${m}'`), `valuation method '${m}' missing`);
  }
  for (const s of [
    "unsold",
    "held",
    "transferred_to_management",
    "sold_later",
    "reallocated",
  ]) {
    assert.ok(sql.includes(`'${s}'`), `status '${s}' missing`);
  }
});

test("migration 0049 references villas(id), not units(id) — codebase reconciliation", () => {
  const sql = read(MIG_0049);
  // The schema's "units" are villas in this codebase. Flag any drift.
  assert.match(sql, /REFERENCES "villas"\("id"\)/);
});

test("migration 0049 creates residual_unit_ownership_shares with sum-to-100 trigger", () => {
  const sql = read(MIG_0049);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "residual_unit_ownership_shares"/);
  assert.match(sql, /check_residual_ownership_sum/);
  assert.match(sql, /DEFERRABLE INITIALLY DEFERRED/);
  assert.match(sql, /must sum to exactly 100/);
});

test("migration 0049 enforces arconique XOR investor on residual ownership shares", () => {
  const sql = read(MIG_0049);
  assert.match(sql, /residual_unit_ownership_shares_owner_xor/);
  assert.match(
    sql,
    /arconique_share = TRUE AND investor_id IS NULL/,
  );
});

test("migration 0049 covers all 4 settlement methods", () => {
  const sql = read(MIG_0049);
  for (const m of [
    "by_unrecovered_capital",
    "by_economic_waterfall",
    "by_arconique_25_credit",
    "manual_override",
  ]) {
    assert.ok(sql.includes(`'${m}'`), `settlement_method '${m}' missing`);
  }
});

test("migration 0049 RLS protects all 3 new tables", () => {
  const sql = read(MIG_0049);
  for (const t of [
    "wallet_movements",
    "residual_inventory_units",
    "residual_unit_ownership_shares",
  ]) {
    assert.ok(sql.includes(`'${t}'`), `RLS loop missing ${t}`);
  }
  assert.match(sql, /FORCE ROW LEVEL SECURITY/);
  assert.match(sql, /current_investor_id\(\)/);
});

test("migration 0049 grants investors read-own on wallet_movements + own residual shares", () => {
  const sql = read(MIG_0049);
  assert.match(sql, /wallet_movements_investor_read/);
  assert.match(sql, /residual_unit_ownership_shares_investor_read/);
});

test("migration 0049 adds back-FK from wallet_movements.related_residual_unit_id", () => {
  const sql = read(MIG_0049);
  assert.match(sql, /wallet_movements_related_residual_unit_id_fkey/);
  assert.match(
    sql,
    /REFERENCES "residual_inventory_units"\("id"\)/,
  );
});

// ===========================================================================
// 2) Schema files
// ===========================================================================

test("Stage 4.B.2 schema files exist", () => {
  assert.ok(exists("src/lib/db/schema/wallet-movements.ts"));
  assert.ok(exists("src/lib/db/schema/residual-inventory.ts"));
});

test("schema/index.ts re-exports wallet-movements + residual-inventory", () => {
  const src = read("src/lib/db/schema/index.ts");
  assert.match(src, /export \* from "\.\/wallet-movements";/);
  assert.match(src, /export \* from "\.\/residual-inventory";/);
});

test("investorWallets schema has all 6 new bucket columns", () => {
  const src = read("src/lib/db/schema/investor-capital.ts");
  for (const col of [
    "cashBalanceMinor",
    "economicBalanceMinor",
    "reinvestmentBalanceMinor",
    "committedBalanceMinor",
    "pendingDistributionMinor",
    "residualInventoryValueMinor",
    "lastRecomputedAt",
  ]) {
    assert.match(src, new RegExp(`\\b${col}\\b`), `missing ${col} in schema`);
  }
});

// ===========================================================================
// 3) Pure helpers — computeOwnershipBySettlementMethod
// ===========================================================================

test("by_unrecovered_capital: 60/40 unrecovered → 60/40 ownership", () => {
  const out = computeOwnershipBySettlementMethod({
    method: "by_unrecovered_capital",
    arconiqueUnrecoveredCapital: 600_00,
    investorUnrecoveredCapital: 400_00,
    remainingInventoryValue: 1000_00,
  });
  assert.equal(out.arconiqueOwnership.percentage, 60);
  assert.equal(out.investorOwnership.percentage, 40);
  assert.equal(out.arconiqueOwnership.economicClaim, 600_00);
  assert.equal(out.investorOwnership.economicClaim, 400_00);
});

test("by_unrecovered_capital: zero outstanding → zero ownership both sides", () => {
  const out = computeOwnershipBySettlementMethod({
    method: "by_unrecovered_capital",
    arconiqueUnrecoveredCapital: 0,
    investorUnrecoveredCapital: 0,
    remainingInventoryValue: 1000_00,
  });
  assert.equal(out.arconiqueOwnership.percentage, 0);
  assert.equal(out.investorOwnership.percentage, 0);
});

test("by_unrecovered_capital: liabilities reduce net inventory", () => {
  const out = computeOwnershipBySettlementMethod({
    method: "by_unrecovered_capital",
    arconiqueUnrecoveredCapital: 500_00,
    investorUnrecoveredCapital: 500_00,
    remainingInventoryValue: 1000_00,
    remainingLiabilities: 200_00, // $200 in remaining debts
  });
  // Net inventory = $800. 50/50 split → $400 each.
  assert.equal(out.arconiqueOwnership.economicClaim, 400_00);
  assert.equal(out.investorOwnership.economicClaim, 400_00);
});

test("by_arconique_25_credit: equal capital → 65.625/34.375 ownership", () => {
  // A=$1000, I=$1000, inventory=$4000.
  // Following arconique_25_credit math:
  //   Capital: $1000 each (returned) — but we treat as 'unrecovered',
  //   so the helper passes A,I to applyArconique25Credit which does
  //   capital return ($2000), then 25% credit + 50/50 on remaining $2000.
  // From 4.B.1 test: Arconique gets $2625, investor $1375 of $4000.
  // → Arconique percentage = 2625/4000 = 65.625
  const out = computeOwnershipBySettlementMethod({
    method: "by_arconique_25_credit",
    arconiqueUnrecoveredCapital: 1000_00,
    investorUnrecoveredCapital: 1000_00,
    remainingInventoryValue: 4000_00,
  });
  assert.equal(out.arconiqueOwnership.percentage, 65.625);
  assert.equal(out.investorOwnership.percentage, 34.375);
  assert.equal(out.arconiqueOwnership.economicClaim, 2625_00);
  assert.equal(out.investorOwnership.economicClaim, 1375_00);
});

test("by_arconique_25_credit: investor-only → Arconique gets 62.5% of profits", () => {
  // No Arconique unrecovered capital. Inventory = investor-paid claim.
  const out = computeOwnershipBySettlementMethod({
    method: "by_arconique_25_credit",
    arconiqueUnrecoveredCapital: 0,
    investorUnrecoveredCapital: 1000_00,
    remainingInventoryValue: 1500_00,
  });
  // From 4.B.1 test: Arconique $312.50, investor $1187.50.
  assert.equal(out.arconiqueOwnership.economicClaim, 312_50);
  assert.equal(out.investorOwnership.economicClaim, 1187_50);
});

test("by_arconique_25_credit: configurable credit_percentage", () => {
  const out = computeOwnershipBySettlementMethod({
    method: "by_arconique_25_credit",
    arconiqueUnrecoveredCapital: 1000_00,
    investorUnrecoveredCapital: 1000_00,
    remainingInventoryValue: 4000_00,
    arconiqueCreditPercentage: 10,
  });
  // From 4.B.1 test with 10% credit: Arconique $2550, investor $1450.
  assert.equal(out.arconiqueOwnership.economicClaim, 2550_00);
  assert.equal(out.investorOwnership.economicClaim, 1450_00);
});

test("by_economic_waterfall: equivalent to by_arconique_25_credit (same logic)", () => {
  const a = computeOwnershipBySettlementMethod({
    method: "by_economic_waterfall",
    arconiqueUnrecoveredCapital: 1000_00,
    investorUnrecoveredCapital: 1000_00,
    remainingInventoryValue: 4000_00,
  });
  const b = computeOwnershipBySettlementMethod({
    method: "by_arconique_25_credit",
    arconiqueUnrecoveredCapital: 1000_00,
    investorUnrecoveredCapital: 1000_00,
    remainingInventoryValue: 4000_00,
  });
  assert.equal(a.arconiqueOwnership.economicClaim, b.arconiqueOwnership.economicClaim);
  assert.equal(a.investorOwnership.economicClaim, b.investorOwnership.economicClaim);
});

test("rejects negative inputs", () => {
  assert.throws(() =>
    computeOwnershipBySettlementMethod({
      method: "by_unrecovered_capital",
      arconiqueUnrecoveredCapital: -1,
      investorUnrecoveredCapital: 0,
      remainingInventoryValue: 100,
    }),
  );
});

// ===========================================================================
// 4) Pure helpers — allocateAcrossResidualUnits
// ===========================================================================

test("allocateAcrossResidualUnits: percentage_across_all spreads evenly", () => {
  const out = allocateAcrossResidualUnits({
    totalUnits: [
      { unitId: "u1", marketValue: 1000_00 },
      { unitId: "u2", marketValue: 2000_00 },
    ],
    arconiquePercentage: 60,
    investorAllocation: [{ investorId: "inv1", percentage: 40 }],
    allocationStrategy: "percentage_across_all",
  });
  assert.equal(out.perUnit.length, 2);
  // u1: arconique 60% = $600, investor $400.
  // u2: arconique 60% = $1200, investor $800.
  const u1Arc = out.perUnit[0].shares.find((s) => s.owner === "arconique");
  assert.equal(u1Arc?.economicClaim, 600_00);
  const u2Inv = out.perUnit[1].shares.find((s) => s.owner === "inv1");
  assert.equal(u2Inv?.economicClaim, 800_00);
});

test("allocateAcrossResidualUnits: rejects sum != 100%", () => {
  assert.throws(() =>
    allocateAcrossResidualUnits({
      totalUnits: [{ unitId: "u1", marketValue: 100 }],
      arconiquePercentage: 60,
      investorAllocation: [{ investorId: "inv1", percentage: 30 }], // 90% total!
      allocationStrategy: "percentage_across_all",
    }),
  );
});

test("allocateAcrossResidualUnits: specific_villa_allocation requires manualAllocation", () => {
  assert.throws(() =>
    allocateAcrossResidualUnits({
      totalUnits: [{ unitId: "u1", marketValue: 100 }],
      arconiquePercentage: 50,
      investorAllocation: [{ investorId: "inv1", percentage: 50 }],
      allocationStrategy: "specific_villa_allocation",
    }),
  );
});

test("allocateAcrossResidualUnits: manualAllocation must sum to 100 per unit", () => {
  assert.throws(() =>
    allocateAcrossResidualUnits({
      totalUnits: [{ unitId: "u1", marketValue: 100 }],
      arconiquePercentage: 50,
      investorAllocation: [{ investorId: "inv1", percentage: 50 }],
      allocationStrategy: "specific_villa_allocation",
      manualAllocation: [
        { unitId: "u1", owner: "arconique", percentage: 70 }, // missing 30%!
      ],
    }),
  );
});

test("allocateAcrossResidualUnits: hybrid uses manual when present, default otherwise", () => {
  const out = allocateAcrossResidualUnits({
    totalUnits: [
      { unitId: "u1", marketValue: 1000_00 },
      { unitId: "u2", marketValue: 1000_00 },
    ],
    arconiquePercentage: 50,
    investorAllocation: [{ investorId: "inv1", percentage: 50 }],
    allocationStrategy: "hybrid",
    manualAllocation: [
      { unitId: "u1", owner: "arconique", percentage: 100 }, // override u1 only
    ],
  });
  // u1: 100% arconique = $1000.
  // u2: default 50/50 = $500 each.
  const u1Arc = out.perUnit[0].shares.find((s) => s.owner === "arconique");
  assert.equal(u1Arc?.economicClaim, 1000_00);
  const u2Arc = out.perUnit[1].shares.find((s) => s.owner === "arconique");
  assert.equal(u2Arc?.economicClaim, 500_00);
});

test("allocateAcrossResidualUnits: rounding remainder folded to last investor", () => {
  // marketValue 999 cents, arconique 50%, investor 50% → 499 each but
  // total must = 999. Last investor share gets the remainder.
  const out = allocateAcrossResidualUnits({
    totalUnits: [{ unitId: "u1", marketValue: 999 }],
    arconiquePercentage: 50,
    investorAllocation: [{ investorId: "inv1", percentage: 50 }],
    allocationStrategy: "percentage_across_all",
  });
  const total = out.perUnit[0].shares.reduce(
    (acc, s) => acc + s.economicClaim,
    0,
  );
  assert.equal(total, 999);
});

// ===========================================================================
// 5) Server modules — files exist + use server-only
// ===========================================================================

test("Stage 4.B.2 server modules exist", () => {
  for (const rel of [
    "src/lib/development/server/residual-inventory/residual-helpers.ts",
    "src/lib/development/server/residual-inventory/residual-queries.ts",
    "src/lib/development/server/residual-inventory/residual-actions.ts",
    "src/lib/development/server/capital-account/capital-account-queries.ts",
    "src/lib/development/server/capital-account/capital-account-actions.ts",
  ]) {
    assert.ok(exists(rel), `missing ${rel}`);
  }
});

test("4.B.2 server-side modules carry server-only guard", () => {
  for (const rel of [
    "src/lib/development/server/residual-inventory/residual-queries.ts",
    "src/lib/development/server/residual-inventory/residual-actions.ts",
    "src/lib/development/server/capital-account/capital-account-queries.ts",
    "src/lib/development/server/capital-account/capital-account-actions.ts",
  ]) {
    const src = read(rel);
    assert.match(src, /^(import "server-only"|"use server")/m);
  }
});

test("residual-helpers.ts is PURE (no DB imports)", () => {
  const src = read(
    "src/lib/development/server/residual-inventory/residual-helpers.ts",
  );
  assert.doesNotMatch(src, /^import\s+"server-only"/m);
  assert.doesNotMatch(src, /requireDb|drizzle-orm/);
});

test("residual-helpers reuses applyArconique25Credit for by_arconique_25_credit", () => {
  // One source of truth for the Arconique credit math.
  const src = read(
    "src/lib/development/server/residual-inventory/residual-helpers.ts",
  );
  assert.match(src, /applyArconique25Credit/);
});

test("capital-account-actions wraps movement+balance update in db.transaction", () => {
  const src = read(
    "src/lib/development/server/capital-account/capital-account-actions.ts",
  );
  assert.match(src, /db\.transaction/);
});

test("recordCrossProjectMovement writes a pair of movements", () => {
  // Defense in depth: transactional pair guarantees source/target stay in sync.
  const src = read(
    "src/lib/development/server/capital-account/capital-account-actions.ts",
  );
  // Two inserts inside one transaction.
  const inserts = src.match(/walletMovements\)\s*\n\s*\.values/g) ?? [];
  assert.ok(
    inserts.length >= 3,
    `expected >=3 walletMovements inserts (record + cross-project pair + reverse), got ${inserts.length}`,
  );
});

test("reverseWalletMovement refuses to reverse non-recorded movements", () => {
  const src = read(
    "src/lib/development/server/capital-account/capital-account-actions.ts",
  );
  assert.match(src, /cannot reverse movement in status/);
});

test("residual-actions: deletes prior shares before re-inserting (atomic re-allocation)", () => {
  const src = read(
    "src/lib/development/server/residual-inventory/residual-actions.ts",
  );
  assert.match(src, /\.delete\(residualUnitOwnershipShares\)/);
  assert.match(src, /db\.transaction/);
});

test("residual-actions: manual_override requires explicit approval reason", () => {
  const src = read(
    "src/lib/development/server/residual-inventory/residual-actions.ts",
  );
  assert.match(src, /manual_override requires manualShares/);
  assert.match(src, /isApproved: true/);
});
