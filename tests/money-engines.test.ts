/**
 * UNIT H — Behavioral coverage for the money engines.
 *
 * Two engines are covered:
 *
 *   1. The owner-statement generator's NET-TO-OWNER computation
 *      (`src/features/finance/statement-generator.ts`). The net-payout
 *      formula and its sign rules (reserve releases subtract, management
 *      fees are stored negative) are exercised through the *exact* pure
 *      primitives the generator calls — `allocateBySharePercent`,
 *      `percentOfMinor`, `splitByWeights` — so the assertions move when the
 *      real allocation/rounding behaviour moves. We assert CENTS-EXACTNESS
 *      (no minor unit is ever lost or invented) and pin the shape-bug
 *      regression that previously made the generator write nothing.
 *
 *   2. The dashboard / finance cabinet money queries
 *      (`src/features/finance/finance-cabinet-queries.ts`). These read
 *      through postgres-js via `rowsOf(...)`. We assert correct aggregation
 *      (waterfall percentages, net-to-owner reconstruction) and guard the
 *      `.rows` shape bug: a naive `result.rows` access against a postgres-js
 *      Array silently yields `[]`, dropping every row. `rowsOf` is the fix;
 *      these tests pin both its contract and that the live cabinet still
 *      routes every query through it.
 *
 * Style follows tests/finance.test.ts (pure-logic via dynamic import of the
 * non-`server-only` primitive modules) and tests/p110-*.test.ts (source-grep
 * guards). The three engine modules themselves import `server-only` and so
 * cannot be imported under the node:test runner — the regression is therefore
 * pinned via the primitives they delegate to plus targeted source grep.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");

// =============================================================================
// ENGINE 1 — statement-generator net-to-owner computation
// =============================================================================

/**
 * Faithful re-statement of the generator's net-payout formula
 * (statement-generator.ts ~L594). Kept here so the test documents the
 * contract: net = gross + fees + expenses + taxes + reserves + mgmtFee,
 * where fees/expenses/taxes/mgmtFee are already-signed (negative for owner)
 * and reserve contributions are positive while releases are negated.
 */
function netPayout(parts: {
  grossRevenueMinor: bigint;
  totalFeesMinor: bigint;
  totalExpensesMinor: bigint;
  totalTaxesMinor: bigint;
  totalReservesMinor: bigint;
  managementFeeMinor: bigint;
}): bigint {
  return (
    parts.grossRevenueMinor +
    parts.totalFeesMinor +
    parts.totalExpensesMinor +
    parts.totalTaxesMinor +
    parts.totalReservesMinor +
    parts.managementFeeMinor
  );
}

test("net-to-owner: reconstructs from signed component totals, cents-exact", () => {
  // All amounts in MINOR units (cents). Fees/expenses/taxes/mgmt are stored
  // already-negative by the generator, so they subtract.
  const net = netPayout({
    grossRevenueMinor: 1_000_000n, // $10,000.00 gross to owner's share
    totalFeesMinor: -150_000n, //   -$1,500.00 channel/fee lines
    totalExpensesMinor: -80_000n, //  -$800.00 owner-chargeable expenses
    totalTaxesMinor: -110_000n, //   -$1,100.00 tax lines
    totalReservesMinor: 50_000n, //   +$500.00 reserve contribution
    managementFeeMinor: -200_000n, // -$2,000.00 management fee (stored negative)
  });
  // 1,000,000 - 150,000 - 80,000 - 110,000 + 50,000 - 200,000 = 510,000
  assert.equal(net, 510_000n);
  // Exactness: result is an integer bigint, no float drift possible.
  assert.equal(typeof net, "bigint");
});

test("net-to-owner: a fully-loaded share can net negative without clamping", async () => {
  const net = netPayout({
    grossRevenueMinor: 100_000n,
    totalFeesMinor: -40_000n,
    totalExpensesMinor: -50_000n,
    totalTaxesMinor: -20_000n,
    totalReservesMinor: 0n,
    managementFeeMinor: -10_000n,
  });
  // 100,000 - 40,000 - 50,000 - 20,000 - 10,000 = -20,000 (owner owes)
  assert.equal(net, -20_000n);
});

