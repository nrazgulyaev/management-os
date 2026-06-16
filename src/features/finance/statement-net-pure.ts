/**
 * MONEY-CORRECTNESS — pure (DB-free, server-only-free) net + invariant logic for
 * the canonical LEDGER owner-statement generator (statement-generator.ts).
 *
 * Lives in its own `-pure` module (no `import "server-only"`) so the money math
 * is unit-testable under `tsx --test` without dragging in the DB client. The
 * generator imports `computeStatementNet` / `assertStatementLinesMatchNet` from
 * here, which both ENABLES the test and DOCUMENTS the invariant in one place.
 *
 * Canonical convention (identical to statement-generation.ts):
 *  - The summary MAGNITUDES (totalFees/Expenses/Taxes/managementFee) are stored
 *    POSITIVE — they are deductions, so the net SUBTRACTS them.
 *  - `totalReservesMinor` carries a release sign: a contribution is +magnitude
 *    (set-aside reduces net → subtracted), a release is −magnitude (returns
 *    money → subtracting a negative adds it back). So it is subtracted too.
 *  - Net = gross − fees − expenses − taxes − reserves − managementFee.
 *  - Every statement LINE stores its SIGNED contribution to net: revenue
 *    POSITIVE; fee/expense/tax/management NEGATIVE; reserve = −magnitude (with
 *    the release-sign baked in). For a correctly-built statement
 *    Σ(line.amount_minor) MUST equal the net.
 */

export interface StatementNetParts {
  grossRevenueMinor: bigint;
  /** Positive magnitude. */
  totalFeesMinor: bigint;
  /** Positive magnitude. */
  totalExpensesMinor: bigint;
  /** Positive magnitude. */
  totalTaxesMinor: bigint;
  /** Signed: contribution +magnitude, release −magnitude. */
  totalReservesMinor: bigint;
  /** Positive magnitude. */
  managementFeeMinor: bigint;
  /**
   * Positive magnitude. STATEMENT-SETTINGS (#284 custom deductions): operator-
   * defined extra deduction lines (formula % of gross OR fixed). Optional so the
   * call sites that predate custom deductions keep compiling — absent → 0.
   */
  totalCustomDeductionsMinor?: bigint;
}

/**
 * Canonical statement net. Deductions are positive magnitudes and are
 * SUBTRACTED (the prior generator SUMMED them, adding positive
 * expenses/fees/taxes to the payout → owners were OVERPAID).
 */
export function computeStatementNet(parts: StatementNetParts): bigint {
  return (
    parts.grossRevenueMinor -
    parts.totalFeesMinor -
    parts.totalExpensesMinor -
    parts.totalTaxesMinor -
    parts.totalReservesMinor -
    parts.managementFeeMinor -
    (parts.totalCustomDeductionsMinor ?? 0n)
  );
}

/**
 * STATEMENT-SETTINGS — pure formula deduction magnitude. Computes a percentage
 * of a base (gross revenue) as a POSITIVE minor-unit magnitude, used for the
 * tax/reserve `formula` modes. Pure (no DB) so it is unit-testable here.
 *
 * Lives in the `-pure` module so the canonical generator and the test compute
 * the SAME number. The generator emits the statement LINE as the NEGATIVE of
 * this magnitude and adds the POSITIVE magnitude to the running total
 * (totalTaxesMinor / totalReservesMinor), which `computeStatementNet` then
 * SUBTRACTS — keeping the Σ(lines)==net invariant intact.
 *
 * Half-up rounding on the .5 boundary (matches Math.round on positive values);
 * the base is a non-negative gross so we never round a negative.
 */
export function formulaDeductionMagnitudeMinor(
  baseMinor: bigint,
  pct: number,
): bigint {
  if (!Number.isFinite(pct) || pct <= 0) return 0n;
  if (baseMinor <= 0n) return 0n;
  // Scale pct to 3 decimals (matches the numeric(6,3) column) before BigInt
  // division to avoid float drift: magnitude = base * pct_milli / 100_000.
  const pctMilli = BigInt(Math.round(pct * 1000));
  const numerator = baseMinor * pctMilli;
  const denominator = 100_000n;
  // Round half-up: add half the denominator before the floor division.
  return (numerator + denominator / 2n) / denominator;
}

/**
 * Hard invariant guard: Σ(signed statement lines) MUST equal the computed net.
 * If a line sign or accumulator ever drifts, this throws BEFORE any money row
 * is written — failing loudly is correct for owner-payout money.
 */
export function assertStatementLinesMatchNet(
  linesSignedTotalMinor: bigint,
  netPayoutMinor: bigint,
): void {
  if (linesSignedTotalMinor !== netPayoutMinor) {
    throw new Error(
      `Statement integrity check failed: Σ(lines)=${linesSignedTotalMinor} != net=${netPayoutMinor}. ` +
        `Refusing to write a statement whose lines do not reconcile to its net payout.`,
    );
  }
}
