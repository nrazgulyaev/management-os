/**
 * Unit tests for the pure GP-economics shaping module
 * (feat/w1de-lp-dashboard-gp-waterfall-copilot). No DB / no server-only,
 * so it runs under `tsx --test tests/*.test.ts`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

test("buildLpGpEconomics: zero proceeds => empty, no positive stages", async () => {
  const { buildLpGpEconomics } = await import(
    "../src/features/investors/lp-gp-economics"
  );
  const r = buildLpGpEconomics({
    contributedUsdMinor: 1_000_000_00n, // $1,000,000
    distributedUsdMinor: 0n,
    profitSharePercent: 10,
  });
  assert.equal(r.isEmpty, true);
  assert.equal(r.stages.length, 0);
  assert.equal(r.gpTotalMajor, 0);
});

test("buildLpGpEconomics: proceeds at contributed => return-of-capital only, no GP", async () => {
  const { buildLpGpEconomics } = await import(
    "../src/features/investors/lp-gp-economics"
  );
  const r = buildLpGpEconomics({
    contributedUsdMinor: 1_000_000_00n, // $1,000,000 contributed
    distributedUsdMinor: 1_000_000_00n, // exactly returns capital
    profitSharePercent: 25,
  });
  assert.equal(r.isEmpty, false);
  // Only the return-of-capital tier should carry value.
  assert.equal(r.stages.length, 1);
  assert.equal(r.stages[0].label, "Return of capital");
  assert.equal(r.stages[0].amount, 1_000_000);
  assert.equal(r.gpTotalMajor, 0);
});

test("buildLpGpEconomics: rich proceeds => GP earns carry and catch-up", async () => {
  const { buildLpGpEconomics } = await import(
    "../src/features/investors/lp-gp-economics"
  );
  const r = buildLpGpEconomics({
    contributedUsdMinor: 1_000_000_00n, // $1,000,000
    distributedUsdMinor: 2_000_000_00n, // $2,000,000 proceeds
    profitSharePercent: 50,
  });
  assert.equal(r.isEmpty, false);
  assert.ok(r.gpTotalMajor > 0, "GP should take catch-up + carry");
  assert.ok(r.lpTotalMajor > 0, "LP should still take the majority");
  // GP-only tiers must surface the GP amount with a "to GP" hint.
  const catchUp = r.stages.find((s) => s.label === "GP catch-up");
  assert.ok(catchUp, "catch-up stage present");
  assert.equal(catchUp?.hint, "to GP");
});
