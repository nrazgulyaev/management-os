/**
 * CRON-CONVERGENCE replay proof.
 *
 * The monthly cron (src/app/api/cron/statements-monthly/route.ts) historically
 * ran the FORMULA generator (statement-generation.ts →
 * generateStatementForOwnerVilla). This test proves the canonical LEDGER engine
 * (statement-generator.ts → generateOwnerStatement), configured to the
 * "reproduce-cron" StatementSettings (revenueSource='bookings', taxMode='formula'
 * 11, reserveMode='formula' 3, mgmtMode='formula' = the owner's commission%, all
 * includes on, IDR), produces the IDENTICAL net AND the same line breakdown on
 * identical synthetic inputs — PER (owner, VILLA), with posted owner-chargeable
 * expense_lines included. Because it is byte-exact across the representative
 * cases, the cron IS repointed to the engine.
 *
 * Both generators are DB-bound, so this test replicates their PURE arithmetic
 * (the exact rounding steps each one performs) on the same synthetic bookings /
 * dev-expenses / expense_lines, and compares the nets + line magnitudes. The
 * engine side uses the SAME shared pure helpers the live engine calls
 * (computeStatementNet + formulaDeductionMagnitudeMinor from statement-net-pure),
 * so its arithmetic is the real thing, not a re-derivation. The expense_lines
 * port replicates loadOwnerChargeableExpenseLines's single-step
 * `Math.round(amount * perVillaFactor * sharePctFactor)`.
 *
 * GRANULARITY (founder decision 2): the engine is always called PER (owner,
 * VILLA) with villaId set, so it rounds tax/reserve/mgmt on THAT villa's gross —
 * identical to the per-villa formula generator. The old per-villa-vs-per-owner
 * aggregation divergence does not arise on the repointed path.
 *
 * ROUNDING (founder decision 3): BigInt half-up (formulaDeductionMagnitudeMinor)
 * is canonical; the formula generator's float Math.round is the legacy. At
 * realistic IDR-minor magnitudes they are byte-identical (asserted below); the
 * BigInt path is the source of truth where they would differ past 2^53.
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
  /** 1 for villa-attributed, 1/villaCount for project-pool shared lines. */
  perVillaFactor: number;
}

const TAX_PCT = 0.11;
const RESERVE_PCT = 0.03;
const COMMISSION_FRACTION = 0.2; // 20% mgmt — the formula generator's default.

/** Detailed result so the test can compare the line breakdown, not just net. */
interface Breakdown {
  grossMinor: bigint;
  channelFeeMinor: bigint;
  expenseMinor: bigint;
  taxMinor: bigint;
  reserveMinor: bigint;
  mgmtMinor: bigint;
  net: bigint;
}

// ---------------------------------------------------------------------------
// (a) FORMULA generator math — copied step-for-step from statement-generation.ts
//     generateStatementForOwnerVilla (one owner × ONE villa), INCLUDING the
//     owner-chargeable expense_lines (loadOwnerChargeableExpenseLines) it deducts.
// ---------------------------------------------------------------------------
function formulaGenerator(
  sharePercent: number,
  commissionFraction: number,
  bookings: SynthBooking[],
  devExpenses: SynthDevExpense[],
  expenseLines: SynthExpenseLine[],
): Breakdown {
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
  // STAFF-COST-MODEL phase 2: the formula generator ALSO deducts expense_lines,
  // single-step `Math.round(amount * perVillaFactor * sharePctFactor)`.
  for (const e of expenseLines) {
    const ownerShare = BigInt(
      Math.round(Number(e.amountIdrMinor) * e.perVillaFactor * sharePctFactor),
    );
    if (ownerShare === 0n) continue;
    expenseMinor += ownerShare;
  }

  const taxMinor = BigInt(Math.round(Number(grossMinor) * TAX_PCT));
  const reserveMinor = BigInt(Math.round(Number(grossMinor) * RESERVE_PCT));
  const mgmtMinor = BigInt(Math.round(Number(grossMinor) * commissionFraction));

  const net =
    grossMinor - channelFeeMinor - expenseMinor - taxMinor - reserveMinor - mgmtMinor;
  return { grossMinor, channelFeeMinor, expenseMinor, taxMinor, reserveMinor, mgmtMinor, net };
}