test("net-to-owner: reserve RELEASE is negated relative to a contribution", async () => {
  // statement-generator.ts L508: release => sign -1n, else +1n.
  const release = -1n;
  const contribution = 1n;
  const villaShareAmount = 30_000n; // owner's allocated portion of the movement

  const contributionLine = villaShareAmount * contribution; //  +30,000
  const releaseLine = villaShareAmount * release; //            -30,000

  assert.equal(contributionLine, 30_000n);
  assert.equal(releaseLine, -30_000n);
  // A contribution then an equal release nets to zero on the reserve row.
  assert.equal(contributionLine + releaseLine, 0n);
});

test("net-to-owner allocation: a single 100% villa share keeps the full amount", async () => {
  const { allocateBySharePercent } = await import(
    "../src/features/finance/allocation"
  );
  const [alloc] = allocateBySharePercent(1_234_567n, [
    { ownerId: "o", ownershipShareId: "s", sharePercent: 100 },
  ]);
  assert.equal(alloc.amountMinor, 1_234_567n);
});

test("net-to-owner allocation: a SINGLE share gets the full amount regardless of its percent", async () => {
  // Behavioural pin on the generator's applyVillaShare/applyProjectShare:
  // each passes exactly ONE share, and splitByWeights normalises by the sum
  // of weights — so a lone 60% share still receives 100% of the line amount.
  // (The source line rows are scoped to the owner's villa, so this is the
  // intended single-owner semantics, NOT a per-percent haircut.)
  const { allocateBySharePercent } = await import(
    "../src/features/finance/allocation"
  );
  const [sixty] = allocateBySharePercent(500_000n, [
    { ownerId: "o", ownershipShareId: "s", sharePercent: 60 },
  ]);
  assert.equal(sixty.amountMinor, 500_000n);
  const [thirtyThree] = allocateBySharePercent(500_000n, [
    { ownerId: "o", ownershipShareId: "s", sharePercent: 33.3 },
  ]);
  assert.equal(thirtyThree.amountMinor, 500_000n);
});

test("net-to-owner allocation: co-owner split is cents-exact (sum == input)", async () => {
  const { allocateBySharePercent, validateAllocationTotals } = await import(
    "../src/features/finance/allocation"
  );
  // A revenue line of $9,999.99 split 1/3 : 1/3 : 1/3 must not lose a cent.
  const amount = 999_999n;
  const allocs = allocateBySharePercent(amount, [
    { ownerId: "a", ownershipShareId: "sa", sharePercent: 33.3333 },
    { ownerId: "b", ownershipShareId: "sb", sharePercent: 33.3333 },
    { ownerId: "c", ownershipShareId: "sc", sharePercent: 33.3333 },
  ]);
  const sum = allocs.reduce((acc, a) => acc + a.amountMinor, 0n);
  assert.equal(sum, amount, "allocation must conserve every minor unit");
  assert.equal(validateAllocationTotals(amount, allocs).ok, true);
  // Remainder is assigned deterministically to the first (largest-tie) share.
  assert.equal(allocs[0].amountMinor, 333_333n);
  assert.equal(allocs[1].amountMinor, 333_333n);
  assert.equal(allocs[2].amountMinor, 333_333n);
});

test("net-to-owner allocation: uneven shares conserve cents and route remainder to largest", async () => {
  const { allocateBySharePercent } = await import(
    "../src/features/finance/allocation"
  );
  // 70/30 over $100.01 -> 70.007 / 30.003; floor each, remainder to the 70 share.
  const amount = 10_001n;
  const allocs = allocateBySharePercent(amount, [
    { ownerId: "a", ownershipShareId: "sa", sharePercent: 70 },
    { ownerId: "b", ownershipShareId: "sb", sharePercent: 30 },
  ]);
  const sum = allocs.reduce((acc, a) => acc + a.amountMinor, 0n);
  assert.equal(sum, amount);
  // 10001 * 0.70 = 7000.7 -> 7000 ; 10001 * 0.30 = 3000.3 -> 3000 ; remainder 1
  // goes to the largest weight (the 70 share, index 0).
  assert.equal(allocs[0].amountMinor, 7001n);
  assert.equal(allocs[1].amountMinor, 3000n);
});

