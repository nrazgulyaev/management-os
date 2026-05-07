/**
 * Prompt 111 — RLS / FORCE RLS coverage test.
 *
 * Conservative static parser: walks every migration in `drizzle/`,
 * collects the table names declared via `CREATE TABLE …`, and
 * asserts that each one is also touched by `ENABLE ROW LEVEL SECURITY`
 * + `FORCE ROW LEVEL SECURITY` somewhere in the migration corpus.
 *
 * Limitations (documented in ADR):
 *   - We do not introspect the live DB; this is a source-text grep.
 *   - We allowlist a few tables that are intentionally public-readable
 *     (e.g. mock fixtures, log buffers) — confirm before extending.
 *   - We do not assert per-policy semantics; that's the per-feature
 *     test's job.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const migrationsDir = join(repoRoot, "drizzle");

// Allowlist — tables that legitimately do NOT need ENABLE / FORCE RLS.
const ALLOWLIST = new Set<string>([
  // FX rates are read-only reference data.
  "fx_rates",
  // Notification templates are reference data; reads are needed by
  // worker code that runs as service-role.
  "notification_templates",
  // Job catalog / runtime tables are internal infra; the runtime
  // explicitly uses service-role and they have no owner-side surface.
  "job_definitions",
  "job_runs",
  "job_run_events",
  // Booking channel registry — small, read-mostly.
  "booking_channels",
  // Drizzle / Supabase migration bookkeeping.
  "schema_migrations",
  "_drizzle_migrations",
  "drizzle_migrations",
  // Public marketing-style demo lookup tables (none currently).
  // Stage 7.A — platform-wide cabinet metadata (no org_id; super_admin
  // only edits via the catalog management UI).
  "cabinet_definitions",
  // Stage 7.B — platform-wide commerce catalog (no org_id; super_admin
  // owns plan + flag + plan_features rows). Per-org isolation lives on
  // org_subscriptions + subscription_lifecycle_events, both of which DO
  // have RLS.
  "subscription_plans",
  "feature_flags",
  "plan_features",
]);

interface MigrationCorpus {
  /** All `CREATE TABLE IF NOT EXISTS "x"` and `CREATE TABLE "x"` names. */
  tables: Set<string>;
  /** Tables that appear inside an `ENABLE ROW LEVEL SECURITY` statement. */
  enableRls: Set<string>;
  /** Tables that appear inside a `FORCE ROW LEVEL SECURITY` statement. */
  forceRls: Set<string>;
  /** Raw concatenated text — used for security-table policy greps. */
  text: string;
}

function loadMigrations(): MigrationCorpus {
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const tables = new Set<string>();
  const enableRls = new Set<string>();
  const forceRls = new Set<string>();
  let combinedText = "";
  for (const f of files) {
    if (f === "seed.sql") continue;
    const text = readFileSync(join(migrationsDir, f), "utf-8");
    combinedText += "\n" + text;
    // CREATE TABLE …
    for (const match of text.matchAll(
      /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+"?([a-zA-Z_][a-zA-Z0-9_]*)"?/gi,
    )) {
      tables.add(match[1]);
    }
    // ALTER TABLE … ENABLE ROW LEVEL SECURITY  (direct form)
    for (const match of text.matchAll(
      /ALTER\s+TABLE\s+"?([a-zA-Z_][a-zA-Z0-9_]*)"?\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi,
    )) {
      enableRls.add(match[1]);
    }
    for (const match of text.matchAll(
      /ALTER\s+TABLE\s+"?([a-zA-Z_][a-zA-Z0-9_]*)"?\s+FORCE\s+ROW\s+LEVEL\s+SECURITY/gi,
    )) {
      forceRls.add(match[1]);
    }
    // EXECUTE format(... ENABLE / FORCE …) — pick up tables referenced
    // by the dynamic loop pattern used in our migrations.  Be
    // permissive: find every `unnest(ARRAY[...])` block whose body
    // appears in the same DO block as an EXECUTE that enables RLS.
    const doBlocks = text.matchAll(/DO \$\$[\s\S]*?END \$\$;/g);
    for (const block of doBlocks) {
      const body = block[0];
      const hasEnable = /ENABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(body);
      const hasForce = /FORCE\s+ROW\s+LEVEL\s+SECURITY/i.test(body);
      if (!hasEnable && !hasForce) continue;
      const arrayMatches = body.matchAll(/ARRAY\[([\s\S]*?)\]/g);
      for (const arr of arrayMatches) {
        for (const t of arr[1].matchAll(/'([a-zA-Z_][a-zA-Z0-9_]*)'/g)) {
          if (hasEnable) enableRls.add(t[1]);
          if (hasForce) forceRls.add(t[1]);
        }
      }
    }
  }
  return { tables, enableRls, forceRls, text: combinedText };
}

