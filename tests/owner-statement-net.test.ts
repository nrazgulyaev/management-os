/**
 * MONEY-CORRECTNESS regression test for the canonical LEDGER owner-statement
 * generator. Exercises the pure net/line-sign logic in
 * src/features/finance/statement-net-pure.ts, which statement-generator.ts uses.
 *
 * Guards the sign bug that was OVERPAYING owners: deductions are stored as
 * POSITIVE magnitudes by the write path, the net must SUBTRACT them (not sum),
 * and every deduction statement LINE must be NEGATIVE so Σ(lines) == net.
 *
 * Run with: npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";

test("computeStatementNet SUBTRACTS positive-magnitude deductions (worked example)", async () => {
  const { computeStatementNet } = await import(
    "../src/features/finance/statement-net-pure"
  );

  // Worked example (all deductions stored POSITIVE, as the live write path does):
  //   revenue 100,000,000
  //   expense  10,000,000
  //   tax      11,000,000
  //   mgmt     20,000,000
  // Canonical net = 100M - 10M - 11M - 20M = 59,000,000.
  const net = computeStatementNet({
    grossRevenueMinor: 100_000_000n,
    totalFeesMinor: 0n,
    totalExpensesMinor: 10_000_000n,
    totalTaxesMinor: 11_000_000n,
    totalReservesMinor: 0n,
    managementFeeMinor: 20_000_000n,
  });

  assert.equal(net, 59_000_000n);

  // The OLD (buggy) pure-sum would have produced 141,000,000 — proving the
  // overpayment is fixed.
  assert.notEqual(net, 141_000_000n);
});

test("Σ(signed lines) equals net, and every deduction line is negative", async () => {
  const { computeStatementNet, assertStatementLinesMatchNet } = await import(
    "../src/features/finance/statement-net-pure"
  );

  // Magnitudes (positive) the generator accumulates from the raw stored rows.
  const grossRevenueMinor = 100_000_000n;
  const totalFeesMinor = 5_000_000n;
  const totalExpensesMinor = 10_000_000n;
  const totalTaxesMinor = 11_000_000n;
  const totalReservesMinor = 3_000_000n; // a contribution (set-aside), signed +
  const managementFeeMinor = 20_000_000n;

  const net = computeStatementNet({
    grossRevenueMinor,
    totalFeesMinor,
    totalExpensesMinor,
    totalTaxesMinor,
    totalReservesMinor,
    managementFeeMinor,
  });
  assert.equal(net, 51_000_000n); // 100M -5M -10M -11M -3M -20M

  // Statement LINES as the generator pushes them: revenue POSITIVE, every
  // deduction NEGATIVE (a reserve contribution → −magnitude).
  const lines = [
    { line_type: "revenue", amount_minor: grossRevenueMinor },
    { line_type: "fee", amount_minor: -totalFeesMinor },
    { line_type: "expense", amount_minor: -totalExpensesMinor },
    { line_type: "tax", amount_minor: -totalTaxesMinor },
    { line_type: "reserve", amount_minor: -totalReservesMinor },
    { line_type: "management_fee", amount_minor: -managementFeeMinor },
  ];

  for (const l of lines) {
    if (l.line_type === "revenue") {
      assert.ok(l.amount_minor > 0n, "revenue line must be positive");
    } else {
      assert.ok(l.amount_minor < 0n, `${l.line_type} deduction line must be negative`);
    }
  }

  const linesSignedTotal = lines.reduce<bigint>((acc, l) => acc + l.amount_minor, 0n);
  assert.equal(linesSignedTotal, net, "Σ(lines) must equal net");

  // The hard invariant guard must NOT throw when lines reconcile.
  assert.doesNotThrow(() => assertStatementLinesMatchNet(linesSignedTotal, net));
});

test("reserve RELEASE adds back to net (signed magnitude)", async () => {
  const { computeStatementNet } = await import(
    "../src/features/finance/statement-net-pure"
  );

  // A release carries a NEGATIVE magnitude in totalReservesMinor (returns
  // money); subtracting a negative ADDS it back to the payout.
  const net = computeStatementNet({
    grossRevenueMinor: 100_000_000n,
    totalFeesMinor: 0n,
    totalExpensesMinor: 0n,
    totalTaxesMinor: 0n,
    totalReservesMinor: -4_000_000n, // release
    managementFeeMinor: 0n,
  });
  assert.equal(net, 104_000_000n); // 100M - (-4M) = 104M
});

test("assertStatementLinesMatchNet THROWS when lines drift from net", async () => {
  const { assertStatementLinesMatchNet } = await import(
    "../src/features/finance/statement-net-pure"
  );
  assert.throws(
    () => assertStatementLinesMatchNet(59_000_000n, 51_000_000n),
    /integrity check failed/,
  );
});

test("formulaDeductionMagnitudeMinor computes a positive % of gross", async () => {
  const { formulaDeductionMagnitudeMinor } = await import(
    "../src/features/finance/statement-net-pure"
  );

  // 11% of gross 100,000,000 = 11,000,000 (positive magnitude).
  assert.equal(formulaDeductionMagnitudeMinor(100_000_000n, 11), 11_000_000n);
  // 3% of gross 100,000,000 = 3,000,000.
  assert.equal(formulaDeductionMagnitudeMinor(100_000_000n, 3), 3_000_000n);

  // Edge cases: zero / negative pct and non-positive base → 0 (never negative).
  assert.equal(formulaDeductionMagnitudeMinor(100_000_000n, 0), 0n);
  assert.equal(formulaDeductionMagnitudeMinor(0n, 11), 0n);
  assert.equal(formulaDeductionMagnitudeMinor(-5n, 11), 0n);

  // Fractional pct rounds half-up: 1.5% of 100 minor = 1.5 → 2.
  assert.equal(formulaDeductionMagnitudeMinor(100n, 1.5), 2n);
});

test("FORMULA tax+reserve: signed lines reconcile to net (invariant holds)", async () => {
  const { computeStatementNet, assertStatementLinesMatchNet, formulaDeductionMagnitudeMinor } =
    await import("../src/features/finance/statement-net-pure");

  // Mirrors statement-settings 'formula' mode: tax_pct=11, reserve_pct=3 on a
  // gross of 100,000,000. The generator does NOT read the ledger here — it
  // computes these magnitudes and emits ONE negative line each.
  const grossRevenueMinor = 100_000_000n;
  const taxMagnitude = formulaDeductionMagnitudeMinor(grossRevenueMinor, 11);
  const reserveMagnitude = formulaDeductionMagnitudeMinor(grossRevenueMinor, 3);

  assert.equal(taxMagnitude, 11_000_000n);
  assert.equal(reserveMagnitude, 3_000_000n);

  // Generator accumulators: POSITIVE magnitudes added to the running totals.
  const totalTaxesMinor = taxMagnitude; // 11M positive
  const totalReservesMinor = reserveMagnitude; // 3M positive (a contribution)

  const net = computeStatementNet({
    grossRevenueMinor,
    totalFeesMinor: 0n,
    totalExpensesMinor: 0n,
    totalTaxesMinor,
    totalReservesMinor,
    managementFeeMinor: 0n,
  });
  // 100M - 11M - 3M = 86M.
  assert.equal(net, 86_000_000n);

  // Statement LINES as the generator pushes them in formula mode: revenue
  // POSITIVE, tax/reserve lines the NEGATIVE of their magnitude.
  const lines = [
    { line_type: "revenue", amount_minor: grossRevenueMinor },
    { line_type: "tax", amount_minor: -taxMagnitude },
    { line_type: "reserve", amount_minor: -reserveMagnitude },
  ];

  // The formula tax line is exactly −11,000,000 and the reserve line −3,000,000.
  assert.equal(lines[1].amount_minor, -11_000_000n);
  assert.equal(lines[2].amount_minor, -3_000_000n);

  const linesSignedTotal = lines.reduce<bigint>((acc, l) => acc + l.amount_minor, 0n);
  assert.equal(linesSignedTotal, net, "Σ(formula lines) must equal net");
  assert.doesNotThrow(() => assertStatementLinesMatchNet(linesSignedTotal, net));
});