// ---------------------------------------------------------------------------
// (b) Configurable ENGINE math — the reproduce-cron config path of
//     statement-generator.ts, called PER (owner, VILLA) with villaId set. Revenue
//     / channel-fee / dev-expense / expense_line share-split is the SAME
//     per-line Math.round the engine's bookings + expense_line ports perform;
//     tax / reserve / mgmt use the SHARED formulaDeductionMagnitudeMinor + the
//     SHARED computeStatementNet the live engine calls. expense_lines ARE read
//     (the ported loadOwnerChargeableExpenseLines path).
// ---------------------------------------------------------------------------
function configurableEngine(
  sharePercent: number,
  commissionFraction: number,
  bookings: SynthBooking[],
  devExpenses: SynthDevExpense[],
  expenseLines: SynthExpenseLine[],
): Breakdown {
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
  // Ported expense_lines: same single-step round as the formula generator.
  for (const e of expenseLines) {
    const ownerShare = BigInt(
      Math.round(Number(e.amountIdrMinor) * e.perVillaFactor * sharePctFactor),
    );
    if (ownerShare === 0n) continue;
    totalExpensesMinor += ownerShare;
  }

  // mgmtPct = commission FRACTION × 100 (reproduceCronStatementSettings).
  const totalTaxesMinor = formulaDeductionMagnitudeMinor(grossRevenueMinor, 11);
  const totalReservesMinor = formulaDeductionMagnitudeMinor(grossRevenueMinor, 3);
  const managementFeeMinor = formulaDeductionMagnitudeMinor(
    grossRevenueMinor,
    commissionFraction * 100,
  );

  const net = computeStatementNet({
    grossRevenueMinor,
    totalFeesMinor,
    totalExpensesMinor,
    totalTaxesMinor,
    totalReservesMinor,
    managementFeeMinor,
  });
  return {
    grossMinor: grossRevenueMinor,
    channelFeeMinor: totalFeesMinor,
    expenseMinor: totalExpensesMinor,
    taxMinor: totalTaxesMinor,
    reserveMinor: totalReservesMinor,
    mgmtMinor: managementFeeMinor,
    net,
  };
}

/** Assert two breakdowns are byte-identical (net AND every component). */
function assertExact(label: string, f: Breakdown, e: Breakdown) {
  assert.equal(f.grossMinor, e.grossMinor, `${label}: gross`);
  assert.equal(f.channelFeeMinor, e.channelFeeMinor, `${label}: channel fee`);
  assert.equal(f.expenseMinor, e.expenseMinor, `${label}: expenses`);
  assert.equal(f.taxMinor, e.taxMinor, `${label}: tax`);
  assert.equal(f.reserveMinor, e.reserveMinor, `${label}: reserve`);
  assert.equal(f.mgmtMinor, e.mgmtMinor, `${label}: mgmt fee`);
  assert.equal(f.net, e.net, `${label}: NET`);
}

// ===========================================================================
// REPRESENTATIVE REALISTIC CASES — engine (per-villa, reproduce-cron config,
// with expense_lines) === formula generator, EXACTLY.
// ===========================================================================

// (1) Single villa, 100% share, no fees/expenses.
test("EXACT: single villa, plain bookings", () => {
  const bookings: SynthBooking[] = [
    { grossIdrMinor: 100_000_000n, channelFeeIdrMinor: 0n },
    { grossIdrMinor: 50_000_000n, channelFeeIdrMinor: 0n },
  ];
  const f = formulaGenerator(100, COMMISSION_FRACTION, bookings, [], []);
  const e = configurableEngine(100, COMMISSION_FRACTION, bookings, [], []);
  assertExact("single villa", f, e);
  // gross 150M, tax 16.5M, reserve 4.5M, mgmt 30M → net 99M.
  assert.equal(f.net, 99_000_000n);
});

