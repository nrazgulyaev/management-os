/**
 * Stage 9.G — Tenant Data Isolation Tests (static).
 *
 * The existing `tests/p111-rls-coverage.test.ts` proves every table has
 * ENABLE + FORCE row-level security. This file goes further:
 *
 *   1. For every table with an `organization_id REFERENCES organizations`
 *      column, assert there is at least one CREATE POLICY referencing
 *      `is_in_user_organization` — i.e. the RLS policy actually scopes
 *      reads/writes to the caller's organization. Without this, a table
 *      could have ENABLE RLS but a permissive policy that lets anyone
 *      read everything.
 *
 *   2. Spot-check that the canonical `is_in_user_organization` /
 *      `is_internal_user` SQL functions remain declared (Stage 5.J +
 *      0000_initial). If these get accidentally dropped, every RLS
 *      policy that references them stops gating.
 *
 *   3. Confirm specific high-value tables (subscriptions, audit, the
 *      new team_invitations) are explicitly listed — these surfaces
 *      handle billing + identity data and a regression here is
 *      especially costly.
 *
 * The DB-bound counterpart lives at
 * `tests/invariants/tenant-isolation.test.ts` — it queries pg_policies
 * + pg_class + pg_proc to verify the same invariants against the
 * actually-applied schema (catches migration drift).
 *
 * Cross-org runtime tests (two real users in two orgs each trying to
 * read each other's data) are out of scope for the static suite —
 * see `docs/cross-org-isolation-playbook.md` for the manual probe.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE =
  typeof __dirname !== "undefined"
    ? __dirname
    : dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const MIGRATIONS = resolve(ROOT, "drizzle");

interface ScanResult {
  /** Table name → file paths declaring it as org-scoped. */
  orgScopedTables: Map<string, string[]>;
  /** Tables seen anywhere in any migration. */
  allTables: Set<string>;
  /** Concatenated migration text for grep tests. */
  combinedText: string;
}

function loadMigrations(): ScanResult {
  const orgScopedTables = new Map<string, string[]>();
  const allTables = new Set<string>();
  let combinedText = "";

  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql") && f !== "seed.sql")
    .sort();

  for (const f of files) {
    const text = readFileSync(join(MIGRATIONS, f), "utf8");
    combinedText += "\n" + text;

    // Walk every CREATE TABLE block + its balanced-paren body.
    const re = /CREATE TABLE(?:\s+IF NOT EXISTS)?\s+"?([a-z_][a-z0-9_]*)"?\s*\(/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const name = m[1];
      let depth = 1;
      let i = re.lastIndex;
      while (i < text.length && depth > 0) {
        if (text[i] === "(") depth++;
        else if (text[i] === ")") depth--;
        if (depth === 0) break;
        i++;
      }
      const body = text.slice(re.lastIndex, i);
      allTables.add(name);
      if (
        /organization_id[\s\S]{0,200}REFERENCES\s+"?organizations"?/i.test(body)
      ) {
        const arr = orgScopedTables.get(name) ?? [];
        arr.push(f);
        orgScopedTables.set(name, arr);
      }
    }
  }

  return { orgScopedTables, allTables, combinedText };
}

let _cache: ScanResult | null = null;
function corpus(): ScanResult {
  if (!_cache) _cache = loadMigrations();
  return _cache;
}

// ============================================================================
// Tables we expect to be org-scoped (regression-guard against accidental drop)
// ============================================================================

const REQUIRED_ORG_SCOPED = [
  // Identity + commerce
  "team_invitations",
  "org_subscriptions",
  "subscription_lifecycle_events",
  // AI quotas
  "ai_org_quota_limits",
  "ai_org_usage_monthly",
  "ai_project_memory",
  // API surface
  "api_keys",
  "api_request_log",
  "webhook_subscriptions",
  "usage_metrics",
  "data_export_requests",
  "bulk_import_jobs",
  // Banking + payments
  "bank_connections",
  "bank_transactions",
  "payment_intents",
  "payment_attempts",
  "payment_processor_connections",
  "closed_periods",
  "reconciliation_rules",
  "statement_imports",
  // Marketing + attribution
  "marketing_connections",
  "marketing_campaigns",
  "marketing_metrics",
  "attribution_conversions",
  "attribution_touchpoints",
  // Channel manager
  "channel_connections",
  "channel_reservations",
  "channel_commission_records",
  "channel_sync_log",
  // Messaging
  "conversation_threads",
  "conversation_messages",
  "message_templates",
  "auto_response_rules",
  // OAuth
  "oauth_connections",
];