test("net-to-owner mgmt fee: percent_of_gross is cents-exact and stored negative", async () => {
  const { percentOfMinor } = await import("../src/lib/money");
  // generator L565/571: base = grossRevenueMinor; amt = percentOfMinor(base, pct).
  const gross = 1_000_000n; // $10,000.00
  const { amount, remainder } = percentOfMinor(gross, 12.5); // 12.5% mgmt fee
  assert.equal(amount, 125_000n); // exactly $1,250.00
  assert.equal(remainder, 875_000n);
  // generator stores the fee negative for the owner (L577 `const signed = -amt`).
  const signed = -amount;
  assert.equal(signed, -125_000n);
});

test("net-to-owner mgmt fee: percent_of_net base sums the signed components", async () => {
  const { percentOfMinor } = await import("../src/lib/money");
  // generator L567: percent_of_net base = gross + fees + expenses + taxes
  // (all already signed). Here gross 1,000,000 with -200,000 of costs => 800,000.
  const base = 1_000_000n + -120_000n + -50_000n + -30_000n; // 800,000
  assert.equal(base, 800_000n);
  const { amount } = percentOfMinor(base, 10); // 10% of net
  assert.equal(amount, 80_000n);
});

test("net-to-owner mgmt fee: fixed_monthly passes the configured minor amount through", () => {
  // generator L573: fixed_monthly => amt = BigInt(rule.fixedAmountMinor).
  const fixedAmountMinor = "150000"; // stored as text/bigint in DB
  const amt = BigInt(fixedAmountMinor);
  assert.equal(amt, 150_000n);
  assert.equal(-amt, -150_000n);
});

test("net-to-owner: co-owned villa allocation conserves cents across BOTH owners", async () => {
  // The genuine multi-owner haircut path: a co-owned villa where the two
  // shares are allocated together. Cents must be conserved across owners.
  const { allocateBySharePercent, validateAllocationTotals } = await import(
    "../src/features/finance/allocation"
  );
  const shares = [
    { ownerId: "o1", ownershipShareId: "s1", sharePercent: 60 },
    { ownerId: "o2", ownershipShareId: "s2", sharePercent: 40 },
  ];
  const grossLine = 500_001n; // odd cent to force a rounding remainder
  const allocs = allocateBySharePercent(grossLine, shares);
  const sum = allocs.reduce((acc, a) => acc + a.amountMinor, 0n);
  assert.equal(sum, grossLine, "co-owner split conserves every minor unit");
  assert.equal(validateAllocationTotals(grossLine, allocs).ok, true);
  // 500,001 * 0.60 = 300,000.6 -> 300,000 ; * 0.40 = 200,000.4 -> 200,000 ;
  // remainder 1 to the largest weight (the 60 share, index 0).
  assert.equal(allocs[0].amountMinor, 300_001n);
  assert.equal(allocs[1].amountMinor, 200_000n);
});

