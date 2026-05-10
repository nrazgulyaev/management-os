/**
 * Stage 10.6 / Phase 10.6.B.1 — Audit-bot demo seed acceptance tests.
 *
 * The seed script targets production OR a non-test environment via DB
 * connection — these tests do NOT execute the seed. Instead they assert
 * the file's structural contracts:
 *   - exists at the documented path
 *   - production-safety guard (ALLOW_AUDIT_DEMO_SEED env) is in place
 *   - idempotency primitives are wired (ON CONFLICT DO NOTHING / NOT EXISTS pre-checks)
 *   - resolves audit-bot user + ARCONIQUE_DEFAULT org defensively
 *   - operates only on the documented set of tables (no surprise mutations)
 *
 * Live execution is operator-side (`ALLOW_AUDIT_DEMO_SEED=1 node …`).
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

const SCRIPT = "scripts/seed-audit-bot-demo.ts";

// ============================================================================
// File presence + Stage 10.6.B.1 marker
// ============================================================================

test("10.6.B.1 — seed script ships at scripts/seed-audit-bot-demo.ts", () => {
  assert.ok(exists(SCRIPT), `expected ${SCRIPT} to exist`);
  const src = read(SCRIPT);
  assert.match(src, /Stage 10\.6\.B\.1/);
});

// ============================================================================
// Production-safety guard
// ============================================================================

test("10.6.B.1 — production-safety guard requires ALLOW_AUDIT_DEMO_SEED=1", () => {
  const src = read(SCRIPT);
  // Reads the env flag.
  assert.match(src, /ALLOW_AUDIT_DEMO_SEED/);
  // Refuses to write without the flag (DRY RUN warning).
  assert.match(src, /DRY RUN/);
  // Exits 0 on dry-run (no error; just informational).
  assert.match(src, /process\.exit\(0\)/);
});

test("10.6.B.1 — DRY RUN message lists every table the seed would touch", () => {
  const src = read(SCRIPT);
  // Each table appears in the dry-run preview so an operator can audit before flipping the flag.
  for (const term of [
    "owners",
    "app_users_owners",
    "ownership_shares",
    "villa_health_snapshots",
    "manager_performance_metrics",
    "agent_outputs",
    "executive_metrics_snapshot",
  ]) {
    assert.match(
      src,
      new RegExp(term),
      `dry-run preview must mention ${term}`,
    );
  }
});

// ============================================================================
// Idempotency contract
// ============================================================================

test("10.6.B.1 — every INSERT uses ON CONFLICT DO NOTHING or NOT EXISTS pre-check (idempotent)", () => {
  const src = read(SCRIPT);
  // Count INSERT statements.
  const inserts = (src.match(/INSERT INTO\b/g) ?? []).length;
  assert.ok(
    inserts >= 7,
    `expected ≥7 INSERT statements (one per documented table), got ${inserts}`,
  );
  // Every INSERT must be guarded — count guards.
  const onConflict = (src.match(/ON CONFLICT/g) ?? []).length;
  const notExists = (src.match(/WHERE NOT EXISTS/g) ?? []).length;
  // Plus the 1 "select existing owner first" pre-check.
  assert.ok(
    onConflict + notExists >= inserts - 1,
    `expected guards (ON CONFLICT or NOT EXISTS) on every INSERT; got ${onConflict} ON CONFLICT + ${notExists} NOT EXISTS for ${inserts} INSERTs`,
  );
});

// ============================================================================
// Defensive resolution of audit-bot + ARCONIQUE_DEFAULT
// ============================================================================

test("10.6.B.1 — resolves ARCONIQUE_DEFAULT org by code + fails fast if missing", () => {
  const src = read(SCRIPT);
  assert.match(src, /organization_code\s*=\s*\$\{ORG_CODE\}/);
  assert.match(src, /ARCONIQUE_DEFAULT/);
  // Fails fast with operator-readable message.
  assert.match(src, /Run bootstrap-admin first/);
});

test("10.6.B.1 — resolves audit-bot via email + fails fast if app_user missing", () => {
  const src = read(SCRIPT);
  assert.match(src, /AUDIT_BOT_EMAIL/);
  assert.match(src, /audit-bot@arconique\.com/);
  assert.match(src, /create-audit-bot.*bootstrap-admin/s);
});

// ============================================================================
// Touches only the documented tables (no surprise mutations)
// ============================================================================

test("10.6.B.1 — INSERTs only into the 7 documented tables", () => {
  const src = read(SCRIPT);
  const allowedTables = new Set([
    "owners",
    "app_users_owners",
    "ownership_shares",
    "villa_health_snapshots",
    "manager_performance_metrics",
    "agent_outputs",
    "executive_metrics_snapshots",
  ]);
  const insertedTables = [
    ...src.matchAll(/INSERT INTO\s+(\w+)/g),
  ].map((m) => m[1]);
  for (const t of insertedTables) {
    assert.ok(
      allowedTables.has(t),
      `surprise INSERT into table "${t}" — not in the documented allow-list`,
    );
  }
});

// ============================================================================
// Runnable-agents catalog matches the documented 7
// ============================================================================

test("10.6.B.1 — RUNNABLE_AGENTS includes the 7 user-runnable agents", () => {
  const src = read(SCRIPT);
  for (const agent of [
    "qs_cost_analyst",
    "procurement_analyst",
    "tax_assistant",
    "marketing_assistant",
    "executive_business",
    "daily_digest",
    "weekly_plan",
  ]) {
    assert.match(
      src,
      new RegExp(`["']${agent}["']`),
      `RUNNABLE_AGENTS must include ${agent}`,
    );
  }
  // Must NOT include the 2 system-only agents (inbox, memory) — they
  // aren't "runnable" and don't produce agent_outputs rows.
  assert.doesNotMatch(
    src,
    /RUNNABLE_AGENTS[\s\S]*?["']inbox["']/,
    "RUNNABLE_AGENTS should not include 'inbox' (system surface, not runnable)",
  );
  assert.doesNotMatch(
    src,
    /RUNNABLE_AGENTS[\s\S]*?["']memory["']/,
    "RUNNABLE_AGENTS should not include 'memory' (system surface, not runnable)",
  );
});

// ============================================================================
// Documentation: decisions doc references this seed
// ============================================================================

test("10.6.B.1 — decisions doc shipped + acceptance gate present", () => {
  const path = "tmp/stage-10-6-b-1-decisions.md";
  assert.ok(
    existsSync(resolve(ROOT, path)),
    `decisions doc missing at ${path}`,
  );
  const doc = readFileSync(resolve(ROOT, path), "utf8");
  assert.match(doc, /STAGE 10\.6 \/ PHASE 10\.6\.B\.1 ACCEPTED/);
  // The conflict with seed-production-minimal.ts policy is explicitly addressed.
  assert.match(doc, /seed-production-minimal|production policy/i);
});
