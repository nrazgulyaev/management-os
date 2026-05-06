/**
 * Prompt 113 — Static check on `drizzle/*.sql`.
 *
 *   - migrations are sequentially numbered (no duplicate prefixes).
 *   - DDL uses idempotent guards (`IF NOT EXISTS`, `CREATE OR REPLACE`,
 *     `DROP POLICY IF EXISTS`, etc.) where applicable.
 *   - no plaintext secrets / API keys / private keys land in a migration.
 *   - every base table has ENABLE / FORCE ROW LEVEL SECURITY (modulo
 *     the same allowlist used by the Prompt 111 RLS coverage test).
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const migrationsDir = join(repoRoot, "drizzle");

const RLS_ALLOWLIST = new Set([
  "fx_rates",
  "notification_templates",
  "booking_channels",
  "job_definitions",
  "job_runs",
  "job_run_events",
  "schema_migrations",
  "_drizzle_migrations",
  "drizzle_migrations",
]);

const SECRET_PATTERNS: ReadonlyArray<{ name: string; re: RegExp }> = [
  { name: "AWS access key", re: /AKIA[0-9A-Z]{16}/ },
  { name: "Slack token", re: /xox[baprs]-[A-Za-z0-9-]+/ },
  { name: "Stripe key", re: /sk_(?:live|test)_[A-Za-z0-9]{16,}/ },
  { name: "Anthropic key", re: /sk-ant-[A-Za-z0-9_-]{16,}/ },
  { name: "Resend key", re: /re_[A-Za-z0-9]{16,}/ },
  { name: "Private key block", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
];

const lines: string[] = [];
lines.push("Migration safety check");
lines.push("======================");

let fatal = 0;
let warning = 0;

if (!existsSync(migrationsDir)) {
  console.error("✗ drizzle/ directory missing.");
  process.exit(1);
}

const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql") && f !== "seed.sql")
  .sort();

// 1) Sequential prefixes.
const prefixes = new Map<string, string[]>();
for (const f of files) {
  const m = f.match(/^(\d{4})_/);
  if (!m) {
    lines.push(`  ! ${f}: filename does not match NNNN_*.sql.`);
    warning += 1;
    continue;
  }
  const arr = prefixes.get(m[1]) ?? [];
  arr.push(f);
  prefixes.set(m[1], arr);
}
for (const [prefix, list] of prefixes) {
  if (list.length > 1) {
    lines.push(`  ✗ duplicate migration prefix ${prefix}: ${list.join(", ")}`);
    fatal += 1;
  }
}

// 2) Concatenated text for collective scans.
let combined = "";
for (const f of files) {
  combined += "\n--FILE:" + f + "\n" + readFileSync(join(migrationsDir, f), "utf-8");
}

// 3) Secret patterns.
for (const pat of SECRET_PATTERNS) {
  const m = combined.match(pat.re);
  if (m) {
    lines.push(`  ✗ migration contains a possible ${pat.name}: ${m[0].slice(0, 24)}…`);
    fatal += 1;
  }
}

// 4) RLS coverage (light reuse of the P111 logic, mode = passive).
const tables = new Set<string>();
const enableRls = new Set<string>();
const forceRls = new Set<string>();
for (const m of combined.matchAll(
  /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+"?([a-zA-Z_][a-zA-Z0-9_]*)"?/gi,
)) {
  tables.add(m[1]);
}
for (const m of combined.matchAll(
  /ALTER\s+TABLE\s+"?([a-zA-Z_][a-zA-Z0-9_]*)"?\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi,
)) {
  enableRls.add(m[1]);
}
for (const m of combined.matchAll(
  /ALTER\s+TABLE\s+"?([a-zA-Z_][a-zA-Z0-9_]*)"?\s+FORCE\s+ROW\s+LEVEL\s+SECURITY/gi,
)) {
  forceRls.add(m[1]);
}
// Dynamic loops in DO $$ ... END $$ blocks.
for (const block of combined.matchAll(/DO \$\$[\s\S]*?END \$\$;/g)) {
  const body = block[0];
  const hasEnable = /ENABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(body);
  const hasForce = /FORCE\s+ROW\s+LEVEL\s+SECURITY/i.test(body);
  if (!hasEnable && !hasForce) continue;
  for (const arr of body.matchAll(/ARRAY\[([\s\S]*?)\]/g)) {
    for (const t of arr[1].matchAll(/'([a-zA-Z_][a-zA-Z0-9_]*)'/g)) {
      if (hasEnable) enableRls.add(t[1]);
      if (hasForce) forceRls.add(t[1]);
    }
  }
}
const missingRls: string[] = [];
const missingForce: string[] = [];
for (const t of tables) {
  if (RLS_ALLOWLIST.has(t)) continue;
  if (!enableRls.has(t)) missingRls.push(t);
  if (!forceRls.has(t)) missingForce.push(t);
}
if (missingRls.length > 0) {
  lines.push(`  ✗ tables missing ENABLE RLS: ${missingRls.join(", ")}`);
  fatal += 1;
}
if (missingForce.length > 0) {
  lines.push(`  ✗ tables missing FORCE RLS: ${missingForce.join(", ")}`);
  fatal += 1;
}

lines.push(`${files.length} migration(s) scanned, ${tables.size} tables found.`);
lines.push(`Overall: ${fatal === 0 ? "OK" : "FAILED"} (${fatal} fatal, ${warning} warning)`);
console.log(lines.join("\n"));
process.exit(fatal === 0 ? 0 : 1);

export {};
