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
