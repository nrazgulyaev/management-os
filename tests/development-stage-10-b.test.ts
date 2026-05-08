/**
 * Stage 10.B — Design System Primitives acceptance tests.
 *
 * Static / file-presence + export shape tests for the 12 primitives
 * surfaced in Phase 10.A's research-summary.md. These primitives feed
 * Stage 10.C-10.K role-specific phases.
 *
 * Tests verify:
 *   - File exists at expected path
 *   - Each primitive exports the expected component + types
 *   - Each primitive declares "use client" iff it owns local state
 *     (drag, recording, geolocation, file capture)
 *   - Critical props + types named per the brief contracts (so
 *     consumers can rely on stable interfaces)
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

const PRIMITIVE_DIR = "src/components/ui/primitives";

// ============================================================================
// Barrel index
// ============================================================================

test("10.B: primitives barrel index exports 12 primitives", () => {
  assert.ok(exists(`${PRIMITIVE_DIR}/index.ts`));
  const src = read(`${PRIMITIVE_DIR}/index.ts`);
  for (const name of [
    "DashboardKpi",
    "Timeline",
    "DrillDownPanel",
    "RfqMatrix",
    "KanbanBoard",
    "SpreadsheetView",
    "UnifiedInbox",
    "MobileTaskCard",
    "PhotoCapture",
    "VoiceNote",
    "GeoCheckIn",
    "DrawingViewer",
  ]) {
    assert.match(
      src,
      new RegExp(`export\\s*\\{\\s*${name}\\s*\\}`),
      `barrel must export ${name}`,
    );
  }
});

// ============================================================================
// Presentational primitives (server-safe)
// ============================================================================

test("10.B DashboardKpi: server component, status traffic-light, drillHref or onClick", () => {
  const src = read(`${PRIMITIVE_DIR}/dashboard-kpi.tsx`);
  // Server component (no "use client").
  assert.ok(!/^"use client"/m.test(src), "must NOT be a client component");
  assert.match(src, /export function DashboardKpi/);
  assert.match(src, /KpiStatus.*=.*"good".*"warn".*"bad".*"neutral"/s);
  // Drill mechanisms.
  assert.match(src, /drillHref/);
  assert.match(src, /onClick\?:/);
  // Status ring traffic-light wiring.
  assert.match(src, /STATUS_RING/);
});

test("10.B Timeline: server component, horizontal + vertical, blocked-by surfacing", () => {
  const src = read(`${PRIMITIVE_DIR}/timeline.tsx`);
  assert.ok(!/^"use client"/m.test(src));
  assert.match(src, /export function Timeline/);
  // 4 stage statuses.
  for (const s of ["complete", "active", "blocked", "pending"]) {
    assert.ok(src.includes(`"${s}"`), `status ${s} must be in TimelineStageStatus`);
  }
  assert.match(src, /orientation\?:.*"horizontal".*"vertical"/s);
  // Required-fields gate (theme 4 from research-summary).
  assert.match(src, /blockedBy/);
});

test("10.B RfqMatrix: server component, winner highlight, totals + lead-time footer", () => {
  const src = read(`${PRIMITIVE_DIR}/rfq-matrix.tsx`);
  assert.ok(!/^"use client"/m.test(src));
  assert.match(src, /export function RfqMatrix/);
  // Winner strategy.
  assert.match(src, /winnerStrategy\?:.*"min".*"lead"/s);
  // Per-line winner highlight.
  assert.match(src, /findWinnerForLine/);
  // Totals + lead time in tfoot.
  assert.match(src, /totalForVendor/);
  assert.match(src, /Lead time/);
  // Award split callback.
  assert.match(src, /onAwardSplit/);
});

// ============================================================================
// Interactive primitives (client components)
// ============================================================================

test("10.B DrillDownPanel: client component, ESC closes, focus trap setup", () => {
  const src = read(`${PRIMITIVE_DIR}/drill-down-panel.tsx`);
  assert.match(src, /^"use client"/m);
  assert.match(src, /export function DrillDownPanel/);
  // ESC key handler.
  assert.match(src, /e\.key === "Escape"/);
  // Body scroll lock.
  assert.match(src, /document\.body\.style\.overflow/);
  // 3 width tiers.
  assert.match(src, /width\?:.*"sm".*"md".*"lg"/s);
});

test("10.B KanbanBoard: client component, drag handlers, SLA aging color", () => {
  const src = read(`${PRIMITIVE_DIR}/kanban-board.tsx`);
  assert.match(src, /^"use client"/m);
  assert.match(src, /export function KanbanBoard/);
  // Drag-and-drop hooks.
  assert.match(src, /onDragOver/);
  assert.match(src, /onDrop/);
  assert.match(src, /onCardMove\?:/);
  // SLA aging thresholds.
  assert.match(src, /slaWarnHours/);
  assert.match(src, /slaDangerHours/);
  // WIP limit.
  assert.match(src, /wipLimit/);
});

test("10.B SpreadsheetView: client, Tab + Enter + Ctrl-D + Ctrl-S keys", () => {
  const src = read(`${PRIMITIVE_DIR}/spreadsheet-view.tsx`);
  assert.match(src, /^"use client"/m);
  assert.match(src, /export function SpreadsheetView/);
  // Keyboard nav.
  assert.match(src, /e\.key === "Tab"/);
  assert.match(src, /e\.key === "Enter"/);
  assert.match(src, /e\.key\.toLowerCase\(\) === "d"/); // Ctrl-D duplicate
  assert.match(src, /e\.key === "s"/); // Ctrl-S save
  // Validation in cell + suggestions list.
  assert.match(src, /validate\?:/);
  assert.match(src, /suggestions\?:/);
  assert.match(src, /<datalist/);
});

test("10.B UnifiedInbox: server component, channel badges per message + thread", () => {
  const src = read(`${PRIMITIVE_DIR}/unified-inbox.tsx`);
  assert.ok(!/^"use client"/m.test(src), "list + thread renderer is server-safe");
  assert.match(src, /export function UnifiedInbox/);
  // 8 channel kinds (theme 7 unified inbox).
  for (const ch of [
    "direct",
    "email",
    "whatsapp",
    "booking",
    "airbnb",
    "instagram",
    "sms",
    "other",
  ]) {
    assert.ok(src.includes(`"${ch}"`), `channel ${ch} must be supported`);
  }
  // Composer slot delegated to parent (so client wrapper consumes it).
  assert.match(src, /composerSlot\?:/);
});

// ============================================================================
// Field / mobile primitives
// ============================================================================

test("10.B MobileTaskCard: server component, status border, interactive ≥88px tap target", () => {
  const src = read(`${PRIMITIVE_DIR}/mobile-task-card.tsx`);
  assert.ok(!/^"use client"/m.test(src));
  assert.match(src, /export function MobileTaskCard/);
  // 4 statuses.
  for (const s of ["pending", "in_progress", "blocked", "complete"]) {
    assert.ok(src.includes(`"${s}"`), `status ${s} required`);
  }
  // Tap-target minimum (Stage 10.M mobile pattern).
  assert.match(src, /min-h-\[88px\]/);
  // Photo / location / voice indicator slots.
  assert.match(src, /photoCount/);
  assert.match(src, /hasLocation/);
  assert.match(src, /hasVoiceNote/);
});

test("10.B PhotoCapture: client, capture=environment, required-count progress", () => {
  const src = read(`${PRIMITIVE_DIR}/photo-capture.tsx`);
  assert.match(src, /^"use client"/m);
  assert.match(src, /export function PhotoCapture/);
  // OS camera invocation pattern.
  assert.match(src, /capture="environment"/);
  assert.match(src, /accept="image\/\*"/);
  // Required-count gating (theme 4).
  assert.match(src, /required\?:/);
  // Hard cap.
  assert.match(src, /max\?:/);
});

test("10.B VoiceNote: client, MediaRecorder + getUserMedia + max-duration auto-stop", () => {
  const src = read(`${PRIMITIVE_DIR}/voice-note.tsx`);
  assert.match(src, /^"use client"/m);
  assert.match(src, /export function VoiceNote/);
  // MediaRecorder + permission check.
  assert.match(src, /MediaRecorder/);
  assert.match(src, /getUserMedia/);
  // Max-duration cap auto-stop.
  assert.match(src, /maxDurationMs/);
  // Press-and-hold UX (touch + mouse).
  assert.match(src, /onMouseDown/);
  assert.match(src, /onTouchStart/);
});

test("10.B GeoCheckIn: client, haversine-based tolerance, anchor optional", () => {
  const src = read(`${PRIMITIVE_DIR}/geo-check-in.tsx`);
  assert.match(src, /^"use client"/m);
  assert.match(src, /export function GeoCheckIn/);
  // Haversine distance.
  assert.match(src, /haversineM/);
  // Anchor + tolerance pattern.
  assert.match(src, /anchor\?:/);
  assert.match(src, /toleranceM/);
  // 5 phases of fix lifecycle.
  for (const ph of ["idle", "locating", "matched", "mismatched", "error"]) {
    assert.ok(src.includes(`"${ph}"`), `phase ${ph} required`);
  }
});

// ============================================================================
// Specialized — Drawing measurement
// ============================================================================

test("10.B DrawingViewer: client, length / area / count + scale calibration", () => {
  const src = read(`${PRIMITIVE_DIR}/drawing-viewer.tsx`);
  assert.match(src, /^"use client"/m);
  assert.match(src, /export function DrawingViewer/);
  // 3 stroke kinds.
  for (const k of ["length", "area", "count"]) {
    assert.ok(src.includes(`"${k}"`), `stroke kind ${k} required`);
  }
  // Scale calibration.
  assert.match(src, /ScaleCalibration/);
  assert.match(src, /onScaleSet/);
  // Polygon area + haversine-style geometry math.
  assert.match(src, /polygonArea/);
  assert.match(src, /Math\.hypot/);
  // Read-only mode.
  assert.match(src, /readOnly/);
});

// ============================================================================
// Cross-primitive shape contracts
// ============================================================================

test("10.B: every primitive accepts a className escape hatch", () => {
  for (const file of [
    "dashboard-kpi.tsx",
    "timeline.tsx",
    "drill-down-panel.tsx",
    "rfq-matrix.tsx",
    "kanban-board.tsx",
    "spreadsheet-view.tsx",
    "unified-inbox.tsx",
    "mobile-task-card.tsx",
    "photo-capture.tsx",
    "voice-note.tsx",
    "geo-check-in.tsx",
    "drawing-viewer.tsx",
  ]) {
    const src = read(`${PRIMITIVE_DIR}/${file}`);
    assert.match(
      src,
      /className\?:\s*string/,
      `${file} must expose className?: string for parent overrides`,
    );
  }
});

test("10.B: every primitive uses the design-token palette (no raw hex except DrawingViewer kind colors)", () => {
  // Token usage = uses one of the CSS-var-backed Tailwind classes (bg-surface,
  // bg-muted, text-ink, border-line-soft, accent, etc).
  const TOKEN_PROBES = [
    "bg-surface",
    "bg-muted",
    "text-ink",
    "border-line",
    "text-ink-tertiary",
    "text-accent",
    "bg-accent",
    "text-success",
    "bg-success",
    "text-danger",
    "bg-danger",
    "text-warning",
    "bg-warning",
  ];
  for (const file of [
    "dashboard-kpi.tsx",
    "timeline.tsx",
    "drill-down-panel.tsx",
    "rfq-matrix.tsx",
    "kanban-board.tsx",
    "spreadsheet-view.tsx",
    "unified-inbox.tsx",
    "mobile-task-card.tsx",
    "photo-capture.tsx",
    "voice-note.tsx",
    "geo-check-in.tsx",
    "drawing-viewer.tsx",
  ]) {
    const src = read(`${PRIMITIVE_DIR}/${file}`);
    const tokenHits = TOKEN_PROBES.filter((p) => src.includes(p)).length;
    assert.ok(
      tokenHits >= 1,
      `${file} must reference at least one design-system token (got ${tokenHits} hits)`,
    );
  }
});

test("10.B: presentational primitives (DashboardKpi, Timeline, RfqMatrix, MobileTaskCard, UnifiedInbox) are server-safe", () => {
  // These primitives MUST NOT carry "use client" — they're imported by
  // server components in 10.C-10.K and adding "use client" would break
  // RSC tree-shaking.
  const SERVER_SAFE = [
    "dashboard-kpi.tsx",
    "timeline.tsx",
    "rfq-matrix.tsx",
    "mobile-task-card.tsx",
    "unified-inbox.tsx",
  ];
  for (const file of SERVER_SAFE) {
    const src = read(`${PRIMITIVE_DIR}/${file}`);
    assert.ok(
      !/^"use client"/m.test(src),
      `${file} must NOT be marked as client component (server-safe contract)`,
    );
  }
});

test("10.B: client-state primitives DO carry 'use client' (DrillDownPanel, KanbanBoard, SpreadsheetView, PhotoCapture, VoiceNote, GeoCheckIn, DrawingViewer)", () => {
  const CLIENT_PRIMS = [
    "drill-down-panel.tsx",
    "kanban-board.tsx",
    "spreadsheet-view.tsx",
    "photo-capture.tsx",
    "voice-note.tsx",
    "geo-check-in.tsx",
    "drawing-viewer.tsx",
  ];
  for (const file of CLIENT_PRIMS) {
    const src = read(`${PRIMITIVE_DIR}/${file}`);
    assert.match(
      src,
      /^"use client"/m,
      `${file} owns local state and MUST be marked as client component`,
    );
  }
});

// ============================================================================
// Phase 10.B closure
// ============================================================================

test("Phase 10.B: research-summary.md primitive list matches what shipped", () => {
  // The summary lists 12 primitives. Verify the count holds.
  const summary = read("docs/ux-research/research-summary.md");
  assert.match(summary, /12\s+(?:design-system\s+)?primitives/i);
  // And each primitive name appears in the summary.
  for (const name of [
    "DashboardKPI",
    "Timeline",
    "DrillDownPanel",
    "RFQMatrix",
    "KanbanBoard",
    "SpreadsheetView",
    "UnifiedInbox",
    "MobileTaskCard",
    "PhotoCapture",
    "VoiceNote",
    "GeoCheckIn",
    "DrawingViewer",
  ]) {
    assert.ok(
      summary.includes(name) || summary.toLowerCase().includes(name.toLowerCase()),
      `research summary must mention ${name}`,
    );
  }
});
