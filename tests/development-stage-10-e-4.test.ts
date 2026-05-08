/**
 * Stage 10.E.4 — Villa-guides CRUD acceptance tests.
 *
 * The audit (operator-flagged) found 3 villa-guide list pages with
 * "Add but no Edit/Delete":
 *   /dashboard/villa-guides/sections
 *   /dashboard/villa-guides/emergency-contacts
 *   /dashboard/villa-guides/neighborhood
 *
 * All three already had `upsert*` actions that handle Edit when an
 * `id` is present in FormData. Sections also had `archiveGuideSection`.
 * 10.E.4 added archive actions for the other two (and wifi), then
 * wired the row UI via the new <VillaGuidesRowActions> wrapper.
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

const ACTIONS = "src/features/villa-guides/actions.ts";
const SERVICES = "src/features/villa-guides/services.ts";
const WRAPPER = "src/components/dashboard/villa-guides/villa-guides-row-actions.tsx";

// ============================================================================
// 3 new archive server actions
// ============================================================================

test("10.E.4: 3 new archive actions shipped (contact / place / wifi)", () => {
  const src = read(ACTIONS);
  for (const fn of [
    "archiveEmergencyContactAction",
    "archiveNeighborhoodPlaceAction",
    "archiveWifiCredentialAction",
  ]) {
    assert.match(src, new RegExp(`export async function ${fn}\\b`));
  }
});

test("10.E.4: existing upsert + section actions intact (regression guard)", () => {
  const src = read(ACTIONS);
  for (const fn of [
    "upsertGuideSectionAction",
    "archiveGuideSectionAction",
    "upsertEmergencyContactAction",
    "upsertNeighborhoodPlaceAction",
    "upsertWifiAction",
  ]) {
    assert.match(src, new RegExp(`export async function ${fn}\\b`));
  }
});

test("10.E.4: every new archive action gates on villa_guide.write + soft-deletes", () => {
  const src = read(ACTIONS);
  for (const fn of [
    "archiveEmergencyContactAction",
    "archiveNeighborhoodPlaceAction",
    "archiveWifiCredentialAction",
  ]) {
    const body = src.match(
      new RegExp(`export async function ${fn}\\b[\\s\\S]*?return \\{ ok: true \\};`),
    )?.[0];
    assert.ok(body, `${fn} body not found`);
    assert.match(body!, /requirePermission\("villa_guide\.write"\)/);
    assert.match(body!, /status:\s*"archived"/);
    assert.match(body!, /recordAuditEvent/);
  }
});

test("10.E.4: archive actions return 'not found' when row missing", () => {
  const src = read(ACTIONS);
  for (const fn of [
    "archiveEmergencyContactAction",
    "archiveNeighborhoodPlaceAction",
    "archiveWifiCredentialAction",
  ]) {
    const body = src.match(
      new RegExp(`export async function ${fn}\\b[\\s\\S]*?return \\{ ok: true \\};`),
    )?.[0];
    assert.ok(body);
    assert.match(body!, /if \(!row\)\s*return \{\s*ok:\s*false/);
  }
});

test("10.E.4: each archive action audit-logs the right key", () => {
  const src = read(ACTIONS);
  for (const key of [
    "villa_guide.contact.archive",
    "villa_guide.place.archive",
    "villa_guide.wifi.archive",
  ]) {
    assert.ok(src.includes(`"${key}"`), `audit key ${key} required`);
  }
});

test("10.E.4: each archive action revalidates the canonical list path", () => {
  const src = read(ACTIONS);
  for (const path of [
    "/dashboard/villa-guides/emergency-contacts",
    "/dashboard/villa-guides/neighborhood",
    "/dashboard/villa-guides/wifi",
  ]) {
    assert.ok(
      src.includes(`revalidatePath("${path}")`),
      `revalidatePath ${path} required`,
    );
  }
});

// ============================================================================
// Service-side row shape (extended for edit-modal preserve)
// ============================================================================

test("10.E.4: listEmergencyContactsAdmin returns notesMd (preserves field on edit-merge)", () => {
  const src = read(SERVICES);
  // Row shape must include notesMd so the merge-pattern doesn't null it
  // out when the edit modal omits it from user-edit values.
  const block = src.match(
    /export async function listEmergencyContactsAdmin[\s\S]*?return rows\.map[\s\S]*?\}\)\);/,
  )?.[0];
  assert.ok(block, "listEmergencyContactsAdmin body not found");
  assert.match(block!, /notesMd:\s*r\.c\.notesMd/);
});

test("10.E.4: listNeighborhoodAdmin returns description / address / urls / image (preserves on edit-merge)", () => {
  const src = read(SERVICES);
  const block = src.match(
    /export async function listNeighborhoodAdmin[\s\S]*?return rows\.map[\s\S]*?\}\)\);/,
  )?.[0];
  assert.ok(block);
  for (const field of [
    "descriptionMd",
    "address",
    "googleMapsUrl",
    "imageUrl",
  ]) {
    assert.match(
      block!,
      new RegExp(`${field}:\\s*r\\.p\\.${field}`),
      `listNeighborhoodAdmin must return ${field}`,
    );
  }
});

// ============================================================================
// Client wrapper
// ============================================================================

test("10.E.4: VillaGuidesRowActions wrapper exists + is a client component", () => {
  assert.ok(exists(WRAPPER));
  const src = read(WRAPPER);
  assert.match(src, /^"use client"/m);
});

test("10.E.4: wrapper imports all 6 actions (3 upsert + 3 archive)", () => {
  const src = read(WRAPPER);
  for (const fn of [
    "upsertGuideSectionAction",
    "archiveGuideSectionAction",
    "upsertEmergencyContactAction",
    "archiveEmergencyContactAction",
    "upsertNeighborhoodPlaceAction",
    "archiveNeighborhoodPlaceAction",
  ]) {
    assert.ok(src.includes(fn), `wrapper must import ${fn}`);
  }
});

test("10.E.4: wrapper handles 3 entity kinds via discriminated `kind` prop", () => {
  const src = read(WRAPPER);
  assert.match(
    src,
    /VillaGuideEntityKind\s*=\s*"section"\s*\|\s*"contact"\s*\|\s*"place"/,
  );
});

test("10.E.4: section's sectionKey field is disabled on edit (immutable)", () => {
  const src = read(WRAPPER);
  // sectionKey is the stable identifier; lock it on edit.
  assert.match(
    src,
    /name:\s*"sectionKey"[\s\S]{0,200}disabled:\s*true/,
  );
});

test("10.E.4: wrapper composes 10.D primitives + uses merge pattern", () => {
  const src = read(WRAPPER);
  assert.match(src, /RowActionsMenu/);
  assert.match(src, /EntityFormModal/);
  assert.match(src, /ArchiveConfirmDialog/);
  assert.match(
    src,
    /const\s+merged[\s\S]{0,80}\.\.\.row\.values[\s\S]{0,40}\.\.\.values/,
  );
  assert.match(src, /fd\.append\("id",\s*row\.id\)/);
});

// ============================================================================
// Page wiring
// ============================================================================

const PAGES: Array<{
  path: string;
  kind: "section" | "contact" | "place";
}> = [
  {
    path: "src/app/(dashboard)/dashboard/villa-guides/sections/page.tsx",
    kind: "section",
  },
  {
    path: "src/app/(dashboard)/dashboard/villa-guides/emergency-contacts/page.tsx",
    kind: "contact",
  },
  {
    path: "src/app/(dashboard)/dashboard/villa-guides/neighborhood/page.tsx",
    kind: "place",
  },
];

test("10.E.4: each list page imports VillaGuidesRowActions + NoItemsYet", () => {
  for (const p of PAGES) {
    const src = read(p.path);
    assert.match(
      src,
      /import\s*\{\s*VillaGuidesRowActions\s*\}\s*from\s*"@\/components\/dashboard\/villa-guides\/villa-guides-row-actions"/,
      `${p.path} missing VillaGuidesRowActions import`,
    );
    assert.match(
      src,
      /import\s*\{[^}]*NoItemsYet[^}]*\}\s*from\s*"@\/components\/ui\/primitives"/,
      `${p.path} missing NoItemsYet import`,
    );
  }
});

test("10.E.4: each list page renders VillaGuidesRowActions with the correct `kind`", () => {
  for (const p of PAGES) {
    const src = read(p.path);
    assert.match(
      src,
      new RegExp(`<VillaGuidesRowActions[\\s\\S]{0,500}kind="${p.kind}"`),
      `${p.path} must render <VillaGuidesRowActions kind="${p.kind}">`,
    );
  }
});

test("10.E.4: each page replaced its handwritten dashed-border empty state with NoItemsYet", () => {
  for (const p of PAGES) {
    const src = read(p.path);
    // The old "border-dashed border-line-soft bg-muted/20" placeholder
    // must be gone from the empty-state branch (could still exist
    // elsewhere, but not as the empty-state copy).
    assert.match(src, /<NoItemsYet/, `${p.path} must use <NoItemsYet>`);
  }
});

// ============================================================================
// Phase 10.E.4 closure
// ============================================================================

test("Phase 10.E.4: decisions doc shipped", () => {
  assert.ok(exists("tmp/stage-10-e-4-decisions.md"));
});
