/**
 * Prompt 113 — Preflight: run every static deployment check + the
 * standard quality gate.  Designed to run in CI before promoting a
 * build to staging / production.
 *
 * Usage:
 *   npm run preflight:deploy
 *
 * What it runs (in order):
 *   1. check:env
 *   2. check:storage
 *   3. check:cron
 *   4. check:cron-auth
 *   5. check:migrations
 *   6. smoke:routes
 *   7. typecheck
 *   8. lint
 *   9. test
 *  10. build
 *
 * The script does NOT require a live DB connection.  `demo:validate`
 * is intentionally skipped here — it is wired separately and only
 * runs when DATABASE_URL is set.  Each step's stdout is streamed
 * so CI logs stay readable.
 */

import { spawnSync } from "node:child_process";

interface Step {
  label: string;
  cmd: string;
  args: string[];
  /** Continue on failure when running in CI without env (e.g. demo:validate). */
  warnOnly?: boolean;
}

const steps: Step[] = [
  {
    label: "Env readiness",
    cmd: "node",
    args: ["--import", "tsx", "scripts/check-env.ts"],
  },
  {
    label: "Storage configuration",
    cmd: "node",
    args: ["--import", "tsx", "scripts/check-storage-config.ts"],
  },
  {
    label: "Cron configuration",
    cmd: "node",
    args: ["--import", "tsx", "scripts/check-cron-config.ts"],
  },
  {
    label: "Cron auth",
    cmd: "node",
    args: ["--import", "tsx", "scripts/check-cron-auth.ts"],
  },
  {
    label: "Migrations",
    cmd: "node",
    args: ["--import", "tsx", "scripts/check-migrations.ts"],
  },
  {
    label: "Route inventory",
    cmd: "node",
    args: ["--import", "tsx", "scripts/smoke-routes.ts"],
  },
  { label: "Typecheck", cmd: "npm", args: ["run", "typecheck"] },
  { label: "Lint", cmd: "npm", args: ["run", "lint"] },
  { label: "Tests", cmd: "npm", args: ["run", "test"] },
  { label: "Build", cmd: "npm", args: ["run", "build"] },
];

let failed = 0;
const summary: Array<{ label: string; ok: boolean; durationMs: number }> = [];

for (const step of steps) {
  const start = Date.now();
  console.log(`\n▶ ${step.label}`);
  console.log(`  $ ${step.cmd} ${step.args.join(" ")}`);
  const r = spawnSync(step.cmd, step.args, { stdio: "inherit", env: process.env });
  const durationMs = Date.now() - start;
  const ok = r.status === 0;
  summary.push({ label: step.label, ok, durationMs });
  if (!ok) {
    if (step.warnOnly) {
      console.warn(`  ! ${step.label} failed but is warn-only.`);
    } else {
      failed += 1;
    }
  }
}

console.log("\n========================================");
console.log("Preflight summary");
console.log("========================================");
for (const s of summary) {
  console.log(
    `  ${s.ok ? "✓" : "✗"} ${s.label.padEnd(30)} ${s.durationMs}ms`,
  );
}
console.log(`\nOverall: ${failed === 0 ? "OK" : "FAILED"} (${failed} step(s) failed)`);
process.exit(failed === 0 ? 0 : 1);

export {};
