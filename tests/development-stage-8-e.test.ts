/**
 * Stage 8.E — Observability + cold-start mitigation acceptance tests.
 *
 * Items covered:
 *   8.E.1 — warm-up cron route + job key registered + checklist row
 *   8.E.2 — `trace()` perf helper + wired into the slowest hub pages
 *   8.E.3 — @vercel/analytics installed + mounted in root layout
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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
function exists(rel: string): boolean {
  return existsSync(resolve(ROOT, rel));
}

// ===========================================================================
// 8.E.1 — warm-up cron
// ===========================================================================

test("8.E.1: /api/cron/warm-routes route file exists + uses handleCronJobRequest", () => {
  const path = "src/app/api/cron/warm-routes/route.ts";
  assert.ok(exists(path));
  const src = read(path);
  assert.match(src, /handleCronJobRequest\(request,\s*"warm_routes"\)/);
  // Both verbs supported (Vercel cron uses GET; manual triggers can POST).
  assert.match(src, /export async function GET\b/);
  assert.match(src, /export async function POST\b/);
});

test("8.E.1: warm_routes is in KNOWN_JOBS + JobKey union + dispatch table", () => {
  const src = read("src/features/jobs/actions.ts");
  // KNOWN_JOBS Set membership.
  assert.match(src, /KNOWN_JOBS\s*=\s*new\s+Set\(\[[\s\S]*?"warm_routes"[\s\S]*?\]\)/);
  // JobKey union.
  assert.match(src, /\|\s*"warm_routes"/);
  // Dispatch case routes to runWarmRoutesJob.
  assert.match(src, /case "warm_routes":\s*\n\s*return runWarmRoutesJob\(handle\)/);
});

test("8.E.1: runWarmRoutesJob job runner shipped", () => {
  const path = "src/features/jobs/warm-routes-job.ts";
  assert.ok(exists(path));
  const src = read(path);
  assert.match(src, /export\s+async\s+function\s+runWarmRoutesJob\b/);
  // Uses HEAD requests + tolerates per-route failures.
  assert.match(src, /method:\s*"HEAD"/);
  assert.match(src, /Promise\.allSettled/);
  // Has a sane abort signal so a slow route doesn't hang the warm-up itself.
  assert.match(src, /AbortSignal\.timeout/);
  // Exported route list for testing + audit.
  assert.match(src, /export const WARM_ROUTES/);
});

test("8.E.1: WARM_ROUTES list covers high-traffic routes", () => {
  const src = read("src/features/jobs/warm-routes-job.ts");
  // Sample expected routes — public landing, dashboards, hub pages.
  for (const route of [
    "/",
    "/dashboard",
    "/development-os",
    "/dashboard/system/health",
    "/dashboard/front-office/arrivals",
  ]) {
    assert.ok(
      src.includes(`"${route}"`),
      `WARM_ROUTES should include ${route}`,
    );
  }
});

test("8.E.1: VERCEL-CRON-CHECKLIST has a row for /api/cron/warm-routes", () => {
  const src = read("docs/VERCEL-CRON-CHECKLIST.md");
  assert.match(
    src,
    /\| `\/api\/cron\/warm-routes` \| `warm_routes` \|/,
    "checklist must list the new cron route",
  );
  // Schedule documented as every 10 min.
  assert.ok(src.includes("*/10 * * * *"), "schedule should be every 10 min");
});

// ===========================================================================
// 8.E.2 — perf trace helper
// ===========================================================================

test("8.E.2: trace() helper shipped at @/lib/observability/perf", () => {
  const path = "src/lib/observability/perf.ts";
  assert.ok(exists(path));
  const src = read(path);
  assert.match(src, /export\s+async\s+function\s+trace</);
  // Signature includes page + q labels for log filtering.
  assert.match(src, /\[perf\] page=/);
});

test("8.E.2: trace() wired into /dashboard/direct-bookings", () => {
  const src = read(
    "src/app/(dashboard)/dashboard/direct-bookings/page.tsx",
  );
  assert.match(src, /from\s+["']@\/lib\/observability\/perf["']/);
  assert.match(src, /trace\([^,]+,\s*"getDirectBookingMetrics"/);
  assert.match(src, /trace\([^,]+,\s*"getDepositMetrics"/);
  assert.match(src, /trace\([^,]+,\s*"getReconciliationMetrics"/);
});

test("8.E.2: trace() wired into /dashboard/pricing", () => {
  const src = read("src/app/(dashboard)/dashboard/pricing/page.tsx");
  assert.match(src, /from\s+["']@\/lib\/observability\/perf["']/);
  assert.match(src, /trace\([^,]+,\s*"getPricingHubMetrics"/);
});

// ===========================================================================
// 8.E.3 — Vercel Analytics
// ===========================================================================

test("8.E.3: @vercel/analytics is a runtime dependency", () => {
  const pkg = JSON.parse(read("package.json")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const all = { ...pkg.dependencies, ...pkg.devDependencies };
  assert.ok(
    "@vercel/analytics" in all,
    "@vercel/analytics must be in package.json",
  );
});

test("8.E.3: <Analytics /> mounted in root layout", () => {
  const src = read("src/app/layout.tsx");
  assert.match(src, /from\s+["']@vercel\/analytics\/next["']/);
  assert.match(src, /<Analytics\s*\/>/);
});

// ===========================================================================
// Phase 8.E closure
// ===========================================================================

test("Phase 8.E: no new migrations", () => {
  assert.ok(
    !exists("drizzle/0087_development_os_stage_8_e.sql"),
    "Phase 8.E is observability-only — no migration expected",
  );
});
