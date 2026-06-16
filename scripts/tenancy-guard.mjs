#!/usr/bin/env node
/**
 * TENANCY REGRESSION GUARD
 * ------------------------
 * This DB role is BYPASSRLS — there is NO row-level-security net, so cross-tenant
 * isolation depends entirely on code adding `requireOrgId()` + an `organizationId`
 * predicate. Across 2026-06 we audited the whole tenant-reachable DB surface
 * (~486 files) and fixed ~480 cross-tenant leaks (see docs/*TENANCY-AUDIT*). This
 * guard stops the two regression classes that recurred most, so the fix sticks:
 *
 *   CHECK 1 — new unscoped DB file: a file under src/features|src/lib that runs a
 *     Drizzle query (.from/.select/.insert/.update/.delete) but never references
 *     requireOrgId / requireInternalUser / organizationId. On BYPASSRLS that is a
 *     cross-tenant leak by default. A frozen baseline lists today's accepted
 *     exceptions (pure/global/scope-via-helper); any NET-NEW file fails CI.
 *
 *   CHECK 2 — client-supplied org (the takeover anti-pattern): an action that does
 *     `formData.get("organizationId")` trusts the submitted org. A "use server"
 *     action is a direct RPC endpoint, so this is a cross-tenant IDOR (this is how
 *     createApiKey / disconnectGoogleConnection / the weekly-report bug happened).
 *     Org must be derived server-side via requireOrgId(). Any NET-NEW file fails.
 *
 * The baselines (scripts/tenancy-guard-baseline.json) only ever SHRINK: when you
 * scope a baselined file, delete its line. To intentionally accept a new exception
 * (a genuinely-global table, a pure helper), add it to the baseline WITH a comment
 * in the PR explaining why it's tenant-safe.
 *
 * Limitation: file-level — it does NOT catch a new UNSCOPED FUNCTION added to an
 * already-scoped (already-baselined-out) file. Code review + the per-function
 * audits cover that; this guard covers the cheap, common, automatable regressions.
 *
 * Usage:  node scripts/tenancy-guard.mjs   (npm run tenancy:guard)
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ROOTS = ["src/features", "src/lib"];
// Drizzle queries only — `db.`/`tx.` prefixed, so crypto `.update()`, `Array.from()`,
// `Buffer.from()` etc. don't false-positive.
const DB_RE = /\b(?:db|tx)\.(?:select|insert|update|delete)\(/;
const ORG_RE = /requireOrgId|requireInternalUser|organizationId|organization_id/;
const FORM_ORG_RE = /formData\.get\(["']organizationId["']\)/;
const SKIP_DIR = /(^|\/)(db|__tests__|node_modules)(\/|$)/; // db = schema/migrate, not app queries
const SKIP_FILE = /\.(test|spec)\.[tj]sx?$/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const rel = relative(ROOT, p);
    if (SKIP_DIR.test(rel)) continue;
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name) && !SKIP_FILE.test(name)) out.push(rel);
  }
  return out;
}

const baseline = JSON.parse(readFileSync(join(ROOT, "scripts/tenancy-guard-baseline.json"), "utf8"));
const baseUnscoped = new Set(baseline.unscopedDbFiles);
const baseFormOrg = new Set(baseline.formParsedOrgFiles);

const files = ROOTS.flatMap((r) => walk(join(ROOT, r)));
const newUnscoped = [];
const newFormOrg = [];
const staleUnscoped = []; // baselined files that are now scoped → should be removed from baseline

for (const rel of files) {
  const src = readFileSync(join(ROOT, rel), "utf8");
  const touchesDb = DB_RE.test(src);
  const hasOrg = ORG_RE.test(src);
  if (touchesDb && !hasOrg) {
    if (!baseUnscoped.has(rel)) newUnscoped.push(rel);
  } else if (baseUnscoped.has(rel)) {
    staleUnscoped.push(rel); // file now references org → baseline can shrink
  }
  if (FORM_ORG_RE.test(src) && !baseFormOrg.has(rel)) newFormOrg.push(rel);
}

// --write-baseline: freeze the current accepted state (run once after a fix sweep).
if (process.argv.includes("--write-baseline")) {
  const cur = { unscopedDbFiles: [], formParsedOrgFiles: [] };
  for (const rel of files) {
    const src = readFileSync(join(ROOT, rel), "utf8");
    if (DB_RE.test(src) && !ORG_RE.test(src)) cur.unscopedDbFiles.push(rel);
    if (FORM_ORG_RE.test(src)) cur.formParsedOrgFiles.push(rel);
  }
  cur.unscopedDbFiles.sort();
  cur.formParsedOrgFiles.sort();
  const { writeFileSync } = await import("node:fs");
  writeFileSync(join(ROOT, "scripts/tenancy-guard-baseline.json"), JSON.stringify(cur, null, 2) + "\n");
  console.log(`Wrote baseline: ${cur.unscopedDbFiles.length} unscoped + ${cur.formParsedOrgFiles.length} form-org files.`);
  process.exit(0);
}

let failed = false;
if (newUnscoped.length) {
  failed = true;
  console.error(`\n❌ TENANCY GUARD — ${newUnscoped.length} NEW unscoped DB file(s) (touch the DB with no requireOrgId/organizationId):`);
  for (const f of newUnscoped) console.error(`   • ${f}`);
  console.error(`   → Add requireOrgId() + an organizationId predicate. If genuinely global/pure, add the path to scripts/tenancy-guard-baseline.json (unscopedDbFiles) with a PR note on why it's tenant-safe.`);
}
if (newFormOrg.length) {
  failed = true;
  console.error(`\n❌ TENANCY GUARD — ${newFormOrg.length} NEW file(s) parsing a client-supplied organizationId (cross-tenant IDOR risk):`);
  for (const f of newFormOrg) console.error(`   • ${f}`);
  console.error(`   → Derive org server-side via requireOrgId(); never trust formData.get("organizationId").`);
}
if (staleUnscoped.length) {
  console.warn(`\n⚠️  TENANCY GUARD — ${staleUnscoped.length} baselined file(s) now reference org and can be REMOVED from scripts/tenancy-guard-baseline.json (unscopedDbFiles):`);
  for (const f of staleUnscoped) console.warn(`   • ${f}`);
  console.warn(`   (Not a failure — the baseline should shrink. Trim these when convenient.)`);
}

if (failed) {
  console.error(`\nTenancy guard FAILED. See docs/MGMT-TENANCY-AUDIT-2026-06.md for the patterns.\n`);
  process.exit(1);
}
console.log(`✅ Tenancy guard passed — no new unscoped DB files or client-org IDORs (baseline: ${baseUnscoped.size} unscoped, ${baseFormOrg.size} form-org).`);
