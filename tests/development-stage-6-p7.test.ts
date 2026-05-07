/**
 * Stage 6.P7 — Investor Portal Enhancement tests.
 *
 * Pure-helper invariants for the distribution forecast computation
 * + file-presence for the new portal page + nav link.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  computeDistributionForecast,
  type CompletedDistribution,
} from "../src/lib/investor-portal/forecasts";

const HERE =
  typeof __dirname !== "undefined"
    ? __dirname
    : dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

function readFile(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8");
}
function fileExists(rel: string): boolean {
  return existsSync(resolve(ROOT, rel));
}

function dist(date: string, minor: bigint): CompletedDistribution {
  return { effectiveDate: new Date(date), investorShareMinor: minor };
}

// ===========================================================================
// 1) Forecast computation — pure
// ===========================================================================

test("forecast: returns low_confidence with 0 completed distributions", () => {
  const r = computeDistributionForecast({ completedDistributions: [] });
  assert.equal(r.basisCount, 0);
  assert.equal(r.totalProjectedMinor, 0n);
  for (const q of r.quarters) {
    assert.equal(q.confidence, "low_confidence");
    assert.equal(q.projectedAmountMinor, 0n);
  }
});

test("forecast: returns low_confidence with 1 completed distribution", () => {
  const r = computeDistributionForecast({
    completedDistributions: [dist("2026-01-01", 100_00n)],
  });
  for (const q of r.quarters) {
    assert.equal(q.confidence, "low_confidence");
    assert.equal(q.projectedAmountMinor, 0n);
  }
});

test("forecast: rolling_average with 2-3 completed distributions", () => {
  const r = computeDistributionForecast({
    completedDistributions: [
      dist("2026-01-01", 100_00n),
      dist("2026-04-01", 200_00n),
    ],
  });
  for (const q of r.quarters) {
    assert.equal(q.confidence, "rolling_average");
    assert.equal(q.projectedAmountMinor, 150_00n);
  }
  // Total = 4 quarters × 150_00 = 600_00.
  assert.equal(r.totalProjectedMinor, 600_00n);
});

test("forecast: trimmed_average with 4+ distributions drops min/max", () => {
  // Values: 100, 200, 300, 1000. Trim drops 100 + 1000 → average of 200, 300 = 250.
  const r = computeDistributionForecast({
    completedDistributions: [
      dist("2025-01-01", 100_00n),
      dist("2025-04-01", 200_00n),
      dist("2025-07-01", 300_00n),
      dist("2025-10-01", 1_000_00n),
    ],
  });
  assert.equal(r.basisCount, 2);
  for (const q of r.quarters) {
    assert.equal(q.confidence, "trimmed_average");
    assert.equal(q.projectedAmountMinor, 250_00n);
  }
});

test("forecast: trim disabled keeps all values", () => {
  const r = computeDistributionForecast({
    completedDistributions: [
      dist("2025-01-01", 100_00n),
      dist("2025-04-01", 200_00n),
      dist("2025-07-01", 300_00n),
      dist("2025-10-01", 400_00n),
    ],
    trimOutliers: false,
  });
  // Average of all 4 = 250.
  assert.equal(r.basisCount, 4);
  for (const q of r.quarters) {
    assert.equal(q.confidence, "rolling_average");
    assert.equal(q.projectedAmountMinor, 250_00n);
  }
});

test("forecast: horizon respects horizonQuarters input", () => {
  const r = computeDistributionForecast({
    completedDistributions: [
      dist("2026-01-01", 100_00n),
      dist("2026-04-01", 200_00n),
    ],
    horizonQuarters: 8,
  });
  assert.equal(r.quarters.length, 8);
});

test("forecast: quarters monotonically advance + roll year boundary", () => {
  const r = computeDistributionForecast({
    completedDistributions: [
      dist("2026-01-01", 100_00n),
      dist("2026-04-01", 200_00n),
    ],
    asOf: new Date(Date.UTC(2026, 11, 15)), // Dec 2026
    horizonQuarters: 5,
  });
  // After Q4 2026 → Q1, Q2, Q3, Q4 2027, then Q1 2028.
  assert.equal(r.quarters[0].quarter, 1);
  assert.equal(r.quarters[0].year, 2027);
  assert.equal(r.quarters[3].quarter, 4);
  assert.equal(r.quarters[3].year, 2027);
  assert.equal(r.quarters[4].quarter, 1);
  assert.equal(r.quarters[4].year, 2028);
});

// ===========================================================================
// 2) File presence
// ===========================================================================

test("P7: forecasts module exists", () => {
  assert.ok(fileExists("src/lib/investor-portal/forecasts.ts"));
});

test("P7: investor-portal forecasts page exists", () => {
  assert.ok(
    fileExists(
      "src/app/(investor-portal)/investor-portal/forecasts/page.tsx",
    ),
  );
});

test("P7: forecasts page reads via getMyForecast", () => {
  const src = readFile(
    "src/app/(investor-portal)/investor-portal/forecasts/page.tsx",
  );
  assert.match(src, /getMyForecast/);
});

test("P7: queries.ts exports getMyForecast", () => {
  const src = readFile("src/lib/investor-portal/queries.ts");
  assert.match(src, /export\s+async\s+function\s+getMyForecast/);
});

test("P7: portal shell wires forecasts nav link", () => {
  const src = readFile("src/components/investor-portal/portal-shell.tsx");
  assert.match(src, /\/investor-portal\/forecasts/);
  assert.match(src, /TrendingUp/);
});

// ===========================================================================
// 3) Architecture doc
// ===========================================================================

test("architecture doc: Stage 6.P7 marker present", () => {
  const src = readFile("docs/development-os-architecture.md");
  assert.match(src, /Stage 6\.P7/);
});