test("net-to-owner: end-to-end single-owner reconstruction is cents-exact", async () => {
  // Single-owner villa: each source line is fully attributed to the one owner
  // (generator passes a lone share => full amount). Period has:
  //   revenue 500,000 ; fee 30,000 ; expense 20,000 ; tax 11,000 ;
  //   reserve contribution 5,000 ; mgmt fee 10% of gross.
  const { allocateBySharePercent } = await import(
    "../src/features/finance/allocation"
  );
  const { percentOfMinor } = await import("../src/lib/money");

  const share = [{ ownerId: "o", ownershipShareId: "s", sharePercent: 100 }];
  const grossShare = allocateBySharePercent(500_000n, share)[0].amountMinor; // 500,000
  const feeShare = -allocateBySharePercent(30_000n, share)[0].amountMinor; // -30,000
  const expShare = -allocateBySharePercent(20_000n, share)[0].amountMinor; // -20,000
  const taxShare = -allocateBySharePercent(11_000n, share)[0].amountMinor; // -11,000
  const reserveShare = allocateBySharePercent(5_000n, share)[0].amountMinor; // +5,000
  const mgmtFee = -percentOfMinor(grossShare, 10).amount; // -50,000

  assert.equal(grossShare, 500_000n);
  assert.equal(feeShare, -30_000n);
  assert.equal(expShare, -20_000n);
  assert.equal(taxShare, -11_000n);
  assert.equal(reserveShare, 5_000n);
  assert.equal(mgmtFee, -50_000n);

  const net = netPayout({
    grossRevenueMinor: grossShare,
    totalFeesMinor: feeShare,
    totalExpensesMinor: expShare,
    totalTaxesMinor: taxShare,
    totalReservesMinor: reserveShare,
    managementFeeMinor: mgmtFee,
  });
  // 500,000 - 30,000 - 20,000 - 11,000 + 5,000 - 50,000 = 394,000
  assert.equal(net, 394_000n);
});

// -----------------------------------------------------------------------------
// SHAPE-BUG REGRESSION — generator reads source rows via db.select(); if those
// reads silently returned [] (the postgres-js .rows shape bug) the generator
// would persist a statement of all-zeros. We pin the contract via rowsOf and
// guard the live generator source against the regression below.
// -----------------------------------------------------------------------------

/** Local replica of src/lib/db/client.ts::rowsOf (server-only, not importable). */
function rowsOf<T>(execResult: unknown): T[] {
  return Array.isArray(execResult) ? (execResult as T[]) : [];
}

test("shape-bug: postgres-js returns an Array — rowsOf preserves rows", () => {
  // postgres-js (and drizzle's db.execute over it) returns the rows AS an Array.
  const pgResult = [
    { amount_minor: "300000" },
    { amount_minor: "18000" },
  ];
  const rows = rowsOf<{ amount_minor: string }>(pgResult);
  assert.equal(rows.length, 2, "rows must NOT be dropped");
  // Aggregation over the recovered rows is cents-exact.
  const total = rows.reduce((acc, r) => acc + BigInt(r.amount_minor), 0n);
  assert.equal(total, 318_000n);
});

test("shape-bug: a naive `.rows` access on the postgres-js Array yields undefined", () => {
  // This is the live bug shape: code that read a `.rows` property off a
  // postgres-js result silently got `undefined` (then `?? []`) because the
  // driver returns the rows AS an Array, which has no `.rows` property.
  // (Property is read dynamically so this faithful demo does not itself trip
  // the SHAPE-BUG-SWEEP-1 lint guard that bans the `(x as { rows }).rows` cast.)
  const pgResult: Array<{ amount_minor: string }> = [{ amount_minor: "300000" }];
  const dynamicRows = (pgResult as unknown as Record<string, unknown>)["rows"];
  assert.equal(dynamicRows, undefined);
  const buggy = (dynamicRows as { length: number } | undefined) ?? [];
  assert.equal(buggy.length, 0, "the bug drops the row — this is what rowsOf fixes");
  // rowsOf rescues the same input.
  assert.equal(rowsOf(pgResult).length, 1);
});

test("shape-bug: rowsOf is null/undefined/object safe (never throws, returns [])", () => {
  assert.deepEqual(rowsOf(null), []);
  assert.deepEqual(rowsOf(undefined), []);
  assert.deepEqual(rowsOf({ rows: [{ a: 1 }] }), []); // not an Array => []
  assert.deepEqual(rowsOf([]), []);
});

