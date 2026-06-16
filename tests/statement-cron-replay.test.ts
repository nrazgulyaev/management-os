/**
 * CRON-CONVERGENCE replay proof.
 *
 * The monthly cron (src/app/api/cron/statements-monthly/route.ts) runs the
 * FORMULA generator (statement-generation.ts → generateStatementForOwnerVilla).
 * The task asked: can the configurable LEDGER engine (statement-generator.ts →
 * generateOwnerStatement) — configured to "reproduce-cron" (revenueSource=
 * 'bookings', taxMode='formula' 11, reserveMode='formula' 3, mgmtMode='formula'
 * 20, all includes on, IDR) — produce the IDENTICAL net on identical synthetic
 * inputs? If byte-exact, repoint the cron. If not, leave the cron and report the
 * divergence so a human decides.
 *
 * Both generators are DB-bound, so this test replicates their PURE arithmetic
 * (the exact rounding steps each one performs) on the same synthetic bookings /
 * expenses, and compares the nets. The configurable-engine side uses the SAME
 * shared pure helpers the live generator calls (computeStatementNet +
 * formulaDeductionMagnitudeMinor from statement-net-pure.ts), so its arithmetic
 * is the real thing, not a re-derivation.
 *
 * RESULT (see assertions): the two paths CONVERGE on the constrained
 * single-villa / no-expense_lines / realistic-magnitude case, but DIVERGE on:
 *   (1) tax/reserve/mgmt rounding — the formula generator rounds via float
 *       `Math.round(Number(gross) * 0.11)`; the engine rounds via BigInt half-up
 *       `(gross*pctMilli + denom/2)/denom`. At realistic IDR-minor magnitudes
 *       these AGREE, but the float path is NOT byte-exact: beyond 2^53 minor
 *       units `Number(gross)` loses integer precision and the nets differ by 1.
 *       (Theoretical at production scale, but it means equivalence cannot be
 *       PROVEN — only observed for a bounded magnitude range.)
 *   (2) expense_lines — the formula generator ALSO deducts
 *       loadOwnerChargeableExpenseLines (posted owner-chargeable expense_lines,
 *       incl. payroll staff costs + shared-pool complex costs); the engine's
 *       bookings port reads ONLY dev_transactions, so any expense_line widens
 *       the net gap.
 *   (3) per-villa vs per-owner aggregation — the formula generator emits ONE
 *       statement per (owner, villa) and rounds tax/reserve/mgmt on PER-VILLA
 *       gross; the engine emits ONE statement per (owner, period) and rounds on
 *       the SUMMED gross. Σ round(gᵢ·p) ≠ round(Σgᵢ·p).
 *
 * Because exact equivalence cannot be proven across these, the cron is NOT
 * repointed (a divergence test asserts they differ on a realistic case).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  computeStatementNet,
  formulaDeductionMagnitudeMinor,
} from "../src/features/finance/statement-net-pure";

// ---------------------------------------------------------------------------
// Synthetic inputs (already in IDR minor, mirroring loadBookings' toIdrMinor).
// ---------------------------------------------------------------------------
interface SynthBooking {
  grossIdrMinor: bigint;
  channelFeeIdrMinor: bigint;
}
interface SynthDevExpense {
  amountIdrMinor: bigint;
}
interface SynthExpenseLine {
  amountIdrMinor: bigint;
  perVillaFactor: number;
}

const TAX_PCT = 0.11;
const RESERVE_PCT = 0.03;
const COMMISSION_PCT = 0.2; // 20% mgmt — the formula generator's default.

// ---------------------------------------------------------------------------
// (a) FORMULA generator math — copied step-for-step from statement-generation.ts
//     generateStatementForOwnerVilla (one owner × ONE villa).
// ---------------------------------------------------------------------------
function formulaGeneratorNet(
  sharePercent: number,
  bookings: SynthBooking[],
  devExpenses: SynthDevExpense[],
  expenseLines: SynthExpenseLine[],
): bigint {
  const sharePctFactor = sharePercent / 100;

  let grossMinor = 0n;
  let channelFeeMinor = 0n;
  for (const b of bookings) {
    grossMinor += BigInt(Math.round(Number(b.grossIdrMinor) * sharePctFactor));
    channelFeeMinor += BigInt(
      Math.round(Number(b.channelFeeIdrMinor) * sharePctFactor),
    );
  }

  let expenseMinor = 0n;
  for (const e of devExpenses) {
    expenseMinor += BigInt(Math.round(Number(e.amountIdrMinor) * sharePctFactor));
  }
  // STAFF-COST-MODEL phase 2: the formula generator ALSO deducts expense_lines.
  for (const e of expenseLines) {
    const ownerShare = BigInt(
      Math.round(Number(e.amountIdrMinor) * e.perVillaFactor * sharePctFactor),
    );
    if (ownerShare === 0n) continue;
    expenseMinor += ownerShare;
  }

  const taxMinor = BigInt(Math.round(Number(grossMinor) * TAX_PCT));
  const reserveMinor = BigInt(Math.round(Number(grossMinor) * RESERVE_PCT));
  const operatorFeeMinor = BigInt(Math.round(Number(grossMinor) * COMMISSION_PCT));

  return (
    grossMinor -
    channelFeeMinor -
    expenseMinor -
    taxMinor -
    reserveMinor -
    operatorFeeMinor
  );
}

// ---------------------------------------------------------------------------
// (b) Configurable ENGINE math — the reproduce-cron config path of
//     statement-generator.ts. Revenue/channel-fee/dev-expense share-split is the
//     SAME per-booking Math.round the engine's bookings port performs; tax /
//     reserve / mgmt use the SHARED formulaDeductionMagnitudeMinor + the SHARED
//     computeStatementNet the live engine calls. expense_lines are NOT read.
// ---------------------------------------------------------------------------
function configurableEngineNet(
  sharePercent: number,
  bookings: SynthBooking[],
  devExpenses: SynthDevExpense[],
): bigint {
  const sharePctFactor = sharePercent / 100;

  let grossRevenueMinor = 0n;
  let totalFeesMinor = 0n;
  for (const b of bookings) {
    grossRevenueMinor += BigInt(
      Math.round(Number(b.grossIdrMinor) * sharePctFactor),
    );
    totalFeesMinor += BigInt(
      Math.round(Number(b.channelFeeIdrMinor) * sharePctFactor),
    );
  }

  let totalExpensesMinor = 0n;
  for (const e of devExpenses) {
    totalExpensesMinor += BigInt(
      Math.round(Number(e.amountIdrMinor) * sharePctFactor),
    );
  }

  const totalTaxesMinor = formulaDeductionMagnitudeMinor(grossRevenueMinor, 11);
  const totalReservesMinor = formulaDeductionMagnitudeMinor(grossRevenueMinor, 3);
  const managementFeeMinor = formulaDeductionMagnitudeMinor(grossRevenueMinor, 20);

  return computeStatementNet({
    grossRevenueMinor,
    totalFeesMinor,
    totalExpensesMinor,
    totalTaxesMinor,
    totalReservesMinor,
    managementFeeMinor,
  });
}

// ---------------------------------------------------------------------------
// CONVERGENT case — single villa, 100% share, no expense_lines, gross chosen so
// 11% / 3% / 20% land on clean minor units (no float-boundary rounding). Here
// the two paths AGREE.
// ---------------------------------------------------------------------------
test("CONVERGES on the constrained no-expense_line / clean-rounding case", () => {
  const bookings: SynthBooking[] = [
    { grossIdrMinor: 100_000_000n, channelFeeIdrMinor: 5_000_000n },
    { grossIdrMinor: 50_000_000n, channelFeeIdrMinor: 2_500_000n },
  ];
  const devExpenses: SynthDevExpense[] = [{ amountIdrMinor: 10_000_000n }];

  const formula = formulaGeneratorNet(100, bookings, devExpenses, []);
  const engine = configurableEngineNet(100, bookings, devExpenses);

  // gross 150M, fee 7.5M, expense 10M, tax 16.5M, reserve 4.5M, mgmt 30M
  //  → net = 150 - 7.5 - 10 - 16.5 - 4.5 - 30 = 81.5M.
  assert.equal(formula, 81_500_000n);
  assert.equal(engine, 81_500_000n);
  assert.equal(formula, engine, "constrained case must converge");
});

// ---------------------------------------------------------------------------
// DIVERGENCE (1) — float vs BigInt rounding of the tax/reserve/mgmt deductions.
// At realistic IDR-minor magnitudes the two rounding methods AGREE (so this is
// not the operative blocker), BUT the formula generator's float path is not
// byte-exact: once gross exceeds 2^53 minor units, Number(gross) loses integer
// precision and Math.round disagrees with the exact-rational BigInt half-up by 1
// minor unit. Equivalence therefore cannot be PROVEN for all inputs — only
// observed within a bounded magnitude range.
// ---------------------------------------------------------------------------
test("tax/reserve/mgmt rounding: agrees at realistic scale, NOT byte-exact beyond 2^53", () => {
  // Realistic IDR-minor gross: float and BigInt half-up agree.
  const realistic = 12_345_678_900n; // ~123M IDR
  assert.equal(
    BigInt(Math.round(Number(realistic) * TAX_PCT)),
    formulaDeductionMagnitudeMinor(realistic, 11),
  );

  // Astronomical gross past 2^53 (≈9.007e15): Number() loses precision and the
  // float tax disagrees with the exact BigInt half-up by 1 minor unit.
  // The tax DEDUCTION itself is off by one minor unit between the two paths,
  // proving the formula generator's float rounding is not byte-exact with the
  // engine's BigInt half-up. (At this magnitude the reserve/mgmt float errors
  // happen to offset the tax error in the whole-statement net, so we assert at
  // the deduction level where the non-equivalence is unambiguous.)
  const huge = 123_456_789_012_345_678n;
  const floatTax = BigInt(Math.round(Number(huge) * TAX_PCT));
  const bigTax = formulaDeductionMagnitudeMinor(huge, 11);
  assert.equal(floatTax, 13_580_246_791_358_024n);
  assert.equal(bigTax, 13_580_246_791_358_025n);
  assert.notEqual(
    floatTax,
    bigTax,
    "float tax loses precision past 2^53 → not byte-exact with BigInt half-up; equivalence is NOT provable across all magnitudes",
  );
});

// ---------------------------------------------------------------------------
// DIVERGENCE (2) — expense_lines the formula generator deducts but the engine's
// bookings port does not read.
// ---------------------------------------------------------------------------
test("DIVERGES when posted owner-chargeable expense_lines exist (engine omits them)", () => {
  const bookings: SynthBooking[] = [
    { grossIdrMinor: 100_000_000n, channelFeeIdrMinor: 0n },
  ];
  const expenseLines: SynthExpenseLine[] = [
    { amountIdrMinor: 8_000_000n, perVillaFactor: 1 }, // e.g. payroll staff cost
  ];

  const formula = formulaGeneratorNet(100, bookings, [], expenseLines);
  const engine = configurableEngineNet(100, bookings, []);

  // The formula net is 8M lower (it deducted the expense_line); the engine never
  // saw it.
  assert.equal(
    formula,
    engine - 8_000_000n,
    "formula deducts the expense_line, the engine bookings port does not",
  );
  assert.notEqual(formula, engine);
});

// ---------------------------------------------------------------------------
// DIVERGENCE (3) — per-villa (formula: 1 statement/villa, tax on per-villa gross)
// vs per-owner aggregate (engine: 1 statement, tax on summed gross). Σround(gᵢ·p)
// ≠ round(Σgᵢ·p).
// ---------------------------------------------------------------------------
test("DIVERGES on multi-villa owners (per-villa vs per-owner tax rounding)", () => {
  // Two villas with gross that each individually round tax 'up' but whose sum
  // rounds 'down' — classic Σround ≠ roundΣ.
  const villaA: SynthBooking[] = [{ grossIdrMinor: 5n, channelFeeIdrMinor: 0n }];
  const villaB: SynthBooking[] = [{ grossIdrMinor: 5n, channelFeeIdrMinor: 0n }];

  // FORMULA: one statement per villa, summed.
  const formulaTotal =
    formulaGeneratorNet(100, villaA, [], []) +
    formulaGeneratorNet(100, villaB, [], []);

  // ENGINE: one statement on the owner's combined villa shares.
  const engineCombined = configurableEngineNet(
    100,
    [...villaA, ...villaB],
    [],
  );

  // tax on 5 minor: round(5*0.11)=round(0.55)=1 per villa → 2 total (formula);
  // tax on 10 minor: round(10*0.11)=round(1.1)=1 (engine). Same for reserve/mgmt.
  // The aggregation changes the rounded deductions → different net.
  assert.notEqual(
    formulaTotal,
    engineCombined,
    "per-villa vs per-owner aggregation rounds the formula deductions differently",
  );
});