// (2) Villa WITH channel fees.
test("EXACT: villa with channel fees", () => {
  const bookings: SynthBooking[] = [
    { grossIdrMinor: 100_000_000n, channelFeeIdrMinor: 5_000_000n },
    { grossIdrMinor: 50_000_000n, channelFeeIdrMinor: 2_500_000n },
  ];
  const f = formulaGenerator(100, COMMISSION_FRACTION, bookings, [], []);
  const e = configurableEngine(100, COMMISSION_FRACTION, bookings, [], []);
  assertExact("channel fees", f, e);
  // gross 150M, fee 7.5M, tax 16.5M, reserve 4.5M, mgmt 30M → net 91.5M.
  assert.equal(f.net, 91_500_000n);
});

// (3) Villa with dev_transactions expenses.
test("EXACT: villa with dev_transactions expenses", () => {
  const bookings: SynthBooking[] = [
    { grossIdrMinor: 100_000_000n, channelFeeIdrMinor: 5_000_000n },
  ];
  const devExpenses: SynthDevExpense[] = [
    { amountIdrMinor: 10_000_000n },
    { amountIdrMinor: 3_250_000n },
  ];
  const f = formulaGenerator(100, COMMISSION_FRACTION, bookings, devExpenses, []);
  const e = configurableEngine(100, COMMISSION_FRACTION, bookings, devExpenses, []);
  assertExact("dev expenses", f, e);
});

// (4) Villa with posted owner-chargeable expense_lines (perVillaFactor = 1).
//     This is the gap that previously DIVERGED — now the engine reads them too.
test("EXACT: villa with posted owner-chargeable expense_lines", () => {
  const bookings: SynthBooking[] = [
    { grossIdrMinor: 100_000_000n, channelFeeIdrMinor: 0n },
  ];
  const expenseLines: SynthExpenseLine[] = [
    { amountIdrMinor: 8_000_000n, perVillaFactor: 1 }, // payroll staff cost
    { amountIdrMinor: 1_234_567n, perVillaFactor: 1 },
  ];
  const f = formulaGenerator(100, COMMISSION_FRACTION, bookings, [], expenseLines);
  const e = configurableEngine(100, COMMISSION_FRACTION, bookings, [], expenseLines);
  assertExact("expense_lines", f, e);
  // The engine now ALSO deducts the 9,234,567 expense_lines → nets match.
  assert.equal(f.expenseMinor, 9_234_567n);
  assert.equal(e.expenseMinor, 9_234_567n);
});

// (5) <100% ownership share (per-line Math.round share-split on every input).
test("EXACT: villa with <100% ownership share", () => {
  const bookings: SynthBooking[] = [
    { grossIdrMinor: 100_000_001n, channelFeeIdrMinor: 5_000_003n },
    { grossIdrMinor: 33_333_333n, channelFeeIdrMinor: 1_111_111n },
  ];
  const devExpenses: SynthDevExpense[] = [{ amountIdrMinor: 7_777_777n }];
  const expenseLines: SynthExpenseLine[] = [
    { amountIdrMinor: 2_500_005n, perVillaFactor: 1 },
  ];
  const share = 37.5; // co-owned villa
  const f = formulaGenerator(share, COMMISSION_FRACTION, bookings, devExpenses, expenseLines);
  const e = configurableEngine(share, COMMISSION_FRACTION, bookings, devExpenses, expenseLines);
  assertExact("partial share", f, e);
});

