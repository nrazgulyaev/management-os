/**
 * Prompt 114 — Staging Readiness Report.
 *
 * Aggregates every static check + the env validator + the production
 * gates + a route inventory summary into one Markdown document at
 * `tmp/staging-readiness-report.md`.  Designed for an operator to
 * download, attach to a launch ticket, and share with QA.
 *
 * No live DB or HTTP required.  Run with the staging env loaded so
 * the env validator and production gates evaluate against the values
 * you intend to ship.
 *
 * Usage:
 *   npm run staging:report
 *   npm run staging:report -- --mode=production
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { validateEnv, type EnvMode } from "../src/lib/env/validation";
import { getProductionGateReport } from "../src/lib/deployment/production-gates";
import {
  discoverRoutes,
  summariseByAudience,
} from "../src/features/smoke-tests/route-inventory";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");

const argMode = process.argv.find((a) => a.startsWith("--mode="));
const mode: EnvMode = (argMode?.split("=")[1] as EnvMode) ?? inferDefaultMode();

function inferDefaultMode(): EnvMode {
  const node = process.env.NODE_ENV;
  if (node === "production") return "production";
  if (process.env.VERCEL_ENV === "preview") return "staging";
  return "development";
}

interface CheckOutcome {
  label: string;
  command: string;
  ok: boolean;
  output: string;
}

function runCheck(label: string, command: string[]): CheckOutcome {
  const r = spawnSync(command[0], command.slice(1), {
    cwd: repoRoot,
    encoding: "utf-8",
    env: process.env,
  });
  const output = (r.stdout ?? "") + (r.stderr ? `\n[stderr]\n${r.stderr}` : "");
  return {
    label,
    command: command.join(" "),
    ok: r.status === 0,
    output: output.trim(),
  };
}

const lines: string[] = [];
lines.push(`# Staging Readiness Report`);
lines.push("");
lines.push(`- **Generated:** ${new Date().toISOString()}`);
lines.push(`- **Mode:** \`${mode}\``);
lines.push(`- **Repo:** \`${repoRoot}\``);
lines.push("");

// 1. Env readiness.
const envReport = validateEnv(mode);
lines.push(`## 1. Environment readiness`);
lines.push("");
lines.push(
  `- ok: **${envReport.okCount}**, warning: **${envReport.warningCount}**, fatal: **${envReport.fatalCount}**`,
);
const fatals = envReport.items.filter((i) => i.status === "fatal");
const warnings = envReport.items.filter((i) => i.status === "warning");
if (fatals.length > 0) {
  lines.push("");
  lines.push(`### Fatal (${fatals.length})`);
  for (const f of fatals) {
    lines.push(`- \`${f.key}\` — ${f.message}`);
  }
}
if (warnings.length > 0) {
  lines.push("");
  lines.push(`### Warnings (${warnings.length})`);
  for (const w of warnings) {
    lines.push(`- \`${w.key}\` — ${w.message}`);
  }
}
lines.push("");

// 2. Production gates.
const gates = getProductionGateReport(mode);
lines.push(`## 2. Production gates`);
lines.push("");
lines.push(`- overall: ${gates.ok ? "OK" : "FAILED"}`);
lines.push("");
lines.push(`| Gate | Severity | Result |`);
lines.push(`|---|---|---|`);
for (const r of gates.results) {
  lines.push(
    `| \`${r.key}\` | ${r.severity} | ${r.ok ? "OK" : "✗"} — ${r.message} |`,
  );
}
lines.push("");

// 3. Route inventory.
const routes = discoverRoutes(join(repoRoot, "src/app"));
const breakdown = summariseByAudience(routes);
lines.push(`## 3. Route inventory`);
lines.push("");
lines.push(`- Total routes: **${routes.length}**`);
lines.push("");
lines.push(`| Audience | Count |`);
lines.push(`|---|---|`);
for (const b of breakdown) lines.push(`| \`${b.audience}\` | ${b.count} |`);
lines.push("");

// 4. Static checks.
const checks: CheckOutcome[] = [
  runCheck("env", ["node", "--import", "tsx", "scripts/check-env.ts"]),
  runCheck("storage", ["node", "--import", "tsx", "scripts/check-storage-config.ts"]),
  runCheck("cron-config", ["node", "--import", "tsx", "scripts/check-cron-config.ts"]),
  runCheck("cron-auth", ["node", "--import", "tsx", "scripts/check-cron-auth.ts"]),
  runCheck("migrations", ["node", "--import", "tsx", "scripts/check-migrations.ts"]),
  runCheck("routes", ["node", "--import", "tsx", "scripts/smoke-routes.ts"]),
];
const failedChecks = checks.filter((c) => !c.ok);

lines.push(`## 4. Static checks`);
lines.push("");
lines.push(`- Passed: **${checks.length - failedChecks.length}/${checks.length}**`);
lines.push("");
lines.push(`| Check | Status |`);
lines.push(`|---|---|`);
for (const c of checks) {
  lines.push(`| \`${c.label}\` | ${c.ok ? "OK" : "✗ FAILED"} |`);
}
if (failedChecks.length > 0) {
  lines.push("");
  lines.push(`### Failed check output`);
  for (const c of failedChecks) {
    lines.push("");
    lines.push(`#### ${c.label}`);
    lines.push("");
    lines.push("```");
    lines.push(c.output);
    lines.push("```");
  }
}
lines.push("");

// 5. Migration count.
const drizzleDir = join(repoRoot, "drizzle");
let migrationCount = 0;
let lastMigration: string | null = null;
if (existsSync(drizzleDir)) {
  const sqls = readdirSync(drizzleDir)
    .filter((f) => f.endsWith(".sql") && f !== "seed.sql")
    .sort();
  migrationCount = sqls.length;
  lastMigration = sqls[sqls.length - 1] ?? null;
}
lines.push(`## 5. Migrations`);
lines.push("");
lines.push(`- Count: **${migrationCount}**`);
lines.push(`- Last: \`${lastMigration ?? "—"}\``);
lines.push("");

// 6. Buckets / cron summary.
const cronDir = join(repoRoot, "src/app/api/cron");
let cronRouteCount = 0;
const cronNames: string[] = [];
if (existsSync(cronDir)) {
  for (const entry of readdirSync(cronDir)) {
    const route = join(cronDir, entry, "route.ts");
    if (existsSync(route) && statSync(route).isFile()) {
      cronRouteCount += 1;
      cronNames.push(entry);
    }
  }
}
lines.push(`## 6. Cron + buckets`);
lines.push("");
lines.push(`- Cron routes: **${cronRouteCount}** (${cronNames.join(", ")})`);
lines.push(`- CRON_SECRET set: **${process.env.CRON_SECRET ? "yes" : "no"}**`);
lines.push("");

// 7. Verdict.
const overallOk =
  envReport.ok && gates.ok && failedChecks.length === 0;
lines.push(`## 7. Verdict`);
lines.push("");
lines.push(
  overallOk
    ? "**READY** — Every static check + env + production gate is green.  Walk through `docs/STAGING-LAUNCH-CHECKLIST.md` for the manual smoke test before promoting."
    : "**NOT READY** — Resolve the failures above and re-run `npm run staging:report`.  The full checklist lives in `docs/STAGING-LAUNCH-CHECKLIST.md`.",
);
lines.push("");

// Write the report.
const tmpDir = join(repoRoot, "tmp");
if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });
const outFile = join(tmpDir, "staging-readiness-report.md");
const content = lines.join("\n");
writeFileSync(outFile, content, "utf-8");

console.log(content);
console.log("");
console.log(`Wrote ${outFile}`);
process.exit(overallOk ? 0 : 1);

export {};
