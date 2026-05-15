import { test } from "node:test";
import assert from "node:assert/strict";

test("formatMoneyMinor renders USD with cents", async () => {
  const { formatMoneyMinor } = await import("../src/lib/money");
  assert.match(formatMoneyMinor(12345n, "USD"), /\$123\.45/);
  assert.match(formatMoneyMinor(-12345n, "USD"), /-\$123\.45/);
});

test("parseMoneyToMinor handles thousands separators and currency symbols", async () => {
  const { parseMoneyToMinor } = await import("../src/lib/money");
  assert.equal(parseMoneyToMinor("1,234.56"), 123456n);
  assert.equal(parseMoneyToMinor("$1,234.56"), 123456n);
  assert.equal(parseMoneyToMinor("12 345,67"), 1234567n);
  assert.throws(() => parseMoneyToMinor("not money"));
});

test("addMinor / subtractMinor stay in BigInt land", async () => {
  const { addMinor, subtractMinor } = await import("../src/lib/money");
  assert.equal(addMinor(100n, 200n, 300n), 600n);
  assert.equal(subtractMinor(1000n, 250n), 750n);
});

test("splitByWeights distributes deterministically and assigns rounding remainder to largest weight", async () => {
  const { splitByWeights } = await import("../src/lib/money");
  const r1 = splitByWeights(100n, [1, 1, 1]);
  // 33 + 33 + 33 = 99, remainder 1 to first largest (index 0)
  assert.deepEqual(r1.allocations.map(String), ["34", "33", "33"]);
  assert.equal(r1.remainder, 0n);

  const r2 = splitByWeights(100n, [50, 50]);
  assert.deepEqual(r2.allocations.map(String), ["50", "50"]);

  const r3 = splitByWeights(0n, [70, 30]);
  assert.deepEqual(r3.allocations.map(String), ["0", "0"]);
});

test("allocateBySharePercent integrates owners by share input", async () => {
  const { allocateBySharePercent } = await import("../src/features/finance/allocation");
  const allocs = allocateBySharePercent(100000n, [
    { ownerId: "a", ownershipShareId: "sa", sharePercent: 70 },
    { ownerId: "b", ownershipShareId: "sb", sharePercent: 30 },
  ]);
  assert.equal(allocs[0].amountMinor, 70000n);
  assert.equal(allocs[1].amountMinor, 30000n);
});

test("validateAllocationTotals catches drift", async () => {
  const { validateAllocationTotals } = await import("../src/features/finance/allocation");
  const ok = validateAllocationTotals(100n, [
    { ownerId: "a", ownershipShareId: "s", sharePercent: 100, amountMinor: 100n },
  ]);
  assert.equal(ok.ok, true);
  const bad = validateAllocationTotals(100n, [
    { ownerId: "a", ownershipShareId: "s", sharePercent: 100, amountMinor: 99n },
  ]);
  assert.equal(bad.ok, false);
});

test("calculateAdrMinor / calculateRevparMinor handle zero division", async () => {
  const { calculateAdrMinor, calculateRevparMinor } = await import("../src/lib/money");
  assert.equal(calculateAdrMinor(100000n, 0), 0n);
  assert.equal(calculateRevparMinor(100000n, 0), 0n);
  assert.equal(calculateAdrMinor(120000n, 6), 20000n);
  assert.equal(calculateRevparMinor(120000n, 12), 10000n);
});

test("calculateRoomMetrics computes occupancy in 0–1 range", async () => {
  const { calculateRoomMetrics } = await import("../src/features/finance/calculations");
  const m = calculateRoomMetrics(2, "2026-03-01", "2026-03-31", 31, 620000n);
  // 2 villas × 31 nights = 62 available, 31 sold = 0.5
  assert.equal(m.availableNights, 62);
  assert.equal(m.soldNights, 31);
  assert.equal(m.occupancy, 31 / 62);
});

test("calculateNights handles same-day and reversed dates", async () => {
  const { calculateNights } = await import("../src/lib/money");
  assert.equal(calculateNights("2026-04-25", "2026-04-25"), 0);
  assert.equal(calculateNights("2026-04-25", "2026-04-29"), 4);
  assert.equal(calculateNights("2026-04-29", "2026-04-25"), 0);
});

test("statement-generator schema validates required fields", async () => {
  const { generateStatementSchema } = await import("../src/features/finance/schema");
  const ok = generateStatementSchema.safeParse({
    ownerId: "00000000-0000-0000-0000-000000000001",
    periodId: "00000000-0000-0000-0000-000000000002",
    currency: "USD",
  });
  assert.equal(ok.success, true);
  const bad = generateStatementSchema.safeParse({});
  assert.equal(bad.success, false);
});

test("finance permissions matrix grants finance.* roles correctly", async () => {
  const { hasPermission } = await import("../src/features/auth/permission-matrix");
  const fm = {
    mode: "live" as const,
    appUser: { id: "u", email: "a@b", fullName: "A", status: "active", organizationId: "00000000-0000-0000-0000-000000000000" },
    roles: ["finance_manager" as const],
    isInternal: true,
    isSuperAdmin: false,
  };
  const accountant = { ...fm, roles: ["accountant" as const] };
  assert.equal(hasPermission(fm, "finance.write"), true);
  assert.equal(hasPermission(fm, "finance.close_period"), true);
  assert.equal(hasPermission(fm, "finance.approve_payout"), true);
  assert.equal(hasPermission(accountant, "finance.write"), true);
  assert.equal(hasPermission(accountant, "finance.close_period"), false);
});