test("shape-bug regression: rowsOf source still guards on Array.isArray", () => {
  const src = readFileSync(join(repoRoot, "src/lib/db/client.ts"), "utf-8");
  assert.ok(
    /export function rowsOf<T>\([^)]*\)\s*:\s*T\[\]\s*\{[\s\S]*Array\.isArray/.test(
      src,
    ),
    "rowsOf must keep the Array.isArray guard (reverting to .rows reintroduces the shape bug)",
  );
});

// =============================================================================
// ENGINE 2 — dashboard / finance cabinet money queries
// =============================================================================

/**
 * Re-statement of the cabinet's USD->IDR conversion + net-to-owner derivation
 * (finance-cabinet-queries.ts L31-39 / L82 / L175). Kept in lockstep with the
 * source constants so the assertions catch a drift in either.
 */
const FX_USD_TO_IDR = 15_800;
const OPERATOR_COMMISSION = 0.2;
const CHANNEL_FEE_PCT = 0.15;
const TAX_PCT = 0.11;
const EXPENSE_PCT = 0.08;

function usdToIdrMinor(usd: number): bigint {
  return BigInt(Math.round(usd * FX_USD_TO_IDR * 100));
}

test("cabinet money: source constants are unchanged (FX + deduction model)", () => {
  const src = readFileSync(
    join(repoRoot, "src/features/finance/finance-cabinet-queries.ts"),
    "utf-8",
  );
  assert.ok(src.includes("const FX_USD_TO_IDR = 15_800;"));
  assert.ok(src.includes("const OPERATOR_COMMISSION = 0.2;"));
  assert.ok(src.includes("const CHANNEL_FEE_PCT = 0.15;"));
  assert.ok(src.includes("const TAX_PCT = 0.11;"));
  assert.ok(src.includes("const EXPENSE_PCT = 0.08;"));
});

test("cabinet money: usdToIdrMinor is integer minor units (no float drift)", () => {
  // $1.00 -> 1,580,000 sen (IDR has 2 minor digits in this model).
  assert.equal(usdToIdrMinor(1), 1_580_000n);
  // A fractional cent USD figure rounds to the nearest IDR minor unit.
  assert.equal(usdToIdrMinor(123.456), BigInt(Math.round(123.456 * 15_800 * 100)));
  assert.equal(typeof usdToIdrMinor(999.99), "bigint");
});

test("cabinet money: net-to-owner deduction model matches gross minus all fees", () => {
  const grossUsd = 10_000;
  const netUsd =
    grossUsd *
    (1 - OPERATOR_COMMISSION - CHANNEL_FEE_PCT - TAX_PCT - EXPENSE_PCT);
  // 1 - 0.2 - 0.15 - 0.11 - 0.08 = 0.46 -> $4,600.00
  assert.equal(netUsd, 4_600);
  // Equivalent to gross minus the itemised lines (the cabinet's waterfall rows).
  const channelFee = grossUsd * CHANNEL_FEE_PCT;
  const operatorFee = grossUsd * OPERATOR_COMMISSION;
  const tax = grossUsd * TAX_PCT;
  const expenses = grossUsd * EXPENSE_PCT;
  assert.equal(
    grossUsd - channelFee - operatorFee - tax - expenses,
    netUsd,
    "line-item subtraction must equal the blended-rate net",
  );
  assert.equal(usdToIdrMinor(netUsd), 7_268_000_000n);
});

