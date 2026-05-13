/**
 * Stage 10.6 / Phase 10.6.F.1 — Owner stays surface polish.
 *
 * SCOPE NOTE: 10.6.F.1 was scoped as "build owner-stays domain" but the
 * domain was already deeply built in earlier work (schema, services,
 * pages, finance bridge, equivalence groups, relocation candidates). The
 * actual delta in F.1 is applying 10.6.C visual tokens (rounded-3xl,
 * shadow-soft-card, ListTableCard, larger empty-state pads) so the
 * owner-stays surface matches the rest of Mgmt OS post-modernization.
 *
 * This test asserts the polish landed — NOT the underlying domain
 * functionality, which is covered by Stage 7.J / 7.K tests.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

const INDEX = "src/app/(dashboard)/dashboard/owner-stays/page.tsx";
const POLICIES = "src/app/(dashboard)/dashboard/owner-stays/policies/page.tsx";
const FINANCE_BRIDGE =
  "src/app/(dashboard)/dashboard/owner-stays/finance-bridge/page.tsx";
const REQUESTS = "src/app/(dashboard)/dashboard/owner-stays/requests/page.tsx";
const REQUEST_DETAIL =
  "src/app/(dashboard)/dashboard/owner-stays/requests/[id]/page.tsx";
const EQUIV_GROUPS =
  "src/app/(dashboard)/dashboard/owner-stays/equivalence-groups/page.tsx";

const ALL = [INDEX, POLICIES, FINANCE_BRIDGE, REQUESTS, REQUEST_DETAIL, EQUIV_GROUPS];

// ============================================================================
// Token modernization — no rounded-md / rounded-sm anywhere in owner-stays
// ============================================================================

test("10.6.F.1.polish — no rounded-md/rounded-sm legacy tokens in owner-stays", () => {
  for (const rel of ALL) {
    const src = read(rel);
    assert.doesNotMatch(
      src,
      /\brounded-md\b/,
      `${rel} still uses legacy rounded-md`,
    );
    assert.doesNotMatch(
      src,
      /\brounded-sm\b/,
      `${rel} still uses legacy rounded-sm`,
    );
  }
});

// ============================================================================
// Index page — QuickLink cards adopt rounded-2xl + shadow-soft-card
// ============================================================================

test("10.6.F.1.polish — owner-stays index QuickLink cards use rounded-2xl + shadow-soft-card", () => {
  const src = read(INDEX);
  assert.match(src, /rounded-2xl[^"]*shadow-soft-card/);
  assert.match(src, /hover:shadow-elevated-card/);
});

test("10.6.F.1.polish — owner-stays index 'All requests' action is rounded-full", () => {
  const src = read(INDEX);
  // Pill-style action button (matches 10.6.C convention)
  assert.match(src, /rounded-full border border-line-soft/);
});

// ============================================================================
// Policies page — ListTableCard wraps the table
// ============================================================================

test("10.6.F.1.polish — policies page uses ListTableCard primitive", () => {
  const src = read(POLICIES);
  assert.match(src, /import \{[^}]*ListTableCard[^}]*\} from "@\/components\/ui\/primitives"/);
  assert.match(src, /<ListTableCard/);
  // No legacy <Section> wrap for the table block
  assert.doesNotMatch(src, /import \{ Section \} from/);
});

// ============================================================================
// Finance bridge page — ListTableCard imported, table frames modernised,
// dashed empty states get rounded-3xl + larger padding
// ============================================================================

test("10.6.F.1.polish — finance-bridge imports ListTableCard primitive", () => {
  const src = read(FINANCE_BRIDGE);
  assert.match(src, /import \{ ListTableCard \} from "@\/components\/ui\/primitives"/);
});

test("10.6.F.1.polish — finance-bridge table frames use rounded-3xl + shadow-soft-card", () => {
  const src = read(FINANCE_BRIDGE);
  // Both the inline pendingBridge table + the BridgeTable helper share the same wrap
  const matches = src.match(/rounded-3xl border border-line-soft bg-surface shadow-soft-card overflow-hidden/g);
  assert.ok(
    matches && matches.length >= 2,
    `expected at least 2 modern table wraps in finance-bridge, got ${matches?.length ?? 0}`,
  );
});

test("10.6.F.1.polish — finance-bridge dashed empty states use rounded-3xl + larger pad", () => {
  const src = read(FINANCE_BRIDGE);
  const matches = src.match(/rounded-3xl border border-dashed border-line-soft bg-muted\/20 px-7 py-8/g);
  assert.ok(
    matches && matches.length >= 2,
    `expected modernised dashed empty states, got ${matches?.length ?? 0}`,
  );
});

// ============================================================================
// Requests pages + equivalence-groups inherit the same modernization
// ============================================================================

test("10.6.F.1.polish — requests + equivalence-groups + request detail use modernised frames", () => {
  for (const rel of [REQUESTS, REQUEST_DETAIL, EQUIV_GROUPS]) {
    const src = read(rel);
    // Each page has at least one rounded-3xl modernised frame
    assert.match(
      src,
      /rounded-3xl border border-line-soft bg-surface shadow-soft-card/,
      `${rel} missing modernised rounded-3xl + shadow-soft-card frame`,
    );
  }
});
