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
    parts.managementFeeMinor
  );
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
