#!/usr/bin/env node
/**
 * CI-FULL-SUITE-1 — run the whole unit suite with a shrink-only stale baseline.
 *
 * Why this exists
 * ---------------
 * The repo accreted ~236 per-prompt acceptance test files during the build
 * marathon. Most are healthy and pass (~200 files / ~6100 tests), but a tail
 * of stage-era files assert page SHAPES that later redesigns legitimately
 * replaced (design-system port, cabinet rebuilds, PR #290 deletions) — they
 * fail against today's code without indicating a defect. CI previously ran
 * only 2 money test files, so the ~6100 healthy assertions provided zero
 * regression protection.
 *
 * This runner makes the full suite a CI gate NOW, without first rehabilitating
 * the stale tail:
 *   · every tests/*.test.ts EXCEPT the baseline runs and must pass;
 *   · `tests/ci-stale-baseline.json` quarantines the known-stale files;
 *   · the baseline is SHRINK-ONLY (mirrors scripts/tenancy-guard.mjs): if a
 *     baselined file now passes, we warn so it gets un-quarantined; if a
 *     baselined file no longer exists, we warn to prune the entry. New test
 *     files are NEVER auto-quarantined — they must pass from day one.
 *
 * Usage: node scripts/run-unit-tests.mjs   (CI + local; exit 1 on any failure)
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { spawnSync, spawn } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const TESTS_DIR = path.join(ROOT, "tests");
const BASELINE_PATH = path.join(TESTS_DIR, "ci-stale-baseline.json");

const baseline = new Set(
  JSON.parse(readFileSync(BASELINE_PATH, "utf8")).staleFiles,
);

const allFiles = readdirSync(TESTS_DIR)
  .filter((f) => f.endsWith(".test.ts"))
  .map((f) => `tests/${f}`)
  .sort();

const staleMissing = [...baseline].filter(
  (f) => !existsSync(path.join(ROOT, f)),
);
const toRun = allFiles.filter((f) => !baseline.has(f));

console.log(
  `CI unit suite: ${toRun.length} files to run, ${baseline.size} quarantined (tests/ci-stale-baseline.json).`,
);

// Run the whole non-quarantined set in ONE tsx process (fast: single startup,
// matches `npm test` semantics).
const run = spawnSync("npx", ["tsx", "--test", ...toRun], {
  cwd: ROOT,
  stdio: "inherit",
  env: process.env,
});

let failed = run.status !== 0;

// Shrink-only ratchet bookkeeping (non-fatal warnings).
if (staleMissing.length > 0) {
  console.warn(
    `\n⚠️  ${staleMissing.length} baselined file(s) no longer exist — prune from tests/ci-stale-baseline.json:`,
  );
  for (const f of staleMissing) console.warn(`   • ${f}`);
}

// Check whether any quarantined file has healed (passes now) — encourage
// shrinking the baseline. Probes run concurrently (pool of 8) so the
// bookkeeping stays cheap in CI; failures here are EXPECTED and ignored.
function probeFile(f) {
  return new Promise((resolve) => {
    const child = spawn("npx", ["tsx", "--test", f], {
      cwd: ROOT,
      stdio: "ignore",
      env: process.env,
    });
    child.on("close", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });
}
const probeTargets = [...baseline].filter((f) => existsSync(path.join(ROOT, f)));
const healed = [];
const POOL = 8;
for (let i = 0; i < probeTargets.length; i += POOL) {
  const batch = probeTargets.slice(i, i + POOL);
  const results = await Promise.all(batch.map(probeFile));
  results.forEach((ok, j) => {
    if (ok) healed.push(batch[j]);
  });
}
if (healed.length > 0) {
  console.warn(
    `\n⚠️  ${healed.length} quarantined file(s) now PASS and can be removed from tests/ci-stale-baseline.json (shrink the baseline):`,
  );
  for (const f of healed) console.warn(`   • ${f}`);
}

if (failed) {
  console.error("\n❌ Unit suite failed (non-quarantined test failure).");
  process.exit(1);
}
console.log(
  `\n✅ Unit suite passed — ${toRun.length} files green (baseline: ${baseline.size} stale, shrink-only).`,
);