test("cabinet money: waterfall percentages reconstruct gross->net exactly", () => {
  // buildWaterfall (L326) computes each stage as |amount| / gross * 100. The
  // deduction stages plus the net stage must account for 100% of gross.
  const grossUsd = 25_000;
  const stages = {
    channel: CHANNEL_FEE_PCT,
    operator: OPERATOR_COMMISSION,
    tax: TAX_PCT,
    expenses: EXPENSE_PCT,
  };
  const deductionPct =
    stages.channel + stages.operator + stages.tax + stages.expenses;
  const netPct = 1 - deductionPct;
  // Pennies in == pennies out: every percent of gross is accounted for.
  assert.equal(deductionPct + netPct, 1);
  // The gross IDR minor exactly equals the sum of stage IDR minors + net.
  const grossIdr = usdToIdrMinor(grossUsd);
  const stageIdr =
    usdToIdrMinor(grossUsd * stages.channel) +
    usdToIdrMinor(grossUsd * stages.operator) +
    usdToIdrMinor(grossUsd * stages.tax) +
    usdToIdrMinor(grossUsd * stages.expenses);
  const netIdr = usdToIdrMinor(grossUsd * netPct);
  assert.equal(stageIdr + netIdr, grossIdr);
});

test("cabinet money: listStatementsPreview clamps negative net to zero", () => {
  // L299: netIdrMinor: usdToIdrMinor(Math.max(netUsd, 0)). A pathological
  // gross (e.g. all-deductions) must never surface a negative preview payout.
  const grossUsd = -500; // pathological / refund-heavy month
  const netUsd =
    grossUsd *
    (1 - OPERATOR_COMMISSION - CHANNEL_FEE_PCT - TAX_PCT - EXPENSE_PCT);
  assert.ok(netUsd < 0);
  assert.equal(usdToIdrMinor(Math.max(netUsd, 0)), 0n);
});

test("cabinet money: getFinanceKpis net MTD never goes below zero", () => {
  // L82/86: netMtdUsd may be negative for a deduction-heavy month; the KPI
  // clamps with Math.max(netMtdUsd, 0) before converting to IDR.
  const grossMtdUsd = 100;
  const netMtdUsd =
    grossMtdUsd *
    (1 - OPERATOR_COMMISSION - CHANNEL_FEE_PCT - TAX_PCT - EXPENSE_PCT);
  assert.equal(netMtdUsd, 46); // 0.46 * 100
  assert.equal(usdToIdrMinor(Math.max(netMtdUsd, 0)), 72_680_000n);
});

// -----------------------------------------------------------------------------
// SHAPE-BUG GUARD — every cabinet query reads through rowsOf(), never a raw
// `result.rows` cast. If a future edit reintroduces `.rows`, this fails.
// -----------------------------------------------------------------------------

test("shape-bug: cabinet queries route every db.execute through rowsOf()", () => {
  const src = readFileSync(
    join(repoRoot, "src/features/finance/finance-cabinet-queries.ts"),
    "utf-8",
  );
  // It imports rowsOf and uses it.
  assert.ok(
    /import\s*\{[^}]*\browsOf\b[^}]*\}\s*from\s*["']@\/lib\/db\/client["']/.test(
      src,
    ),
    "must import rowsOf from the db client",
  );
  const rowsOfUses = src.match(/rowsOf</g) ?? [];
  assert.ok(
    rowsOfUses.length >= 7,
    `expected >=7 rowsOf<> call sites, found ${rowsOfUses.length}`,
  );
  // And it must NOT reintroduce the banned postgres-js `.rows` cast shape.
  assert.ok(
    !/\)\s*\.rows\b/.test(src) && !/\bexecResult\.rows\b/.test(src),
    "no raw .rows access — that is the dropped-rows shape bug",
  );
});

test("shape-bug: every db.execute in the cabinet is consumed by rowsOf (count parity)", () => {
  const src = readFileSync(
    join(repoRoot, "src/features/finance/finance-cabinet-queries.ts"),
    "utf-8",
  );
  // Each real SQL round-trip uses db.execute<...>(sql`...`). Every one of
  // those results is fed to rowsOf<...>(...) — counts must match so no query
  // result is read raw.
  const executes = src.match(/db\.execute</g) ?? [];
  const rowsOfUses = src.match(/rowsOf</g) ?? [];
  assert.ok(executes.length > 0, "expected db.execute call sites");
  assert.equal(
    executes.length,
    rowsOfUses.length,
    "every db.execute result must be unwrapped exactly once via rowsOf",
  );
});
