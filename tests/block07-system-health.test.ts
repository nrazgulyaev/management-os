/**
 * BLOCK-07 SYSTEM-HEALTH — verifies + EXTENDS the observability-spine
 * guarantees the platform System Health surface depends on:
 *
 *   1. /api/cron/health returns 503 when the DB is DOWN (execute rejects).
 *   2. The same probe returns 200 (healthy) in demo mode (no DB to be down).
 *   3. A job stuck `running` past the stale threshold flips the probe to 503.
 *   4. A job NEVER reports `success` when the DB is down — withJobRun finishes
 *      the run as `failed` and re-throws when the work throws (which is what a
 *      DB-down work body does). Asserted from source so the invariant can't
 *      silently regress.
 *   5. The platform job-control panel is HONEST: pauseWorkers is hard-false
 *      (no runner primitive) and the page only renders a wired action behind
 *      the matching permission.
 *
 * Pure-logic + source-assertion style (matches the rest of tests/*.test.ts):
 * no live DB — `evaluateHealth` takes a db override seam so we can inject an
 * `execute`-rejects stub to mimic an unreachable Postgres.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

// The health/platform-health modules open with `import "server-only"`, which
// throws under the (non-RSC) node test runner. Neutralise it by pre-seeding
// the CJS require cache with a no-op `server-only` BEFORE any dynamic import
// below pulls those modules in. This is a test-only shim — production builds
// keep the real server-only guard.
const requireFromHere = createRequire(import.meta.url);
try {
  const serverOnlyPath = requireFromHere.resolve("server-only");
  requireFromHere.cache[serverOnlyPath] = {
    id: serverOnlyPath,
    filename: serverOnlyPath,
    loaded: true,
    exports: {},
  } as unknown as NodeModule;
} catch {
  // server-only not resolvable in this environment — nothing to stub.
}

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");

// A db stub whose `execute` rejects — i.e. Postgres is unreachable.
function dbDownStub() {
  return {
    execute: async () => {
      throw new Error("ECONNREFUSED: database unreachable");
    },
  } as unknown as import("../src/lib/db/client").DB;
}

// A db stub where `SELECT 1` succeeds but a job is stuck running.
function dbWithStuckJobStub() {
  const thenable = (rows: unknown[]) => {
    const chain = {
      from: () => chain,
      where: () => Promise.resolve(rows),
    };
    return chain;
  };
  return {
    execute: async () => [{ ok: 1 }],
    select: () => thenable([{ c: 3 }]),
  } as unknown as import("../src/lib/db/client").DB;
}

// A db stub where everything is healthy: SELECT 1 ok, 0 stale jobs.
function dbHealthyStub() {
  const thenable = (rows: unknown[]) => {
    const chain = {
      from: () => chain,
      where: () => Promise.resolve(rows),
    };
    return chain;
  };
  return {
    execute: async () => [{ ok: 1 }],
    select: () => thenable([{ c: 0 }]),
  } as unknown as import("../src/lib/db/client").DB;
}

// -----------------------------------------------------------------------------
// 1. DB-down ⇒ unhealthy ⇒ the route returns 503
// -----------------------------------------------------------------------------
test("evaluateHealth: DB unreachable ⇒ healthy=false (route ⇒ 503)", async () => {
  const { evaluateHealth } = await import("../src/features/system/health-check");
  const report = await evaluateHealth(dbDownStub());
  assert.equal(report.healthy, false, "DB-down must be unhealthy");
  assert.equal(report.checks.db.ok, false);
  assert.match(report.checks.db.detail ?? "", /unreachable|ECONNREFUSED/i);
  // Stale-job check is skipped (would just rethrow the connectivity error).
  assert.equal(report.checks.staleJobs.skipped, true);
});

// -----------------------------------------------------------------------------
// 2. No DB (demo) ⇒ healthy (nothing can be "down")
// -----------------------------------------------------------------------------
test("evaluateHealth: no DB (demo) ⇒ healthy=true, db skipped", async () => {
  const { evaluateHealth } = await import("../src/features/system/health-check");
  const report = await evaluateHealth(null);
  assert.equal(report.healthy, true);
  assert.equal(report.checks.db.skipped, true);
  assert.equal(report.checks.staleJobs.skipped, true);
});

// -----------------------------------------------------------------------------
// 3. Stuck running job ⇒ unhealthy ⇒ 503
// -----------------------------------------------------------------------------
test("evaluateHealth: a job stuck running past threshold ⇒ healthy=false", async () => {
  const { evaluateHealth } = await import("../src/features/system/health-check");
  const report = await evaluateHealth(dbWithStuckJobStub());
  assert.equal(report.checks.db.ok, true, "DB itself is reachable");
  assert.equal(report.checks.staleJobs.ok, false, "stuck job must fail the check");
  assert.equal(report.healthy, false);
  assert.match(report.checks.staleJobs.detail ?? "", /stuck running/);
});

// -----------------------------------------------------------------------------
// 4. Healthy DB, no stale jobs ⇒ healthy ⇒ 200
// -----------------------------------------------------------------------------
test("evaluateHealth: reachable DB + 0 stale jobs ⇒ healthy=true", async () => {
  const { evaluateHealth } = await import("../src/features/system/health-check");
  const report = await evaluateHealth(dbHealthyStub());
  assert.equal(report.checks.db.ok, true);
  assert.equal(report.checks.staleJobs.ok, true);
  assert.equal(report.healthy, true);
});

// -----------------------------------------------------------------------------
// 5. The route maps !healthy ⇒ 503 (source invariant)
// -----------------------------------------------------------------------------
test("cron/health route returns 503 when the report is unhealthy", () => {
  const src = readFileSync(
    join(repoRoot, "src/app/api/cron/health/route.ts"),
    "utf8",
  );
  // 503 on probe throw and on a breached threshold.
  assert.match(src, /status:\s*503/);
  assert.match(src, /report\.healthy\s*\?\s*200\s*:\s*503/);
});

// -----------------------------------------------------------------------------
// 6. A job NEVER reports success when the work throws (DB-down body throws)
// -----------------------------------------------------------------------------
test("withJobRun finishes a throwing run as 'failed' and re-throws", () => {
  const src = readFileSync(
    join(repoRoot, "src/features/jobs/runner.ts"),
    "utf8",
  );
  // The catch branch must finish as failed and re-throw — never success.
  assert.match(src, /catch\s*\(e\)/);
  assert.match(src, /status:\s*"failed"/);
  assert.match(src, /throw e;/);
  // And finishJobRun is a no-op when the DB is null (no stray success write).
  assert.match(src, /if\s*\(!db\s*\|\|\s*!handle\.id\)\s*return;/);
});

// -----------------------------------------------------------------------------
// 7. Job-control panel is honest: pauseWorkers can never be true
// -----------------------------------------------------------------------------
test("getJobHealthPanel: pauseWorkers capability is hard-false (no fake button)", async () => {
  const { getJobHealthPanel } = await import(
    "../src/features/system/platform-health"
  );
  // No DB in tests ⇒ demo branch, but capabilities are static.
  const panel = await getJobHealthPanel();
  assert.equal(panel.capabilities.pauseWorkers, false);
  assert.equal(panel.capabilities.dispatch, true);
  assert.equal(panel.capabilities.clearLocks, true);
  assert.equal(panel.dbConfigured, false);
  assert.equal(panel.deadLetterCount, 0);
});

// -----------------------------------------------------------------------------
// 8. The platform page only renders a wired action behind its permission
// -----------------------------------------------------------------------------
test("system-health page gates wired actions behind hasPermission", () => {
  const src = readFileSync(
    join(
      repoRoot,
      "src/app/(platform-app)/platform/system-health/page.tsx",
    ),
    "utf8",
  );
  assert.match(src, /hasPermission\(userCtx,\s*"jobs\.run"\)/);
  assert.match(src, /hasPermission\(userCtx,\s*"job_lock\.manage"\)/);
  // Buttons are conditional on the permission flags.
  assert.match(src, /canDispatch\s*\?/);
  assert.match(src, /canClearLocks\s*\?/);
  // The pause control is the honest read-only affordance.
  assert.match(src, /PauseWorkersControl/);
});

// -----------------------------------------------------------------------------
// 9. The honest pause control declares "not exposed" with a real reason
// -----------------------------------------------------------------------------
test("PauseWorkersControl is a disabled affordance with a real reason", () => {
  const src = readFileSync(
    join(repoRoot, "src/components/platform/job-control-panel.tsx"),
    "utf8",
  );
  assert.match(src, /not exposed/);
  assert.match(src, /disabled/);
  assert.match(src, /no worker pool to pause/i);
});
