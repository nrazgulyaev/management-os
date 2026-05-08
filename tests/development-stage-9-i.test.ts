/**
 * Stage 9.I — Slow-query optimization acceptance tests.
 *
 * Static guards on the new query shapes for the four hub-metric
 * functions that 8.C identified as causing >60s production hangs:
 *
 *   getDirectBookingMetrics    7 round-trips → 2
 *   getDepositMetrics          2 round-trips + JS sum → 1 round-trip + SQL SUM
 *   getReconciliationMetrics   3 round-trips + JS sum → 2 round-trips + SQL SUM
 *   getPricingHubMetrics       6 round-trips + JS reduce → 3 round-trips, all reductions in SQL
 *
 * Each test asserts on the static call shape so a future refactor
 * that re-introduces the slow pattern is caught at the test layer
 * before it reaches production. Live perf verification happens via
 * the 8.E `[perf]` runtime logs after deploy.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE =
  typeof __dirname !== "undefined"
    ? __dirname
    : dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

function bodyOf(src: string, fnName: string): string {
  const startRe = new RegExp(`export async function ${fnName}\\b`);
  const startMatch = src.match(startRe);
  if (!startMatch) throw new Error(`Could not find ${fnName} in source`);
  // Take the function body up to the next top-level `export async function`
  // or end of file — close enough for grep-based assertions.
  const fromStart = src.slice(startMatch.index!);
  const nextExport = fromStart
    .slice(1)
    .search(/\nexport (?:async\s+)?function\b/);
  return nextExport > 0 ? fromStart.slice(0, nextExport + 1) : fromStart;
}

// ============================================================================
// getDirectBookingMetrics — 7 → 2 queries
// ============================================================================

test("9.I: getDirectBookingMetrics fires exactly 2 aggregate queries (no fan-out)", () => {
  const body = bodyOf(
    read("src/features/direct-booking/services.ts"),
    "getDirectBookingMetrics",
  );
  // Should have exactly 2 .from(direct_booking_*) calls — one for holds,
  // one for requests. The legacy 7-query fan-out would have ≥4.
  const fromHolds = body.match(/\.from\(directBookingHolds\)/g) ?? [];
  const fromRequests = body.match(/\.from\(directBookingRequests\)/g) ?? [];
  assert.strictEqual(
    fromHolds.length,
    1,
    `Expected exactly 1 .from(directBookingHolds), found ${fromHolds.length}`,
  );
  assert.strictEqual(
    fromRequests.length,
    1,
    `Expected exactly 1 .from(directBookingRequests), found ${fromRequests.length}`,
  );
  // Multiple FILTER clauses prove the aggregate-via-FILTER pattern is in place.
  const filters = body.match(/FILTER\s*\(WHERE/g) ?? [];
  assert.ok(
    filters.length >= 5,
    `Expected ≥5 FILTER clauses across the two aggregates, found ${filters.length}`,
  );
});

// ============================================================================
// getDepositMetrics — fetch-and-sum → SQL SUM
// ============================================================================

test("9.I: getDepositMetrics uses SQL SUM (no fetch-then-JS-reduce)", () => {
  const body = bodyOf(
    read("src/features/direct-booking/deposits.ts"),
    "getDepositMetrics",
  );
  // Only one read of the table — no separate "fetch every paid row" call.
  const fromCalls = body.match(/\.from\(directBookingDeposits\)/g) ?? [];
  assert.strictEqual(
    fromCalls.length,
    1,
    `Expected exactly 1 .from(directBookingDeposits), found ${fromCalls.length}`,
  );
  // SUM aggregate in SQL.
  assert.match(body, /SUM\(.*amountMinor.*\)\s*FILTER/i);
  // No JS reduce loop — the legacy `for (const r of totals)` is gone.
  assert.doesNotMatch(
    body,
    /for\s*\(\s*const\s+r\s+of\s+totals\s*\)/,
    "JS reduce over deposits totals should be eliminated",
  );
});

// ============================================================================
// getReconciliationMetrics — fetch-and-sum → SQL SUM
// ============================================================================

test("9.I: getReconciliationMetrics uses SQL SUM (no fetch-then-JS-reduce on balances)", () => {
  const body = bodyOf(
    read("src/features/direct-booking/finance-reconciliation.ts"),
    "getReconciliationMetrics",
  );
  // Only one read of finance_links — no separate "fetch every posted row" scan.
  const fromCalls =
    body.match(/\.from\(directBookingFinanceLinks\)/g) ?? [];
  assert.strictEqual(
    fromCalls.length,
    1,
    `Expected exactly 1 .from(directBookingFinanceLinks), found ${fromCalls.length}`,
  );
  // SUM aggregate.
  assert.match(body, /SUM\(.*balanceDueMinor.*\)\s*FILTER/i);
  // No JS reduce loop on balances.
  assert.doesNotMatch(
    body,
    /for\s*\(\s*const\s+r\s+of\s+balances\s*\)/,
    "JS reduce over finance-link balances should be eliminated",
  );
});

// ============================================================================
// getPricingHubMetrics — 6 → 3 queries; villa-missing + stop-sell pushed to SQL
// ============================================================================

test("9.I: getPricingHubMetrics uses NOT EXISTS for villas-missing-rule-set", () => {
  const body = bodyOf(
    read("src/features/dynamic-pricing/services.ts"),
    "getPricingHubMetrics",
  );
  // The new SQL: NOT EXISTS over villas + active rule-sets.
  assert.match(body, /NOT EXISTS/);
  assert.match(body, /pricingRuleSets/);
  // The legacy "fetch ALL villas + ALL active rule-sets, then JS Array.some"
  // pattern is gone.
  assert.doesNotMatch(
    body,
    /allVillas\.filter|ruleSetVillas\.some/,
    "Legacy villa filter pattern should be eliminated",
  );
});

test("9.I: getPricingHubMetrics computes stopSellNights via SQL SUM (not JS reduce)", () => {
  const body = bodyOf(
    read("src/features/dynamic-pricing/services.ts"),
    "getPricingHubMetrics",
  );
  // The new SQL: SUM of (endsOn - startsOn + 1) days.
  assert.match(body, /SUM\(/);
  assert.match(body, /pricingStopSellRules/);
  // The legacy "stopSell.reduce" pattern is gone.
  assert.doesNotMatch(
    body,
    /stopSell\.reduce/,
    "JS .reduce() over stop-sell rules should be eliminated",
  );
});

test("9.I: getPricingHubMetrics fires at most 3 round-trips", () => {
  const body = bodyOf(
    read("src/features/dynamic-pricing/services.ts"),
    "getPricingHubMetrics",
  );
  // Count `db.select(` and `db.execute(` calls — each is one round-trip.
  // The legacy version had 6; the new version has 3.
  const selectCalls = body.match(/\bdb\.select\(/g) ?? [];
  const executeCalls = body.match(/\bdb\.execute\(/g) ?? [];
  const total = selectCalls.length + executeCalls.length;
  assert.ok(
    total <= 3,
    `Expected ≤3 db.select/execute calls, found ${total} (legacy was 6)`,
  );
});

// ============================================================================
// Closure
// ============================================================================

test("Phase 9.I: no new migrations (pure function-rewrite)", () => {
  const fs = require("fs") as typeof import("fs");
  assert.ok(
    !fs.existsSync(
      resolve(ROOT, "drizzle/0091_development_os_stage_9_i.sql"),
    ),
    "Phase 9.I is query-shape-only; no schema change",
  );
});