test("9.G: every required org-scoped table is declared with organization_id FK", () => {
  const c = corpus();
  const missing: string[] = [];
  for (const name of REQUIRED_ORG_SCOPED) {
    if (!c.orgScopedTables.has(name)) missing.push(name);
  }
  assert.deepStrictEqual(
    missing,
    [],
    `Tables in REQUIRED_ORG_SCOPED but missing the organization_id REFERENCES organizations FK:\n` +
      missing.map((n) => `  - ${n}`).join("\n"),
  );
});

test("9.G: every org-scoped table appears in at least one CREATE POLICY .. is_in_user_organization", () => {
  const c = corpus();
  // The RLS policy text typically reads either as a direct CREATE POLICY:
  //   CREATE POLICY xxx ON public.foo FOR ALL USING (is_in_user_organization(organization_id))
  // or via an EXECUTE format() loop:
  //   EXECUTE format('CREATE POLICY ... ON %I FOR ALL USING (... is_in_user_organization(...) ...)', t)
  // and the table name appears as a literal in an ARRAY[...] block.
  // We check both forms.

  const offenders: Array<{ table: string; reason: string }> = [];

  for (const [name, files] of c.orgScopedTables.entries()) {
    // Direct CREATE POLICY referencing this exact table + is_in_user_organization.
    const directRe = new RegExp(
      String.raw`CREATE POLICY[\s\S]{0,400}ON\s+(?:"?public"?\.)?"?` +
        name +
        String.raw`"?[\s\S]{0,400}is_in_user_organization`,
      "i",
    );
    if (directRe.test(c.combinedText)) continue;

    // Loop-style: the table name appears as a string literal in an
    // ARRAY[...] block whose enclosing DO block invokes EXECUTE format
    // with `is_in_user_organization` in the policy text.
    const loopRe = /DO\s+\$\$[\s\S]*?END\s+\$\$;/g;
    let foundInLoop = false;
    let bm: RegExpExecArray | null;
    while ((bm = loopRe.exec(c.combinedText)) !== null) {
      const block = bm[0];
      if (!/is_in_user_organization/i.test(block)) continue;
      const arrayRe = /ARRAY\[([\s\S]*?)\]/g;
      let am: RegExpExecArray | null;
      while ((am = arrayRe.exec(block)) !== null) {
        // tokens like 'foo', 'bar', 'baz'
        const literals = [...am[1].matchAll(/'([a-z_][a-z0-9_]*)'/gi)].map(
          (m) => m[1],
        );
        if (literals.includes(name)) {
          foundInLoop = true;
          break;
        }
      }
      if (foundInLoop) break;
    }

    if (!foundInLoop) {
      offenders.push({
        table: name,
        reason: `declared org-scoped in ${files.join(", ")} but no CREATE POLICY referencing is_in_user_organization found in any migration`,
      });
    }
  }

  assert.deepStrictEqual(
    offenders,
    [],
    `${offenders.length} org-scoped tables lack an is_in_user_organization policy:\n` +
      offenders.map((o) => `  - ${o.table}: ${o.reason}`).join("\n"),
  );
});