// (6) Project-pool shared expense_line (perVillaFactor = 1/villaCount).
test("EXACT: villa with a project-pool shared expense_line", () => {
  const bookings: SynthBooking[] = [
    { grossIdrMinor: 80_000_000n, channelFeeIdrMinor: 4_000_000n },
  ];
  const villaCount = 4;
  const expenseLines: SynthExpenseLine[] = [
    // complex-wide line, apportioned 1/4 to this villa, then × share.
    { amountIdrMinor: 20_000_000n, perVillaFactor: 1 / villaCount },
    { amountIdrMinor: 6_666_666n, perVillaFactor: 1 / villaCount },
  ];
  const share = 50;
  const f = formulaGenerator(share, COMMISSION_FRACTION, bookings, [], expenseLines);
  const e = configurableEngine(share, COMMISSION_FRACTION, bookings, [], expenseLines);
  assertExact("project pool", f, e);
});

// (7) Non-default owner commission% (e.g. 18.5%) — mgmt fraction→pct path.
test("EXACT: non-default owner commission percentage", () => {
  const bookings: SynthBooking[] = [
    { grossIdrMinor: 123_456_700n, channelFeeIdrMinor: 6_172_835n },
  ];
  const commission = 0.185; // 18.5%
  const f = formulaGenerator(100, commission, bookings, [], []);
  const e = configurableEngine(100, commission, bookings, [], []);
  assertExact("commission 18.5%", f, e);
});

// (8) Combined realistic statement — bookings + fees + dev + villa & pool
//     expense_lines + partial share. The full reproduce-cron shape.
test("EXACT: combined realistic statement (every input together)", () => {
  const bookings: SynthBooking[] = [
    { grossIdrMinor: 145_000_000n, channelFeeIdrMinor: 7_250_000n },
    { grossIdrMinor: 62_500_000n, channelFeeIdrMinor: 3_125_000n },
    { grossIdrMinor: 19_999_999n, channelFeeIdrMinor: 999_999n },
  ];
  const devExpenses: SynthDevExpense[] = [
    { amountIdrMinor: 12_345_678n },
    { amountIdrMinor: 4_500_000n },
  ];
  const expenseLines: SynthExpenseLine[] = [
    { amountIdrMinor: 9_000_000n, perVillaFactor: 1 }, // villa payroll
    { amountIdrMinor: 15_000_000n, perVillaFactor: 1 / 3 }, // shared-pool
  ];
  const share = 62.5;
  const f = formulaGenerator(share, COMMISSION_FRACTION, bookings, devExpenses, expenseLines);
  const e = configurableEngine(share, COMMISSION_FRACTION, bookings, devExpenses, expenseLines);
  assertExact("combined", f, e);
});

// ===========================================================================
// ROUNDING NOTE (founder decision 3): at realistic IDR-minor magnitudes the
// formula generator's float Math.round is byte-identical to the engine's BigInt
// half-up; the BigInt path is canonical where they would differ past 2^53.
// ===========================================================================
test("rounding: float Math.round == BigInt half-up at realistic magnitudes", () => {
  for (const gross of [
    12_345_678_900n,
    99_999_999_999n,
    150_000_000n,
    207_500_000n,
    1n,
    50n,
  ]) {
    assert.equal(
      BigInt(Math.round(Number(gross) * TAX_PCT)),
      formulaDeductionMagnitudeMinor(gross, 11),
      `tax @ ${gross}`,
    );
    assert.equal(
      BigInt(Math.round(Number(gross) * RESERVE_PCT)),
      formulaDeductionMagnitudeMinor(gross, 3),
      `reserve @ ${gross}`,
    );
    assert.equal(
      BigInt(Math.round(Number(gross) * COMMISSION_FRACTION)),
      formulaDeductionMagnitudeMinor(gross, 20),
      `mgmt @ ${gross}`,
    );
  }

  // Past 2^53 the float path loses integer precision; BigInt half-up is the
  // canonical source of truth (this is WHY the engine uses BigInt). The
  // reproduce-cron config rounds via BigInt, so the cron is now precise here.
  const huge = 123_456_789_012_345_678n;
  assert.notEqual(
    BigInt(Math.round(Number(huge) * TAX_PCT)),
    formulaDeductionMagnitudeMinor(huge, 11),
  );
});
