/**
 * Stage 10.E.3 — Owner-stays + Owners + Shares CRUD acceptance tests.
 *
 * The audit flagged 4 list pages partial-CRUD:
 *   /dashboard/owners                          (HIGH)
 *   /dashboard/shares                          (HIGH)
 *   /dashboard/owner-stays/policies            (HIGH)
 *   /dashboard/owner-stays/equivalence-groups  (HIGH)
 *
 * Owners already had updateOwner/archiveOwner. 10.E.3 added:
 *   - updateShareAction (constrained — ledger fields immutable)
 *   - updateOwnerStayPolicyAction (full schema)
 *   - updateEquivalenceGroupAction + archiveEquivalenceGroupAction
 *
 * All wired via the new <OwnersRowActions> shared client wrapper.
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

const SHARES_ACTIONS = "src/features/shares/actions.ts";
const POLICIES_ACTIONS = "src/features/owner-stays/actions.ts";
const WRAPPER = "src/components/dashboard/owners/owners-row-actions.tsx";

// ============================================================================
// Server actions
// ============================================================================

test("10.E.3: updateShareAction shipped + constrained edit (ledger fields skipped)", () => {
  assert.ok(exists(SHARES_ACTIONS));
  const src = read(SHARES_ACTIONS);
  assert.match(src, /export async function updateShareAction\b/);
  // Constrained — should mutate sharePercent/startsOn/endsOn/status only.
  // Verifies ownerId/villaId/projectId/model are NOT in the .set() block.
  const body = src.match(
    /export async function updateShareAction\b[\s\S]*?return \{ ok: true \};/,
  )?.[0];
  assert.ok(body, "updateShareAction body not found");
  assert.match(body!, /\.update\(ownershipShares\)\s*\.set\(\{/);
  assert.match(body!, /sharePercent:\s*String\(d\.sharePercent\)/);
  assert.match(body!, /startsOn:\s*d\.startsOn/);
  assert.match(body!, /endsOn:/);
  assert.match(body!, /status:\s*d\.status/);
  // Ledger fields should NOT appear in the .set block.
  const setBlock = body!.match(/\.set\(\{[\s\S]*?\}\)/)?.[0];
  assert.ok(setBlock);
  assert.ok(!/\bownerId:\s/.test(setBlock!), "ownerId must not be settable");
  assert.ok(!/\bvillaId:\s/.test(setBlock!), "villaId must not be settable");
  assert.ok(!/\bprojectId:\s/.test(setBlock!), "projectId must not be settable");
  assert.ok(!/\bmodel:\s/.test(setBlock!), "model must not be settable");
});

test("10.E.3: updateShareAction audit-logs share.update with before+after", () => {
  const src = read(SHARES_ACTIONS);
  const body = src.match(
    /export async function updateShareAction\b[\s\S]*?return \{ ok: true \};/,
  )?.[0];
  assert.ok(body);
  assert.match(body!, /"share\.update"/);
  assert.match(body!, /before:/);
  assert.match(body!, /after:/);
});

test("10.E.3: updateOwnerStayPolicyAction shipped + uses createOwnerStayPolicySchema", () => {
  const src = read(POLICIES_ACTIONS);
  assert.match(src, /export async function updateOwnerStayPolicyAction\b/);
  const body = src.match(
    /export async function updateOwnerStayPolicyAction\b[\s\S]*?return \{ ok: true \};/,
  )?.[0];
  assert.ok(body);
  assert.match(body!, /createOwnerStayPolicySchema\.safeParse/);
  assert.match(body!, /requirePermission\("owner_stay\.approve"\)/);
  assert.match(body!, /"owner_stay\.policy\.update"/);
  assert.match(body!, /revalidatePath\("\/dashboard\/owner-stays\/policies"\)/);
});

test("10.E.3: equivalence-group actions shipped (update + archive)", () => {
  const src = read(POLICIES_ACTIONS);
  for (const fn of [
    "updateEquivalenceGroupAction",
    "archiveEquivalenceGroupAction",
  ]) {
    assert.match(src, new RegExp(`export async function ${fn}\\b`));
  }
});

test("10.E.3: equivalence-group actions gate on relocation.manage permission", () => {
  const src = read(POLICIES_ACTIONS);
  for (const fn of [
    "updateEquivalenceGroupAction",
    "archiveEquivalenceGroupAction",
  ]) {
    const body = src.match(
      new RegExp(`export async function ${fn}\\b[\\s\\S]*?return \\{ ok: true \\};`),
    )?.[0];
    assert.ok(body, `${fn} body not found`);
    assert.match(body!, /requirePermission\("relocation\.manage"\)/);
  }
});

test("10.E.3: archiveEquivalenceGroupAction soft-deletes (status -> 'archived')", () => {
  const src = read(POLICIES_ACTIONS);
  const body = src.match(
    /export async function archiveEquivalenceGroupAction\b[\s\S]*?return \{ ok: true \};/,
  )?.[0];
  assert.ok(body);
  assert.match(body!, /status:\s*"archived"/);
  assert.match(body!, /"relocation\.group\.archive"/);
});

test("10.E.3: existing owner actions unchanged (regression guard)", () => {
  const src = read("src/features/owners/actions.ts");
  for (const fn of [
    "createOwnerAction",
    "updateOwnerAction",
    "archiveOwnerAction",
    "unarchiveOwnerAction",
  ]) {
    assert.match(src, new RegExp(`export async function ${fn}\\b`));
  }
});

// ============================================================================
// Client wrapper
// ============================================================================

test("10.E.3: OwnersRowActions wrapper exists + is a client component", () => {
  assert.ok(exists(WRAPPER));
  const src = read(WRAPPER);
  assert.match(src, /^"use client"/m);
});

test("10.E.3: wrapper imports all 8 actions (4 update + 4 archive)", () => {
  const src = read(WRAPPER);
  for (const fn of [
    "updateOwnerAction",
    "archiveOwnerAction",
    "updateShareAction",
    "archiveShareAction",
    "updateOwnerStayPolicyAction",
    "archiveOwnerStayPolicyAction",
    "updateEquivalenceGroupAction",
    "archiveEquivalenceGroupAction",
  ]) {
    assert.ok(src.includes(fn), `wrapper must import ${fn}`);
  }
});

test("10.E.3: wrapper handles 4 entity kinds via discriminated `kind` prop", () => {
  const src = read(WRAPPER);
  assert.match(
    src,
    /OwnersEntityKind\s*=\s*\|?\s*"owner"\s*\|\s*"share"\s*\|\s*"policy"\s*\|\s*"equivalence_group"/,
  );
});

test("10.E.3: wrapper composes 10.D primitives (RowActionsMenu + EntityFormModal + ArchiveConfirmDialog)", () => {
  const src = read(WRAPPER);
  assert.match(src, /RowActionsMenu/);
  assert.match(src, /EntityFormModal/);
  assert.match(src, /ArchiveConfirmDialog/);
});

test("10.E.3: wrapper merges full row + edits + appends id to FormData", () => {
  const src = read(WRAPPER);
  assert.match(
    src,
    /const\s+merged[\s\S]{0,80}\.\.\.row\.values[\s\S]{0,40}\.\.\.values/,
  );
  assert.match(src, /fd\.append\("id",\s*row\.id\)/);
});

test("10.E.3: archive label adapts per entity (share -> 'End share', others -> 'Archive')", () => {
  const src = read(WRAPPER);
  // The conditional rendering for share's archive label.
  assert.match(src, /kind === "share"\s*\?\s*"End share"\s*:\s*"Archive"/);
});

// ============================================================================
// Page wiring
// ============================================================================

const PAGES: Array<{
  path: string;
  kind: "owner" | "share" | "policy" | "equivalence_group";
}> = [
  { path: "src/app/(dashboard)/dashboard/owners/page.tsx", kind: "owner" },
  { path: "src/app/(dashboard)/dashboard/shares/page.tsx", kind: "share" },
  {
    path: "src/app/(dashboard)/dashboard/owner-stays/policies/page.tsx",
    kind: "policy",
  },
  {
    path: "src/app/(dashboard)/dashboard/owner-stays/equivalence-groups/page.tsx",
    kind: "equivalence_group",
  },
];

test("10.E.3: each list page imports OwnersRowActions", () => {
  for (const p of PAGES) {
    const src = read(p.path);
    assert.match(
      src,
      /import\s*\{\s*OwnersRowActions\s*\}\s*from\s*"@\/components\/dashboard\/owners\/owners-row-actions"/,
      `${p.path} missing OwnersRowActions import`,
    );
  }
});

test("10.E.3: each list page uses NoItemsYet for empty state", () => {
  for (const p of PAGES) {
    const src = read(p.path);
    assert.match(src, /<NoItemsYet/, `${p.path} must render <NoItemsYet>`);
  }
});

test("10.E.3: each list page renders OwnersRowActions with the correct `kind`", () => {
  for (const p of PAGES) {
    const src = read(p.path);
    assert.match(
      src,
      new RegExp(`<OwnersRowActions[\\s\\S]{0,400}kind="${p.kind}"`),
      `${p.path} must render <OwnersRowActions kind="${p.kind}">`,
    );
  }
});

test("10.E.3: equivalence-groups page surfaces the menu in the Section action slot", () => {
  const src = read(PAGES[3]!.path);
  // The Section's `action` prop should carry an OwnersRowActions instance.
  assert.match(
    src,
    /<Section[\s\S]{0,300}action=\{[\s\S]{0,400}<OwnersRowActions/,
  );
});

// ============================================================================
// Phase 10.E.3 closure
// ============================================================================

test("Phase 10.E.3: decisions doc shipped", () => {
  assert.ok(exists("tmp/stage-10-e-3-decisions.md"));
});