test("9.G: the canonical is_in_user_organization SQL function remains declared", () => {
  const c = corpus();
  assert.match(
    c.combinedText,
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+(?:public\.)?is_in_user_organization\s*\(/i,
    "is_in_user_organization function must be declared in some migration",
  );
  // Body uses is_internal_user + current_user_organization_id (the gating
  // semantics). Drift here is a security-equivalent regression.
  const fnBlock = c.combinedText.match(
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+(?:public\.)?is_in_user_organization[\s\S]*?\$\$;/i,
  );
  assert.ok(fnBlock, "could not find is_in_user_organization body");
  assert.match(fnBlock![0], /is_internal_user/i);
  assert.match(fnBlock![0], /current_user_organization_id/i);
});

test("9.G: the canonical is_internal_user SQL function remains declared", () => {
  const c = corpus();
  assert.match(
    c.combinedText,
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+(?:public\.)?is_internal_user\s*\(/i,
  );
  // Internal-user check joins app_users + user_roles + roles. Spot-check
  // that the join is present so a future "rewrite" doesn't accidentally
  // open RLS to all auth users.
  const fnBlock = c.combinedText.match(
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+(?:public\.)?is_internal_user[\s\S]*?\$\$;/i,
  );
  assert.ok(fnBlock, "could not find is_internal_user body");
  assert.match(fnBlock![0], /JOIN\s+(?:public\.)?user_roles/i);
  assert.match(fnBlock![0], /JOIN\s+(?:public\.)?roles/i);
  // Active-only check (status = 'active').
  assert.match(fnBlock![0], /status\s*=\s*'active'/i);
});

test("9.G: subscription tables specifically have org-isolation policies", () => {
  const c = corpus();
  // org_subscriptions + subscription_lifecycle_events handle billing
  // data — leak here is a class-A privacy + financial issue.
  for (const name of ["org_subscriptions", "subscription_lifecycle_events"]) {
    const re = new RegExp(
      `is_in_user_organization[\\s\\S]{0,100}organization_id[\\s\\S]{0,500}` +
        name +
        `|` +
        name +
        `[\\s\\S]{0,500}is_in_user_organization`,
      "i",
    );
    // Loose check — looking for proximity between the table name and the
    // is_in_user_organization predicate anywhere in the migration corpus.
    assert.ok(
      re.test(c.combinedText) ||
        // OR the loop-style declaration which our generic test handles
        c.combinedText.includes(`'${name}'`) &&
          /is_in_user_organization/i.test(c.combinedText),
      `Subscription table ${name} must have an is_in_user_organization policy`,
    );
  }
});

test("9.G: team_invitations (Stage 9.D) has org-isolation + internal-bypass policies", () => {
  const c = corpus();
  assert.match(c.combinedText, /team_invitations_org_isolation/);
  assert.match(c.combinedText, /team_invitations_internal_bypass/);
  assert.match(
    c.combinedText,
    /CREATE POLICY team_invitations_org_isolation[\s\S]{0,200}is_in_user_organization/,
  );
});

test("9.G: audit_events stays out of public org-scoped policies (handled by trigger-attached audit, not RLS)", () => {
  const c = corpus();
  // The existing p111 test asserts audit_events is NOT in the audit
  // attach list (it would self-recurse). Belt-and-braces here: we should
  // never see a CREATE POLICY for audit_events that uses
  // is_in_user_organization — audit reads in app code already filter
  // via the actor + entity_type, and a permissive RLS policy could
  // leak cross-org actor IDs.
  const audit = c.combinedText.match(
    /CREATE POLICY[\s\S]{0,200}ON\s+(?:"?public"?\.)?"?audit_events"?[\s\S]{0,300}/gi,
  );
  if (audit) {
    for (const block of audit) {
      // Permissive policy is OK iff it uses is_internal_user (meaning
      // only internal users can read audit_events). Reject any policy
      // that lets non-internal users see it.
      assert.match(
        block,
        /is_internal_user/i,
        `audit_events policy must restrict to internal users:\n${block.slice(0, 400)}`,
      );
    }
  }
});

test("9.G: cross-org isolation manual playbook is shipped", () => {
  const playbook = resolve(ROOT, "docs/cross-org-isolation-playbook.md");
  const fs = require("fs") as typeof import("fs");
  assert.ok(
    fs.existsSync(playbook),
    "docs/cross-org-isolation-playbook.md must exist — it documents the manual two-user probe that the static suite cannot replicate",
  );
});

// ============================================================================
// Phase 9.G closure
// ============================================================================

test("Phase 9.G: DB invariant test file shipped", () => {
  const fs = require("fs") as typeof import("fs");
  assert.ok(
    fs.existsSync(resolve(ROOT, "tests/invariants/tenant-isolation.test.ts")),
  );
});

test("Phase 9.G: no new migrations", () => {
  const fs = require("fs") as typeof import("fs");
  assert.ok(
    !fs.existsSync(resolve(ROOT, "drizzle/0089_development_os_stage_9_g.sql")),
  );
});