let corpusCache: MigrationCorpus | null = null;
function corpus(): MigrationCorpus {
  if (!corpusCache) corpusCache = loadMigrations();
  return corpusCache;
}

// -----------------------------------------------------------------------------
// 1) Every table has ENABLE RLS somewhere (modulo allowlist).
// -----------------------------------------------------------------------------
test("RLS coverage — every base table has ENABLE ROW LEVEL SECURITY", () => {
  const c = corpus();
  const missing: string[] = [];
  for (const t of c.tables) {
    if (ALLOWLIST.has(t)) continue;
    if (!c.enableRls.has(t)) missing.push(t);
  }
  assert.deepEqual(
    missing,
    [],
    `Tables missing ENABLE ROW LEVEL SECURITY: ${missing.join(", ")}`,
  );
});

// -----------------------------------------------------------------------------
// 2) Every table has FORCE RLS somewhere (modulo allowlist).
// -----------------------------------------------------------------------------
test("RLS coverage — every base table has FORCE ROW LEVEL SECURITY", () => {
  const c = corpus();
  const missing: string[] = [];
  for (const t of c.tables) {
    if (ALLOWLIST.has(t)) continue;
    if (!c.forceRls.has(t)) missing.push(t);
  }
  assert.deepEqual(
    missing,
    [],
    `Tables missing FORCE ROW LEVEL SECURITY: ${missing.join(", ")}`,
  );
});

// -----------------------------------------------------------------------------
// 3) Every Prompt 111 table is RLS-locked.
// -----------------------------------------------------------------------------
test("P111 tables are RLS-locked", () => {
  const c = corpus();
  for (const t of [
    "auth_mfa_factors",
    "auth_mfa_recovery_codes",
    "auth_login_attempts",
    "auth_security_events",
    "job_locks",
  ]) {
    assert.ok(c.enableRls.has(t), `${t} missing ENABLE RLS`);
    assert.ok(c.forceRls.has(t), `${t} missing FORCE RLS`);
  }
});

// -----------------------------------------------------------------------------
// 4) Security tables have no owner / guest / vendor / field policy.
// -----------------------------------------------------------------------------
test("security tables have no owner / guest / vendor / field public policy", () => {
  const c = corpus();
  // For each Prompt 111 table, look for any policy whose USING clause
  // references owner / guest / vendor language we use elsewhere.
  const text = c.text;
  for (const t of [
    "auth_mfa_factors",
    "auth_mfa_recovery_codes",
    "auth_login_attempts",
    "auth_security_events",
    "job_locks",
  ]) {
    // Find policy blocks for this table.  Our migrations use a
    // dynamic loop with EXECUTE format so per-table USING policies
    // for security tables don't appear individually; but if they
    // ever do, they must not reference current_owner_ids().
    const policyMatches = [
      ...text.matchAll(
        new RegExp(
          `CREATE POLICY[^;]*ON\\s+"?${t}"?[\\s\\S]*?USING[^;]*;`,
          "gi",
        ),
      ),
    ];
    for (const m of policyMatches) {
      const block = m[0];
      assert.equal(
        /current_owner_ids|owner_visible|guest_visible|vendor_visible/.test(
          block,
        ),
        false,
        `${t} has a non-internal policy: ${block.slice(0, 160)}`,
      );
    }
  }
});

// -----------------------------------------------------------------------------
// 5) audit_events is not attached to the audit trigger (would recurse).
// -----------------------------------------------------------------------------
test("audit_events is not in the audit trigger attach list", () => {
  const c = corpus();
  const text = c.text;
  // Find the migration's attach loop.  It uses a unnest(ARRAY[...])
  // block followed by CREATE TRIGGER.
  const attachLoops = [
    ...text.matchAll(
      /unnest\(ARRAY\[([^\]]+)\]\)[\s\S]*?CREATE TRIGGER trg_audit_sensitive/gi,
    ),
  ];
  assert.ok(attachLoops.length > 0, "audit attach loop not found");
  for (const loop of attachLoops) {
    const arrayContent = loop[1];
    assert.equal(
      /'audit_events'/.test(arrayContent),
      false,
      "audit_events appears in the attach list — would cause infinite recursion",
    );
  }
});
