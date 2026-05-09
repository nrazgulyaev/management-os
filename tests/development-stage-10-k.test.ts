/**
 * Stage 10.K — Mobile + PWA polish acceptance tests.
 *
 * 10.K.1 — FieldShell mounts the PWA stack (ServiceWorkerRegister +
 *          OfflineIndicator + InstallPrompt) — same components dev-os
 *          shell uses. Touch targets bumped to ≥ 44px (Apple HIG +
 *          Android Material spec minimum).
 * 10.K.2 — /field task list refactored: inline custom card → 10.D
 *          <MobileTaskCard> with status / when / meta / action label.
 * 10.K.3 — PhotoCapture / GeoCheckIn integration into task detail —
 *          DEFERRED. The existing AttachmentUploader + TaskActionBar
 *          flow works; the integration is a bigger refactor than the
 *          10.K window allows. Documented in decisions doc as carry-
 *          over for a future field-deepening sub-phase.
 * 10.K.4 — public/manifest.json gains the field-app shortcut
 *          (`/field`) so installed PWA users can long-press the icon
 *          and jump straight to today's tasks. Manifest name +
 *          start_url generalized away from dev-os only.
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

const FIELD_SHELL = "src/components/layout/field-shell.tsx";
const FIELD_HOME = "src/app/(field)/field/page.tsx";
const MANIFEST = "public/manifest.json";

// ============================================================================
// 10.K.1 — FieldShell PWA wiring
// ============================================================================

test("10.K.1 — FieldShell mounts ServiceWorkerRegister", () => {
  const src = read(FIELD_SHELL);
  assert.match(src, /ServiceWorkerRegister/);
  assert.match(src, /from "@\/components\/development\/pwa\/service-worker-register"/);
  // Mounted in the rendered tree, not just imported.
  assert.match(src, /<ServiceWorkerRegister \/>/);
});

test("10.K.1 — FieldShell mounts InstallPrompt", () => {
  const src = read(FIELD_SHELL);
  assert.match(src, /InstallPrompt/);
  assert.match(src, /from "@\/components\/development\/pwa\/install-prompt"/);
  assert.match(src, /<InstallPrompt \/>/);
});

test("10.K.1 — FieldShell mounts OfflineIndicator in the header", () => {
  const src = read(FIELD_SHELL);
  assert.match(src, /OfflineIndicator/);
  assert.match(src, /from "@\/components\/development\/pwa\/offline-indicator"/);
  assert.match(src, /<OfflineIndicator \/>/);
});

test("10.K.1 — FieldShell touch targets ≥ 44px (Apple HIG / Material spec)", () => {
  const src = read(FIELD_SHELL);
  // Header buttons (notifications + profile) bumped from h-9/w-9 to h-11/w-11.
  assert.match(
    src,
    /aria-label="Notifications"[\s\S]{0,150}h-11 w-11/,
    "notifications button must have h-11 w-11 (44px) touch target",
  );
  assert.match(
    src,
    /aria-label="Profile"[\s\S]{0,150}h-11 w-11/,
    "profile button must have h-11 w-11 (44px) touch target",
  );
  // Bottom-nav links carry min-h-[44px] / min-w-[44px].
  assert.match(src, /min-h-\[44px\] min-w-\[44px\]/);
});

// ============================================================================
// 10.K.2 — Field task list uses MobileTaskCard
// ============================================================================

test("10.K.2 — /field home imports MobileTaskCard from 10.D primitives", () => {
  const src = read(FIELD_HOME);
  assert.match(src, /MobileTaskCard/);
  assert.match(src, /from "@\/components\/ui\/primitives"/);
  assert.match(src, /MobileTaskStatus/);
});

test("10.K.2 — /field home renders MobileTaskCard for each task", () => {
  const src = read(FIELD_HOME);
  assert.match(
    src,
    /<MobileTaskCard\s+key=\{t\.id\}/,
    "must render <MobileTaskCard> per task in the group",
  );
});

test("10.K.2 — task status mapping retains all 4 mobile statuses", () => {
  const src = read(FIELD_HOME);
  assert.match(src, /toMobileStatus/);
  // All 4 mobile statuses must appear in the mapping.
  for (const status of ['"complete"', '"in_progress"', '"blocked"', '"pending"']) {
    assert.ok(src.includes(status), `mapping must produce ${status}`);
  }
});

test("10.K.2 — task action label adapts to status (Continue / Review / Open)", () => {
  const src = read(FIELD_HOME);
  assert.match(src, /actionLabelFor/);
  for (const label of ['"Continue"', '"Review"', '"Open"']) {
    assert.ok(src.includes(label), `actionLabelFor must produce ${label}`);
  }
});

test("10.K.2 — old inline custom-card markup replaced (no ChevronRight + TaskStatusPill in this file)", () => {
  const src = read(FIELD_HOME);
  assert.doesNotMatch(
    src,
    /<TaskStatusPill\b/,
    "TaskStatusPill (legacy custom-card sub-component) must be gone",
  );
  assert.doesNotMatch(
    src,
    /<ChevronRight\b/,
    "ChevronRight (legacy chevron in custom card) must be gone",
  );
});

// ============================================================================
// 10.K.4 — Manifest polish
// ============================================================================

test("10.K.4 — manifest name + start_url no longer dev-os-only", () => {
  const src = read(MANIFEST);
  const parsed = JSON.parse(src);
  assert.equal(parsed.name, "Arconique");
  assert.equal(
    parsed.start_url,
    "/dashboard",
    "start_url must point at the Mgmt OS landing (more general than the prior dev-os deep link)",
  );
});

test("10.K.4 — manifest declares the /field shortcut for the field PWA", () => {
  const src = read(MANIFEST);
  const parsed = JSON.parse(src);
  const field = parsed.shortcuts.find(
    (s: { url: string }) => s.url === "/field",
  );
  assert.ok(field, "manifest must declare a /field shortcut");
  assert.match(field.name, /Today/i);
});

test("10.K.4 — manifest preserves Site Supervisor + Quick Photo shortcuts (dev-os)", () => {
  const src = read(MANIFEST);
  const parsed = JSON.parse(src);
  const urls = parsed.shortcuts.map((s: { url: string }) => s.url);
  assert.ok(urls.includes("/development-os/cabinets/site-supervisor"));
  assert.ok(urls.includes("/development-os/operations/site-reports/quick-photo"));
});

test("10.K.4 — manifest declares the front-office today shortcut (Mgmt OS)", () => {
  const src = read(MANIFEST);
  const parsed = JSON.parse(src);
  const front = parsed.shortcuts.find(
    (s: { url: string }) => s.url === "/dashboard/front-office",
  );
  assert.ok(front, "manifest must declare a /dashboard/front-office shortcut");
});

test("10.K.4 — manifest icon set unchanged (8 sizes, 192 + 512 maskable)", () => {
  const src = read(MANIFEST);
  const parsed = JSON.parse(src);
  assert.equal(parsed.icons.length, 8, "manifest must declare 8 icon sizes");
  const maskable = parsed.icons.filter((i: { purpose?: string }) =>
    i.purpose?.includes("maskable"),
  );
  assert.ok(maskable.length >= 2, "≥ 2 maskable icons (192 + 512)");
});

// ============================================================================
// Decisions doc
// ============================================================================

test("10.K — decisions doc shipped + acceptance gate present", () => {
  assert.ok(exists("tmp/stage-10-k-decisions.md"));
  const doc = read("tmp/stage-10-k-decisions.md");
  assert.match(doc, /STAGE 10 \/ PHASE 10\.K ACCEPTED/);
  // Carry-over for the deferred 10.K.3 captured.
  assert.match(doc, /PhotoCapture|GeoCheckIn|10\.K\.3/);
});
