/**
 * Stage 10.E.5 — Settings + Payments + others CRUD acceptance tests.
 *
 * The audit flagged 5 list pages partial-CRUD (HIGH severity) that
 * map to the "settings / integrations / security / service-fulfilment"
 * cluster. Most had partial action sets:
 *
 *   /dashboard/settings/responsibility-scopes — full CRUD existed
 *   /dashboard/security/cameras                — Edit existed, no archive
 *   /dashboard/payments/providers              — disconnect (= archive),
 *                                                 no edit (crypto)
 *   /dashboard/service-fulfilment/vendors      — full CRUD existed
 *   /dashboard/integrations/calendar-feeds     — archive existed, no edit
 *
 * 10.E.5 added the missing 2 actions and wired all 5 pages via the new
 * <SettingsRowActions> wrapper.
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

const SECURITY_ACTIONS = "src/features/security/actions.ts";
const CALENDAR_ACTIONS = "src/features/integrations/calendar-sync/actions.ts";
const WRAPPER = "src/components/dashboard/settings/settings-row-actions.tsx";

// ============================================================================
// 2 new server actions (camera archive + calendar feed edit)
// ============================================================================

test("10.E.5: archiveSecurityCameraDeviceAction shipped + soft-deletes", () => {
  const src = read(SECURITY_ACTIONS);
  assert.match(src, /export async function archiveSecurityCameraDeviceAction\b/);
  const body = src.match(
    /export async function archiveSecurityCameraDeviceAction\b[\s\S]*?return \{ ok: true \};/,
  )?.[0];
  assert.ok(body);
  assert.match(body!, /requirePermission\("security\.manage"\)/);
  assert.match(body!, /status:\s*"archived"/);
  assert.match(body!, /"security\.camera\.archive"/);
  assert.match(body!, /revalidatePath\("\/dashboard\/security\/cameras"\)/);
});

test("10.E.5: editCalendarFeedAction shipped + uses createCalendarFeedSchema", () => {
  const src = read(CALENDAR_ACTIONS);
  assert.match(src, /export async function editCalendarFeedAction\b/);
  const body = src.match(
    /export async function editCalendarFeedAction\b[\s\S]*?return \{ ok: true \};/,
  )?.[0];
  assert.ok(body);
  assert.match(body!, /requirePermission\("integrations\.write"\)/);
  assert.match(body!, /createCalendarFeedSchema\.safeParse/);
  assert.match(body!, /"integrations\.calendar_feed\.update"/);
  assert.match(body!, /revalidatePath\("\/dashboard\/integrations\/calendar-feeds"\)/);
});

test("10.E.5: existing camera + calendar-feed actions intact (regression guard)", () => {
  const sec = read(SECURITY_ACTIONS);
  for (const fn of [
    "createSecurityCameraDeviceAction",
    "updateSecurityCameraDeviceAction",
  ]) {
    assert.match(sec, new RegExp(`export async function ${fn}\\b`));
  }
  const cal = read(CALENDAR_ACTIONS);
  for (const fn of [
    "createCalendarFeedAction",
    "pauseCalendarFeedAction",
    "resumeCalendarFeedAction",
    "archiveCalendarFeedAction",
  ]) {
    assert.match(cal, new RegExp(`export async function ${fn}\\b`));
  }
});

test("10.E.5: archive returns 'not found' when row missing", () => {
  const sec = read(SECURITY_ACTIONS);
  const body = sec.match(
    /export async function archiveSecurityCameraDeviceAction\b[\s\S]*?return \{ ok: true \};/,
  )?.[0];
  assert.ok(body);
  assert.match(body!, /if \(!row\)\s*return \{\s*ok:\s*false/);
});

// ============================================================================
// Client wrapper
// ============================================================================

test("10.E.5: SettingsRowActions wrapper exists + is a client component", () => {
  assert.ok(exists(WRAPPER));
  const src = read(WRAPPER);
  assert.match(src, /^"use client"/m);
});

test("10.E.5: wrapper handles 5 entity kinds", () => {
  const src = read(WRAPPER);
  assert.match(
    src,
    /SettingsEntityKind\s*=\s*\|?\s*"scope"\s*\|\s*"camera"\s*\|\s*"payment_connection"\s*\|\s*"service_vendor"\s*\|\s*"calendar_feed"/,
  );
});

test("10.E.5: wrapper imports all 9 actions across 5 features", () => {
  const src = read(WRAPPER);
  for (const fn of [
    "editResponsibilityScopeAction",
    "archiveResponsibilityScopeAction",
    "updateSecurityCameraDeviceAction",
    "archiveSecurityCameraDeviceAction",
    "disconnectPaymentConnectionAction",
    "updateServiceVendorAction",
    "archiveServiceVendorAction",
    "editCalendarFeedAction",
    "archiveCalendarFeedAction",
  ]) {
    assert.ok(src.includes(fn), `wrapper must import ${fn}`);
  }
});

test("10.E.5: payment_connection has Archive but no Edit (credentials require crypto)", () => {
  const src = read(WRAPPER);
  // The payment_connection branch returns an empty fields[] which suppresses
  // the Edit menu entry — only Archive remains.
  assert.match(
    src,
    /kind === "payment_connection"[\s\S]{0,200}return \[\];/,
  );
  // Archive label adapts to "Disconnect" for payment_connection.
  assert.match(
    src,
    /kind === "payment_connection"\s*\?\s*"Disconnect"\s*:\s*"Archive"/,
  );
});

test("10.E.5: wrapper composes 10.D primitives + uses merge pattern", () => {
  const src = read(WRAPPER);
  assert.match(src, /RowActionsMenu/);
  assert.match(src, /EntityFormModal/);
  assert.match(src, /ArchiveConfirmDialog/);
  assert.match(
    src,
    /const\s+merged[\s\S]{0,80}\.\.\.row\.values[\s\S]{0,40}\.\.\.values/,
  );
});

test("10.E.5: disconnectPaymentConnectionAction called with object arg (not FormData)", () => {
  const src = read(WRAPPER);
  // disconnectPaymentConnectionAction takes { connectionId, reason? } —
  // not the FormData pattern of other actions.
  assert.match(
    src,
    /disconnectPaymentConnectionAction\(\{\s*connectionId:\s*row\.id\s*\}\)/,
  );
});

// ============================================================================
// Page wiring
// ============================================================================

const PAGES: Array<{
  path: string;
  kind:
    | "scope"
    | "camera"
    | "payment_connection"
    | "service_vendor"
    | "calendar_feed";
}> = [
  {
    path: "src/app/(dashboard)/dashboard/settings/responsibility-scopes/page.tsx",
    kind: "scope",
  },
  {
    path: "src/app/(dashboard)/dashboard/security/cameras/page.tsx",
    kind: "camera",
  },
  {
    path: "src/app/(dashboard)/dashboard/payments/providers/page.tsx",
    kind: "payment_connection",
  },
  {
    path: "src/app/(dashboard)/dashboard/service-fulfilment/vendors/page.tsx",
    kind: "service_vendor",
  },
  {
    path: "src/app/(dashboard)/dashboard/integrations/calendar-feeds/page.tsx",
    kind: "calendar_feed",
  },
];

test("10.E.5: each page imports SettingsRowActions + NoItemsYet", () => {
  for (const p of PAGES) {
    const src = read(p.path);
    assert.match(
      src,
      /import\s*\{\s*SettingsRowActions\s*\}\s*from\s*"@\/components\/dashboard\/settings\/settings-row-actions"/,
      `${p.path} missing SettingsRowActions import`,
    );
    assert.match(
      src,
      /import\s*\{[^}]*NoItemsYet[^}]*\}\s*from\s*"@\/components\/ui\/primitives"/,
      `${p.path} missing NoItemsYet import`,
    );
  }
});

test("10.E.5: each page renders SettingsRowActions with the correct `kind`", () => {
  for (const p of PAGES) {
    const src = read(p.path);
    assert.match(
      src,
      new RegExp(`<SettingsRowActions[\\s\\S]{0,500}kind="${p.kind}"`),
      `${p.path} must render <SettingsRowActions kind="${p.kind}">`,
    );
  }
});

test("10.E.5: scopes page replaced ScopeArchiveButton with SettingsRowActions", () => {
  const src = read(PAGES[0]!.path);
  // Old button gone.
  assert.ok(
    !/ScopeArchiveButton/.test(src),
    "ScopeArchiveButton must be removed from scopes page",
  );
});

// ============================================================================
// Phase 10.E.5 closure
// ============================================================================

test("Phase 10.E.5: decisions doc shipped", () => {
  assert.ok(exists("tmp/stage-10-e-5-decisions.md"));
});
