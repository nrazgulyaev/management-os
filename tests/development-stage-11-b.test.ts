/**
 * Stage 11.B — Field PWA deepening (10.K.3 carry-over) acceptance tests.
 *
 * 11.B.1 — Migration 0093: villas.coordinates jsonb (nullable). PG18
 *          dryrun verified: column shape correct, JSONB accepts the
 *          {lat, lng, accuracy_m, source} contract, rollback clean.
 * 11.B.2 — FieldCaptureBlock client component wraps Stage 10.D
 *          <PhotoCapture> + <GeoCheckIn> over the Stage 5.I IndexedDB
 *          offline queue. Photos go straight to local storage tagged
 *          with taskId + most-recent geo fix; service-worker
 *          background-sync drains them when online.
 * 11.B.3 — /field/tasks/[id] adds a server-side getVillaAnchor() lookup
 *          + renders the new capture block alongside the existing
 *          AttachmentUploader (coexistence, not replacement).
 *
 * VoiceNote integration deferred per launch-prompt scope hint.
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

const MIGRATION = "drizzle/0093_villas_coordinates.sql";
const PROJECTS_SCHEMA = "src/lib/db/schema/projects.ts";
const OFFLINE_QUEUE = "src/lib/development/client/offline-queue.ts";
const CAPTURE_BLOCK = "src/components/field/field-capture-block.tsx";
const TASK_DETAIL = "src/app/(field)/field/tasks/[id]/page.tsx";
const DECISIONS_DOC = "tmp/stage-11-b-decisions.md";

// ============================================================================
// 11.B.1 — Migration + Drizzle schema
// ============================================================================

test("11.B.1 — migration 0093 file shipped with the right ALTER", () => {
  assert.ok(exists(MIGRATION));
  const src = read(MIGRATION);
  assert.match(src, /ADD COLUMN coordinates jsonb/);
  // No NOT NULL — column is intentionally optional (existing villas
  // don't get coordinates auto-populated).
  assert.doesNotMatch(
    src,
    /coordinates jsonb NOT NULL/,
    "coordinates must remain nullable",
  );
  // COMMENT documents the shape contract.
  assert.match(src, /COMMENT ON COLUMN villas\.coordinates/);
  assert.match(src, /lat.*lng.*accuracy_m.*source/);
});

test("11.B.1 — Drizzle schema gains coordinates field", () => {
  const src = read(PROJECTS_SCHEMA);
  assert.match(src, /coordinates:\s*jsonb\("coordinates"\)/);
  assert.match(src, /Stage 11\.B\.1/);
});

// ============================================================================
// 11.B.2 — Offline queue + FieldCaptureBlock
// ============================================================================

test("11.B.2 — offline-queue OfflinePhoto.metadata gains taskId + geo fields", () => {
  const src = read(OFFLINE_QUEUE);
  assert.match(src, /taskId\?:\s*string/);
  assert.match(
    src,
    /geo\?:\s*\{\s*lat:\s*number;\s*lng:\s*number;\s*accuracy_m:\s*number/,
  );
  // Extension is documented (Stage 11.B.2).
  assert.match(src, /Stage 11\.B\.2/);
});

test("11.B.2 — FieldCaptureBlock client component shipped", () => {
  assert.ok(exists(CAPTURE_BLOCK));
  const src = read(CAPTURE_BLOCK);
  assert.match(src, /^"use client"/m);
  assert.match(src, /export function FieldCaptureBlock/);
});

test("11.B.2 — FieldCaptureBlock wires PhotoCapture + GeoCheckIn from 10.D primitives barrel", () => {
  const src = read(CAPTURE_BLOCK);
  assert.match(src, /from "@\/components\/ui\/primitives"/);
  assert.match(src, /\bPhotoCapture\b/);
  assert.match(src, /\bGeoCheckIn\b/);
  // CapturedPhoto + GeoFix types imported (typed handlers).
  assert.match(src, /CapturedPhoto/);
  assert.match(src, /GeoFix/);
});

test("11.B.2 — FieldCaptureBlock queues photos via queueOfflinePhoto + tags taskId/villaId/geo", () => {
  const src = read(CAPTURE_BLOCK);
  assert.match(src, /queueOfflinePhoto\(/);
  assert.match(
    src,
    /from "@\/lib\/development\/client\/offline-queue"/,
  );
  // Metadata payload includes taskId + villaId + geo.
  assert.match(src, /taskId,/);
  assert.match(src, /villaId:\s*villaId\s*\?\?\s*undefined/);
  assert.match(src, /geo:\s*lastFix/);
});

test("11.B.2 — FieldCaptureBlock falls back gracefully when villa has no coordinates", () => {
  const src = read(CAPTURE_BLOCK);
  // Conditional rendering: GeoCheckIn only when anchor present.
  assert.match(
    src,
    /villaAnchor\s*\?\s*\(\s*<GeoCheckIn/,
  );
  // Friendly fallback copy mentions "not configured".
  assert.match(src, /not configured/i);
});

test("11.B.2 — FieldCaptureBlock surfaces online/offline + queue depth in the header", () => {
  const src = read(CAPTURE_BLOCK);
  assert.match(src, /navigator\.onLine/);
  // Tracks queued count + renders "Offline · X queued, will sync"
  assert.match(src, /queued/);
  assert.match(src, /Offline.*queued.*sync/);
});

test("11.B.2 — FieldCaptureBlock requests background-sync on each capture (best-effort)", () => {
  const src = read(CAPTURE_BLOCK);
  assert.match(src, /requestBackgroundSync\(\)/);
  // Wrapped in try-catch so unsupported browsers don't crash the flow.
  assert.match(src, /try\s*\{\s*await requestBackgroundSync/);
});

// ============================================================================
// 11.B.3 — Task detail wiring
// ============================================================================

test("11.B.3 — task detail page imports FieldCaptureBlock + getVillaAnchor", () => {
  const src = read(TASK_DETAIL);
  assert.match(src, /import \{ FieldCaptureBlock \}/);
  assert.match(src, /async function getVillaAnchor/);
});

test("11.B.3 — getVillaAnchor coerces villas.coordinates jsonb to typed lat/lng or null", () => {
  const src = read(TASK_DETAIL);
  assert.match(src, /coordinates: villas\.coordinates/);
  // Type guard: rejects rows with missing / non-number lat or lng.
  assert.match(src, /typeof c\.lat !== "number"/);
  assert.match(src, /typeof c\.lng !== "number"/);
});

test("11.B.3 — task detail renders FieldCaptureBlock above the existing AttachmentUploader", () => {
  const src = read(TASK_DETAIL);
  assert.match(
    src,
    /<FieldCaptureBlock\s+taskId=\{task\.id\}/,
    "must render the new capture block",
  );
  // Existing AttachmentUploader still present (coexistence).
  assert.match(
    src,
    /<AttachmentUploader\s+target="task"/,
    "AttachmentUploader retained — both surfaces coexist",
  );
});

test("11.B.3 — capture block + uploader are both gated on canUpload permission", () => {
  const src = read(TASK_DETAIL);
  assert.match(src, /canUpload/);
  // Both blocks live inside `{canUpload && (...)}` blocks.
  const matches = src.match(/canUpload && \(/g) ?? [];
  assert.ok(
    matches.length >= 2,
    `expected ≥2 canUpload guards (capture block + uploader), got ${matches.length}`,
  );
});

// ============================================================================
// Decisions doc
// ============================================================================

test("11.B — decisions doc shipped + acceptance gate present", () => {
  assert.ok(exists(DECISIONS_DOC));
  const doc = read(DECISIONS_DOC);
  assert.match(doc, /STAGE 11 \/ PHASE 11\.B ACCEPTED/);
  // VoiceNote deferral documented.
  assert.match(doc, /VoiceNote.*defer/i);
});
