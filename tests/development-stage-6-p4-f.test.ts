/**
 * Stage 6.P4.F — Attribution engine + cron + webhook routes + UI tests.
 *
 * Pure-helper invariants for the attribution models + file-presence
 * for the cron + webhook route + UI plumbing (real-functionality
 * coverage of those layers comes via the existing dispatcher /
 * cron-handler tests).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  computeAttributionWeights,
  firstTouchAttribution,
  lastTouchAttribution,
  linearAttribution,
  timeDecayAttribution,
  positionBasedAttribution,
} from "../src/lib/marketing/attribution/models";
import type { AttributionTouchpointRecord } from "../src/lib/marketing/types";

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

function tp(daysAgo: number, channel = "paid_search" as const): AttributionTouchpointRecord {
  const t = new Date();
  t.setUTCDate(t.getUTCDate() - daysAgo);
  return {
    touchpointAt: t,
    channel,
  };
}

// ===========================================================================
// 1) Attribution model functions (pure)
// ===========================================================================

test("firstTouchAttribution: 100% to earliest, 0 to rest", () => {
  const tps = [tp(7), tp(3), tp(0)];
  assert.deepEqual(firstTouchAttribution(tps), [1, 0, 0]);
});

test("lastTouchAttribution: 100% to latest, 0 to rest", () => {
  const tps = [tp(7), tp(3), tp(0)];
  assert.deepEqual(lastTouchAttribution(tps), [0, 0, 1]);
});

test("linearAttribution: 1/n equally", () => {
  const tps = [tp(7), tp(3), tp(0)];
  const w = linearAttribution(tps);
  for (const x of w) assert.ok(Math.abs(x - 1 / 3) < 1e-9);
  assert.ok(Math.abs(w.reduce((a, b) => a + b, 0) - 1) < 1e-9);
});

test("timeDecayAttribution: weights sum to 1.0", () => {
  const tps = [tp(14), tp(7), tp(3), tp(0)];
  const w = timeDecayAttribution(tps, 7);
  const sum = w.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
});

test("timeDecayAttribution: most-recent has highest weight", () => {
  const tps = [tp(14), tp(7), tp(3), tp(0)];
  const w = timeDecayAttribution(tps, 7);
  assert.ok(w[3] > w[2]);
  assert.ok(w[2] > w[1]);
  assert.ok(w[1] > w[0]);
});

test("timeDecayAttribution: single touchpoint → 100%", () => {
  const w = timeDecayAttribution([tp(0)], 7);
  assert.deepEqual(w, [1]);
});

test("positionBasedAttribution: U-shape — first + last get 0.4, middle splits 0.2", () => {
  const tps = [tp(10), tp(7), tp(5), tp(3), tp(0)];
  const w = positionBasedAttribution(tps, [0.4, 0.2, 0.4]);
  assert.equal(w.length, 5);
  assert.ok(Math.abs(w[0] - 0.4) < 1e-9);
  assert.ok(Math.abs(w[w.length - 1] - 0.4) < 1e-9);
  // middle three split 0.2 evenly: each ≈ 0.0667
  for (let i = 1; i < w.length - 1; i++) {
    assert.ok(Math.abs(w[i] - 0.2 / 3) < 1e-9);
  }
  assert.ok(Math.abs(w.reduce((a, b) => a + b, 0) - 1) < 1e-9);
});

test("positionBasedAttribution: 2 touchpoints → middle ratio splits 50/50 between first+last", () => {
  const tps = [tp(7), tp(0)];
  const w = positionBasedAttribution(tps, [0.4, 0.2, 0.4]);
  assert.ok(Math.abs(w[0] - 0.5) < 1e-9);
  assert.ok(Math.abs(w[1] - 0.5) < 1e-9);
});

test("positionBasedAttribution: single touchpoint → 100%", () => {
  assert.deepEqual(positionBasedAttribution([tp(0)], [0.4, 0.2, 0.4]), [1]);
});

test("computeAttributionWeights: empty input → empty output", () => {
  for (const m of [
    "first_touch",
    "last_touch",
    "linear",
    "time_decay",
    "position_based",
  ] as const) {
    assert.deepEqual(computeAttributionWeights([], m), []);
  }
});

test("computeAttributionWeights: every model sums to 1.0 for n=4", () => {
  const tps = [tp(10), tp(7), tp(3), tp(0)];
  for (const m of [
    "first_touch",
    "last_touch",
    "linear",
    "time_decay",
    "position_based",
  ] as const) {
    const w = computeAttributionWeights(tps, m);
    const sum = w.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9, `${m} weights must sum to 1`);
  }
});

// ===========================================================================
// 2) Cron jobs file presence + dispatcher wiring
// ===========================================================================

test("cron jobs: 4 P4.F runner files exist", () => {
  for (const f of [
    "marketing-campaigns-sync-job.ts",
    "marketing-metrics-sync-job.ts",
    "attribution-engine-job.ts",
    "utm-touchpoint-cleanup-job.ts",
  ]) {
    assert.ok(fileExists(`src/lib/development/server/cron/${f}`), `${f} must exist`);
  }
});

test("cron index: exports all 4 P4.F runners", () => {
  const src = readFile("src/lib/development/server/cron/index.ts");
  for (const fn of [
    "runMarketingCampaignsSync",
    "runMarketingMetricsSync",
    "runAttributionEngine",
    "runUtmTouchpointCleanup",
  ]) {
    assert.match(src, new RegExp(`export\\s*\\{\\s*${fn}\\s*\\}\\s*from`));
  }
});

test("dispatcher: 4 P4.F keys wired in KNOWN_JOBS + executeJob", () => {
  const src = readFile("src/features/jobs/actions.ts");
  for (const key of [
    "marketing_campaigns_sync",
    "marketing_metrics_sync",
    "attribution_engine",
    "utm_touchpoint_cleanup",
  ]) {
    assert.match(src, new RegExp(`"${key}"`));
    assert.match(src, new RegExp(`case\\s+"${key}":`));
  }
});

test("cron routes: 4 P4.F route files exist + delegate", () => {
  for (const r of [
    "marketing-campaigns-sync",
    "marketing-metrics-sync",
    "attribution-engine",
    "utm-touchpoint-cleanup",
  ]) {
    const path = `src/app/api/cron/${r}/route.ts`;
    assert.ok(fileExists(path));
    assert.match(readFile(path), /handleCronJobRequest/);
  }
});

test("VERCEL-CRON-CHECKLIST: 4 P4.F entries listed + crons block updated", () => {
  const src = readFile("docs/VERCEL-CRON-CHECKLIST.md");
  for (const r of [
    "/api/cron/marketing-campaigns-sync",
    "/api/cron/marketing-metrics-sync",
    "/api/cron/attribution-engine",
    "/api/cron/utm-touchpoint-cleanup",
  ]) {
    assert.ok(src.includes(r), `${r} must appear in checklist`);
  }
});

// ===========================================================================
// 3) Webhook routes
// ===========================================================================

test("webhook routes: 2 P4.F route files exist", () => {
  for (const path of [
    "src/app/api/webhooks/marketing/meta-pixel/route.ts",
    "src/app/api/webhooks/marketing/ga4/route.ts",
  ]) {
    assert.ok(fileExists(path));
  }
});

test("webhook routes: meta-pixel has Meta verify-token GET handshake", () => {
  const src = readFile("src/app/api/webhooks/marketing/meta-pixel/route.ts");
  assert.match(src, /hub\.verify_token/);
  assert.match(src, /hub\.challenge/);
  assert.match(src, /META_PIXEL_WEBHOOK_VERIFY_TOKEN/);
});

// ===========================================================================
// 4) UI pages
// ===========================================================================

test("UI: 3 P4.F pages exist (attribution / conversions / connections)", () => {
  for (const slug of ["attribution", "conversions", "connections"]) {
    const path = `src/app/(development-app)/development-os/marketing/${slug}/page.tsx`;
    assert.ok(fileExists(path), `${path} must exist`);
  }
});

test("UI: attribution page reads conversions via queries module", () => {
  const src = readFile(
    "src/app/(development-app)/development-os/marketing/attribution/page.tsx",
  );
  assert.match(src, /listConversionsForUi/);
});

test("UI: conversions page surfaces touchpoints + conversion-type breakdown", () => {
  const src = readFile(
    "src/app/(development-app)/development-os/marketing/conversions/page.tsx",
  );
  assert.match(src, /listConversionsForUi/);
  assert.match(src, /listRecentTouchpointsForUi/);
});

test("UI: connections page reads from listConnectionsForUi", () => {
  const src = readFile(
    "src/app/(development-app)/development-os/marketing/connections/page.tsx",
  );
  assert.match(src, /listConnectionsForUi/);
});

// ===========================================================================
// 5) Service layer surface
// ===========================================================================

test("MarketingService: exports the load-bearing functions", () => {
  const src = readFile("src/lib/marketing/service.ts");
  for (const fn of [
    "syncCampaignsForConnection",
    "syncMetricsForConnection",
    "listActiveConnectionsForCron",
    "ingestTouchpoint",
    "recordConversion",
    "runAttributionForOrg",
    "archiveOldTouchpoints",
    "getMarketingDashboardMetrics",
  ]) {
    assert.match(src, new RegExp(`export async function ${fn}\\b`));
  }
});

test("MarketingService: opens with \"use server\" directive", () => {
  const src = readFile("src/lib/marketing/service.ts");
  assert.match(src, /^"use server";/);
});

// ===========================================================================
// 6) Architecture doc bookkeeping
// ===========================================================================

test("architecture doc: Stage 6.P4 marker present", () => {
  const src = readFile("docs/development-os-architecture.md");
  assert.match(src, /Stage 6\.P4 — Marketing \+ Analytics/);
});
