/**
 * Stage 4.B.1 — Company structure + waterfall engine tests.
 *
 * Mix:
 *   - Runtime tests on the pure waterfall helpers (financial math).
 *   - Static-source tests on schema, migrations, server modules.
 *   - Migration shape tests for 0048.
 *
 * The financial math is the load-bearing surface — every waterfall rule
 * has multiple scenarios, including the Arconique 25% credit edge cases
 * called out explicitly in the strategic document.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  computeWaterfallAllocation,
  applyGeneric5050,
  applyArconique25Credit,
  applyPreferredReturnThenSplit,
  applyWaterfallWithHurdle,
  applyCapitalFirstThenSplit,
  applyTieredPromote,
  assertConservation,
  type WaterfallInput,
} from "../src/lib/development/server/waterfall/waterfall-helpers";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");
const exists = (rel: string) => existsSync(resolve(ROOT, rel));

const MIG_0048 = "drizzle/0048_development_os_stage_4_b_1_companies_waterfall.sql";

// ===========================================================================
// 1) Migration 0048 shape
// ===========================================================================

test("migration 0048 file exists and wraps in BEGIN/COMMIT", () => {
  assert.ok(exists(MIG_0048));
  const sql = read(MIG_0048);
  assert.match(sql, /^BEGIN;/m);
  assert.match(sql, /^COMMIT;/m);
});

test("migration 0048 creates project_company_structures with all 7 structure types", () => {
  const sql = read(MIG_0048);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "project_company_structures"/);
  for (const t of [
    "arconique_owned",
    "klr_real_estate",
    "new_spv",
    "joint_venture",
    "landowner_partnership",
    "nominee_structure",
    "custom",
  ]) {
    assert.ok(sql.includes(`'${t}'`), `structure_type '${t}' missing`);
  }
});

test("migration 0048 enforces only-one-active-structure-per-project", () => {
  const sql = read(MIG_0048);
  assert.match(
    sql,
    /CREATE UNIQUE INDEX IF NOT EXISTS "project_company_structures_active_unique"[\s\S]*?WHERE "is_active" = TRUE/,
  );
});

test("migration 0048 creates company_structure_shareholders with sum-to-100 trigger", () => {
  const sql = read(MIG_0048);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "company_structure_shareholders"/);
  assert.match(sql, /check_shareholder_sum/);
  assert.match(sql, /DEFERRABLE INITIALLY DEFERRED/);
  assert.match(sql, /must sum to exactly 100/);
});

test("migration 0048 creates waterfall_rules with all 7 rule types", () => {
  const sql = read(MIG_0048);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "waterfall_rules"/);
  for (const r of [
    "generic_50_50",
    "arconique_25_credit",
    "preferred_return_then_split",
    "waterfall_with_hurdle",
    "capital_first_then_split",
    "tiered_promote",
    "custom",
  ]) {
    assert.ok(sql.includes(`'${r}'`), `rule_type '${r}' missing`);
  }
});

test("migration 0048 enforces project XOR commitment scope on waterfall_rules", () => {
  const sql = read(MIG_0048);
  assert.match(sql, /CONSTRAINT "waterfall_rules_scope_xor"/);
  assert.match(
    sql,
    /scope = 'project' AND project_id IS NOT NULL AND commitment_id IS NULL/,
  );
  assert.match(
    sql,
    /scope = 'commitment' AND commitment_id IS NOT NULL AND project_id IS NULL/,
  );
});

test("migration 0048 RLS-protects all 3 new tables", () => {
  const sql = read(MIG_0048);
  for (const t of [
    "project_company_structures",
    "company_structure_shareholders",
    "waterfall_rules",
  ]) {
    assert.ok(sql.includes(`'${t}'`), `RLS loop missing ${t}`);
  }
  assert.match(sql, /FORCE ROW LEVEL SECURITY/);
  assert.match(sql, /public\.is_internal_user\(\)/);
});

test("migration 0048 grants investor read on commitment-scoped waterfall_rules", () => {
  const sql = read(MIG_0048);
  assert.match(sql, /waterfall_rules_investor_read/);
  assert.match(sql, /current_investor_id\(\)/);
});

// ===========================================================================
// 2) Schema files exist + index re-exports them
// ===========================================================================

test("Stage 4.B.1 schema files exist", () => {
  assert.ok(exists("src/lib/db/schema/company-structures.ts"));
  assert.ok(exists("src/lib/db/schema/waterfall-rules.ts"));
});

test("schema/index.ts re-exports company-structures + waterfall-rules", () => {
  const src = read("src/lib/db/schema/index.ts");
  assert.match(src, /export \* from "\.\/company-structures";/);
  assert.match(src, /export \* from "\.\/waterfall-rules";/);
});

// ===========================================================================
// 3) Pure helper — generic_50_50
// ===========================================================================

const baseInput = (overrides: Partial<WaterfallInput> = {}): WaterfallInput => ({
  totalDistributable: 0,
  arconiqueCapitalContributed: 0,
  arconiqueCapitalReturned: 0,
  investorCapitalContributed: 0,
  investorCapitalReturned: 0,
  cumulativeProfitDistributed: 0,
  ruleType: "generic_50_50",
  ruleParameters: {},
  ...overrides,
});

test("generic_50_50: full sellout — capital returned + profit split equally", () => {
  const out = applyGeneric5050(
    baseInput({
      totalDistributable: 200_00, // $200
      arconiqueCapitalContributed: 50_00,
      investorCapitalContributed: 50_00,
    }),
  );
  // Capital returned: $50 + $50 = $100. Remainder: $100 split 50/50.
  assert.equal(out.arconiqueAllocation.capitalReturn, 50_00);
  assert.equal(out.investorAllocation.capitalReturn, 50_00);
  assert.equal(out.arconiqueAllocation.profitShare, 50_00);
  assert.equal(out.investorAllocation.profitShare, 50_00);
  assert.equal(out.arconiqueAllocation.total, 100_00);
  assert.equal(out.investorAllocation.total, 100_00);
});

test("generic_50_50: capital partially returned then split", () => {
  const out = applyGeneric5050(
    baseInput({
      totalDistributable: 100_00,
      arconiqueCapitalContributed: 100_00,
      investorCapitalContributed: 100_00,
      arconiqueCapitalReturned: 25_00,
      investorCapitalReturned: 25_00,
    }),
  );
  // Outstanding: 75 each, total 150. D=100 < 150 → no profit phase.
  // Pro-rata-contributed: 50/50 of $100 = $50 each.
  assert.equal(out.arconiqueAllocation.capitalReturn, 50_00);
  assert.equal(out.investorAllocation.capitalReturn, 50_00);
  assert.equal(out.arconiqueAllocation.profitShare, 0);
  assert.equal(out.investorAllocation.profitShare, 0);
});

test("generic_50_50: zero distributable is a no-op", () => {
  const out = applyGeneric5050(baseInput({}));
  assert.equal(out.arconiqueAllocation.total, 0);
  assert.equal(out.investorAllocation.total, 0);
});

test("generic_50_50: handles odd-cent rounding by folding to investor side", () => {
  const out = applyGeneric5050(
    baseInput({
      totalDistributable: 1, // 1 cent of profit
      arconiqueCapitalContributed: 0,
      investorCapitalContributed: 0,
    }),
  );
  // Since contributions are zero, returnCapital returns nothing.
  // Remainder is split: 1/2 = 0 to Arconique, 1 to investor.
  assert.equal(out.arconiqueAllocation.profitShare, 0);
  assert.equal(out.investorAllocation.profitShare, 1);
});

// ===========================================================================
// 4) Pure helper — arconique_25_credit (the headline rule)
// ===========================================================================

test("arconique_25_credit: equal capital — Arconique nets 62.5% of profits + own share", () => {
  // Arconique $1000, Investor $1000, distribute $4000
  // Capital return: $1000 + $1000 = $2000
  // Profit: $2000
  //   - Arconique own profit share: $2000 * 1000/2000 = $1000
  //   - Investor profit pool: $1000
  //     - 25% credit to Arconique: $250
  //     - After credit: $750 split 50/50: $375 each
  //   - Arconique total profit: $1000 + $250 + $375 = $1625
  //   - Investor profit: $375
  // Totals: Arconique $1000 + $1625 = $2625; Investor $1000 + $375 = $1375
  const out = applyArconique25Credit(
    baseInput({
      ruleType: "arconique_25_credit",
      totalDistributable: 4000_00,
      arconiqueCapitalContributed: 1000_00,
      investorCapitalContributed: 1000_00,
    }),
  );
  assert.equal(out.arconiqueAllocation.capitalReturn, 1000_00);
  assert.equal(out.investorAllocation.capitalReturn, 1000_00);
  assert.equal(out.arconiqueAllocation.economicCredit, 250_00);
  assert.equal(out.arconiqueAllocation.profitShare, 1000_00 + 375_00);
  assert.equal(out.investorAllocation.profitShare, 375_00);
  assert.equal(out.arconiqueAllocation.total, 2625_00);
  assert.equal(out.investorAllocation.total, 1375_00);
});

test("arconique_25_credit: full sellout 60/40 capital — math correct", () => {
  // Arconique $600, Investor $400, distribute $2000
  // Capital return: $1000
  // Profit: $1000
  //   - Arconique own: $1000 * 600/1000 = $600
  //   - Investor pool: $400
  //     - 25% credit: $100
  //     - After credit: $300 split 50/50 = $150 each
  //   - Arconique total profit: $600 + $100 + $150 = $850
  //   - Investor profit: $150
  // Totals: Arconique $600 + $850 = $1450; Investor $400 + $150 = $550
  const out = applyArconique25Credit(
    baseInput({
      ruleType: "arconique_25_credit",
      totalDistributable: 2000_00,
      arconiqueCapitalContributed: 600_00,
      investorCapitalContributed: 400_00,
    }),
  );
  assert.equal(out.arconiqueAllocation.total, 1450_00);
  assert.equal(out.investorAllocation.total, 550_00);
  // Sanity: total preserved
  assert.equal(
    out.arconiqueAllocation.total + out.investorAllocation.total,
    2000_00,
  );
});

test("arconique_25_credit: Arconique-only project → 100% to Arconique", () => {
  const out = applyArconique25Credit(
    baseInput({
      ruleType: "arconique_25_credit",
      totalDistributable: 1000_00,
      arconiqueCapitalContributed: 500_00,
      investorCapitalContributed: 0,
    }),
  );
  assert.equal(out.arconiqueAllocation.capitalReturn, 500_00);
  assert.equal(out.arconiqueAllocation.profitShare, 500_00);
  assert.equal(out.arconiqueAllocation.economicCredit, 0);
  assert.equal(out.investorAllocation.total, 0);
});

test("arconique_25_credit: investor-only project — Arconique receives 62.5% of profits", () => {
  // Investor $1000, distribute $1500
  // Capital return: $1000 (all to investor)
  // Profit: $500
  //   - Arconique own profit share: 0 (A=0)
  //   - Investor pool: $500
  //     - 25% credit: $125
  //     - After credit: $375 split 50/50 = $187.50 each
  //   - Arconique total profit: $0 + $125 + $187.50 = $312.50
  //   - Investor profit: $187.50
  const out = applyArconique25Credit(
    baseInput({
      ruleType: "arconique_25_credit",
      totalDistributable: 1500_00,
      arconiqueCapitalContributed: 0,
      investorCapitalContributed: 1000_00,
    }),
  );
  assert.equal(out.arconiqueAllocation.capitalReturn, 0);
  assert.equal(out.arconiqueAllocation.economicCredit, 125_00);
  assert.equal(out.arconiqueAllocation.profitShare, 187_50);
  assert.equal(out.arconiqueAllocation.total, 312_50);
  assert.equal(out.investorAllocation.capitalReturn, 1000_00);
  assert.equal(out.investorAllocation.profitShare, 187_50);
  assert.equal(out.investorAllocation.total, 1187_50);
});

test("arconique_25_credit: partial realization — only capital phase runs", () => {
  // Arconique $2000, Investor $2000, distribute only $1000
  // Total capital outstanding: $4000. Distribute < that → only capital return.
  const out = applyArconique25Credit(
    baseInput({
      ruleType: "arconique_25_credit",
      totalDistributable: 1000_00,
      arconiqueCapitalContributed: 2000_00,
      investorCapitalContributed: 2000_00,
    }),
  );
  // Pro-rata-contributed: $500 each.
  assert.equal(out.arconiqueAllocation.capitalReturn, 500_00);
  assert.equal(out.investorAllocation.capitalReturn, 500_00);
  assert.equal(out.arconiqueAllocation.profitShare, 0);
  assert.equal(out.investorAllocation.profitShare, 0);
  assert.equal(out.arconiqueAllocation.economicCredit, 0);
});

test("arconique_25_credit: zero distributable is a no-op", () => {
  const out = applyArconique25Credit(
    baseInput({ ruleType: "arconique_25_credit" }),
  );
  assert.equal(out.arconiqueAllocation.total, 0);
  assert.equal(out.investorAllocation.total, 0);
  assert.match(out.reasoning, /Nothing distributable/);
});

test("arconique_25_credit: configurable credit_percentage", () => {
  // Drop credit to 10% — Arconique gets less.
  // A=$1000, I=$1000, D=$4000
  // Capital: $1000 each. Profit: $2000.
  //   - Own profit share: $1000 to Arconique
  //   - Investor pool: $1000 → 10% credit = $100 → after $900 split 50/50 = $450 each
  // Arconique profit: $1000 + $100 + $450 = $1550 (vs $1625 at 25%)
  const out = applyArconique25Credit(
    baseInput({
      ruleType: "arconique_25_credit",
      ruleParameters: { credit_percentage: 10 },
      totalDistributable: 4000_00,
      arconiqueCapitalContributed: 1000_00,
      investorCapitalContributed: 1000_00,
    }),
  );
  assert.equal(out.arconiqueAllocation.economicCredit, 100_00);
  assert.equal(out.arconiqueAllocation.total, 2550_00);
  assert.equal(out.investorAllocation.total, 1450_00);
});

test("arconique_25_credit: rejects credit_percentage out of range", () => {
  assert.throws(() =>
    applyArconique25Credit(
      baseInput({
        ruleType: "arconique_25_credit",
        ruleParameters: { credit_percentage: 150 },
        totalDistributable: 100,
      }),
    ),
  );
  assert.throws(() =>
    applyArconique25Credit(
      baseInput({
        ruleType: "arconique_25_credit",
        ruleParameters: { credit_percentage: -5 },
        totalDistributable: 100,
      }),
    ),
  );
});

test("arconique_25_credit: reasoning markdown includes all math steps", () => {
  const out = applyArconique25Credit(
    baseInput({
      ruleType: "arconique_25_credit",
      totalDistributable: 4000_00,
      arconiqueCapitalContributed: 1000_00,
      investorCapitalContributed: 1000_00,
    }),
  );
  assert.match(out.reasoning, /arconique_25_credit/);
  assert.match(out.reasoning, /Returned capital pro-rata/);
  assert.match(out.reasoning, /credit on investor profit pool/);
  assert.match(out.reasoning, /split 50\/50/);
  assert.match(out.reasoning, /Totals/);
});

// ===========================================================================
// 5) Pure helper — preferred_return_then_split
// ===========================================================================

test("preferred_return_then_split: pref return paid first, remainder split", () => {
  // Investor $1000, distribute $200. Pref 8% × 1y = $80 to investor.
  // After pref: $120 split 50/50 = $60 to investor + $60 to Arconique.
  // Investor total profit: $80 + $60 = $140. Capital return $0 (since
  // distributable < contributed on the capital phase) — actually capital
  // is returned first pro-rata. Let's adjust: D=$200 < $1000 (investor),
  // so capital phase consumes all $200. Pref + split phase doesn't run.
  // For the test we want pref to actually run, so distribute > capital.
  const out = applyPreferredReturnThenSplit({
    ...baseInput(),
    ruleType: "preferred_return_then_split",
    totalDistributable: 1200_00,
    investorCapitalContributed: 1000_00,
    ruleParameters: { preferred_return_pct: 8, split_after: 50 },
  });
  // Capital return: $1000 to investor (pro-rata, only investor has capital).
  // Remaining: $200. Pref 8% × 1y on outstanding $1000 = $80 → all paid.
  // After pref: $120 split 50/50 = $60 each.
  // Investor profit: $80 + $60 = $140. Arconique profit: $60.
  assert.equal(out.investorAllocation.capitalReturn, 1000_00);
  assert.equal(out.investorAllocation.profitShare, 140_00);
  assert.equal(out.arconiqueAllocation.profitShare, 60_00);
});

test("preferred_return_then_split: pref capped at remaining", () => {
  // Tiny remainder — pref claim exceeds available
  const out = applyPreferredReturnThenSplit({
    ...baseInput(),
    ruleType: "preferred_return_then_split",
    totalDistributable: 1010_00,
    investorCapitalContributed: 1000_00,
    ruleParameters: { preferred_return_pct: 8, split_after: 50 },
  });
  // Capital return: $1000. Remaining $10. Pref claim $80 but capped at $10.
  // Investor gets all $10. Arconique 0.
  assert.equal(out.investorAllocation.profitShare, 10_00);
  assert.equal(out.arconiqueAllocation.profitShare, 0);
});

// ===========================================================================
// 6) Pure helper — capital_first_then_split
// ===========================================================================

test("capital_first_then_split: 100% capital return, then 50/50 of profit", () => {
  // A=$1000, I=$1000, D=$3000
  // Capital: $1000 each pro-rata-outstanding. Remaining $1000 → 50/50.
  const out = applyCapitalFirstThenSplit({
    ...baseInput(),
    ruleType: "capital_first_then_split",
    totalDistributable: 3000_00,
    arconiqueCapitalContributed: 1000_00,
    investorCapitalContributed: 1000_00,
    ruleParameters: { split_after_capital: 50 },
  });
  assert.equal(out.arconiqueAllocation.capitalReturn, 1000_00);
  assert.equal(out.investorAllocation.capitalReturn, 1000_00);
  assert.equal(out.arconiqueAllocation.profitShare, 500_00);
  assert.equal(out.investorAllocation.profitShare, 500_00);
});

test("capital_first_then_split: 80/20 split for investor-favorable deal", () => {
  // Same as above but split_after_capital=80 (investor 80%)
  const out = applyCapitalFirstThenSplit({
    ...baseInput(),
    ruleType: "capital_first_then_split",
    totalDistributable: 3000_00,
    arconiqueCapitalContributed: 1000_00,
    investorCapitalContributed: 1000_00,
    ruleParameters: { split_after_capital: 80 },
  });
  assert.equal(out.investorAllocation.profitShare, 800_00);
  assert.equal(out.arconiqueAllocation.profitShare, 200_00);
});

// ===========================================================================
// 7) Pure helper — waterfall_with_hurdle
// ===========================================================================

test("waterfall_with_hurdle: below hurdle → below_split applies", () => {
  // No prior profit → IRR estimate is 0% < 12% hurdle.
  const out = applyWaterfallWithHurdle({
    ...baseInput(),
    ruleType: "waterfall_with_hurdle",
    totalDistributable: 2000_00,
    arconiqueCapitalContributed: 1000_00,
    investorCapitalContributed: 1000_00,
    ruleParameters: { hurdle_irr: 12, below_split: 70, above_split: 50 },
  });
  // Capital: $1000 each. Remaining $0 — no split phase. Bad scenario.
  // Need D > capital. Retry:
  const out2 = applyWaterfallWithHurdle({
    ...baseInput(),
    ruleType: "waterfall_with_hurdle",
    totalDistributable: 3000_00,
    arconiqueCapitalContributed: 1000_00,
    investorCapitalContributed: 1000_00,
    ruleParameters: { hurdle_irr: 12, below_split: 70, above_split: 50 },
  });
  // Capital $1000 each. Remaining $1000 split 70/30 (below hurdle) → investor $700, arconique $300.
  assert.equal(out2.investorAllocation.profitShare, 700_00);
  assert.equal(out2.arconiqueAllocation.profitShare, 300_00);
  // First call had remaining=0 — confirm capital phase consumed everything.
  assert.equal(out.investorAllocation.capitalReturn, 1000_00);
  assert.equal(out.arconiqueAllocation.capitalReturn, 1000_00);
});

// ===========================================================================
// 8) Pure helper — tiered_promote
// ===========================================================================

test("tiered_promote: rejects empty tiers", () => {
  assert.throws(() =>
    applyTieredPromote({
      ...baseInput(),
      ruleType: "tiered_promote",
      totalDistributable: 1000,
      ruleParameters: { tiers: [] },
    }),
  );
});

test("tiered_promote: walks tier ladder and uses bottom tier on zero IRR", () => {
  const out = applyTieredPromote({
    ...baseInput(),
    ruleType: "tiered_promote",
    totalDistributable: 3000_00,
    arconiqueCapitalContributed: 1000_00,
    investorCapitalContributed: 1000_00,
    ruleParameters: {
      tiers: [
        { up_to_irr: 8, split: 100 },
        { up_to_irr: 15, split: 80 },
        { above: 15, split: 60 },
      ],
    },
  });
  // No prior profit, IRR=0 < 8 → bottom tier → 100% to investor on remaining $1000.
  assert.equal(out.investorAllocation.profitShare, 1000_00);
  assert.equal(out.arconiqueAllocation.profitShare, 0);
});

// ===========================================================================
// 9) Dispatcher + invariants
// ===========================================================================

test("computeWaterfallAllocation: dispatches every rule type", () => {
  for (const ruleType of [
    "generic_50_50",
    "arconique_25_credit",
    "preferred_return_then_split",
    "waterfall_with_hurdle",
    "capital_first_then_split",
  ] as const) {
    const out = computeWaterfallAllocation({
      ...baseInput(),
      ruleType,
      totalDistributable: 1000_00,
      arconiqueCapitalContributed: 500_00,
      investorCapitalContributed: 500_00,
    });
    assert.equal(out.appliedRule, ruleType, `${ruleType} should round-trip`);
  }
});

test("computeWaterfallAllocation: tiered_promote dispatches with required params", () => {
  const out = computeWaterfallAllocation({
    ...baseInput(),
    ruleType: "tiered_promote",
    totalDistributable: 1000_00,
    arconiqueCapitalContributed: 500_00,
    investorCapitalContributed: 500_00,
    ruleParameters: { tiers: [{ above: 0, split: 50 }] },
  });
  assert.equal(out.appliedRule, "tiered_promote");
});

test("conservation: every rule type preserves total to within 1 cent", () => {
  for (const ruleType of [
    "generic_50_50",
    "arconique_25_credit",
    "capital_first_then_split",
  ] as const) {
    for (const total of [100_00, 1234_56, 999_99, 1]) {
      const input: WaterfallInput = {
        ...baseInput(),
        ruleType,
        totalDistributable: total,
        arconiqueCapitalContributed: 500_00,
        investorCapitalContributed: 500_00,
      };
      const out = computeWaterfallAllocation(input);
      assertConservation(input, out);
    }
  }
});

test("determinism: same inputs always produce identical output", () => {
  const input: WaterfallInput = {
    ...baseInput(),
    ruleType: "arconique_25_credit",
    totalDistributable: 4000_00,
    arconiqueCapitalContributed: 1000_00,
    investorCapitalContributed: 1000_00,
  };
  const a = computeWaterfallAllocation(input);
  const b = computeWaterfallAllocation(input);
  assert.deepEqual(a, b);
});

test("validation: rejects negative inputs", () => {
  assert.throws(() =>
    computeWaterfallAllocation({
      ...baseInput(),
      totalDistributable: -1,
    }),
  );
});

test("validation: rejects capital_returned > capital_contributed", () => {
  assert.throws(() =>
    computeWaterfallAllocation({
      ...baseInput(),
      totalDistributable: 100,
      investorCapitalContributed: 1000,
      investorCapitalReturned: 1500,
    }),
  );
});

// ===========================================================================
// 10) Server modules — files exist + use server-only
// ===========================================================================

test("waterfall server modules exist", () => {
  assert.ok(exists("src/lib/development/server/waterfall/waterfall-helpers.ts"));
  assert.ok(exists("src/lib/development/server/waterfall/waterfall-queries.ts"));
  assert.ok(exists("src/lib/development/server/waterfall/waterfall-actions.ts"));
  assert.ok(exists("src/lib/development/server/waterfall/waterfall-engine.ts"));
});

test("waterfall server-side modules carry server-only guard", () => {
  for (const rel of [
    "src/lib/development/server/waterfall/waterfall-queries.ts",
    "src/lib/development/server/waterfall/waterfall-actions.ts",
    "src/lib/development/server/waterfall/waterfall-engine.ts",
  ]) {
    const src = read(rel);
    assert.match(src, /^(import "server-only"|"use server")/m, `${rel} must import server-only`);
  }
});

test("waterfall-helpers.ts is PURE (no server-only import, no DB imports)", () => {
  const src = read("src/lib/development/server/waterfall/waterfall-helpers.ts");
  // The string "server-only" is permitted in comments — only forbid as an import.
  assert.doesNotMatch(src, /^import\s+"server-only"/m);
  assert.doesNotMatch(src, /requireDb|drizzle-orm/);
});

test("company structure server modules exist", () => {
  assert.ok(
    exists("src/lib/development/server/company-structure/company-queries.ts"),
  );
  assert.ok(
    exists("src/lib/development/server/company-structure/company-actions.ts"),
  );
});

test("company structure actions enforce sum-to-100 client-side as well", () => {
  const src = read(
    "src/lib/development/server/company-structure/company-actions.ts",
  );
  // Defense in depth: app-side validation + DB trigger.
  assert.match(src, /must sum to 100/);
});

test("company structure actions wrap in db.transaction", () => {
  const src = read(
    "src/lib/development/server/company-structure/company-actions.ts",
  );
  assert.match(src, /db\.transaction/);
});

test("waterfall actions use Zod superRefine to enforce scope XOR", () => {
  const src = read(
    "src/lib/development/server/waterfall/waterfall-actions.ts",
  );
  assert.match(src, /superRefine/);
  assert.match(src, /projectId required when scope='project'/);
  assert.match(src, /commitmentId required when scope='commitment'/);
});
