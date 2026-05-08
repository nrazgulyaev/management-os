/**
 * Stage 10.E.2 — Operations CRUD rollout acceptance tests.
 *
 * The audit flagged 4 ops list pages as partial-CRUD:
 *   /dashboard/operations/tasks
 *   /dashboard/operations/housekeeping (uses tasks)
 *   /dashboard/operations/maintenance
 *   /dashboard/operations/preventive
 *
 * The master plan extended to 7 pages (added service-requests +
 * damage-reports + checklists). 10.E.2 wires 6 of them (excluding
 * checklists — templates page, lower priority + lower partial-CRUD
 * exposure).
 *
 * Existing edit/archive actions for task/maintenance/damage were
 * shipped earlier but never wired into the list pages. This sub-phase
 * adds 4 new actions for preventive + service-requests, then wires
 * all 5 entity kinds via the shared <OperationsRowActions> wrapper.
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

const ACTIONS = "src/features/operations/actions.ts";
const WRAPPER = "src/components/dashboard/operations/operations-row-actions.tsx";

// ============================================================================
// 4 new server actions (preventive + service requests)
// ============================================================================

test("10.E.2: 4 new ops server actions exported", () => {
  const src = read(ACTIONS);
  for (const fn of [
    "editPreventiveScheduleAction",
    "archivePreventiveScheduleAction",
    "editServiceRequestAction",
    "archiveServiceRequestAction",
  ]) {
    assert.match(src, new RegExp(`export async function ${fn}\\b`));
  }
});

test("10.E.2: existing 6 edit/archive actions still present (regression guard)", () => {
  const src = read(ACTIONS);
  for (const fn of [
    "editOperationTaskAction",
    "archiveOperationTaskAction",
    "editMaintenanceTicketAction",
    "archiveMaintenanceTicketAction",
    "editDamageReportAction",
    "archiveDamageReportAction",
  ]) {
    assert.match(src, new RegExp(`export async function ${fn}\\b`));
  }
});

test("10.E.2: new ops actions gate on operations.write permission", () => {
  const src = read(ACTIONS);
  for (const fn of [
    "editPreventiveScheduleAction",
    "archivePreventiveScheduleAction",
    "editServiceRequestAction",
    "archiveServiceRequestAction",
  ]) {
    const body = src.match(
      new RegExp(`export async function ${fn}\\b[\\s\\S]*?(?=export async|$)`),
    )?.[0];
    assert.ok(body, `${fn} body not found`);
    assert.match(body!, /requirePermission\("operations\.write"\)/);
  }
});

test("10.E.2: new actions use existing zod schemas (createPreventiveScheduleSchema, createServiceRequestSchema)", () => {
  const src = read(ACTIONS);
  assert.match(
    src,
    /editPreventiveScheduleAction[\s\S]*?createPreventiveScheduleSchema\.safeParse/,
  );
  assert.match(
    src,
    /editServiceRequestAction[\s\S]*?createServiceRequestSchema\.safeParse/,
  );
});

test("10.E.2: archive actions soft-delete (status -> 'archived' / 'cancelled')", () => {
  const src = read(ACTIONS);
  // Preventive uses 'archived' (matches the inventory pattern).
  const preventiveBody = src.match(
    /export async function archivePreventiveScheduleAction[\s\S]*?return \{ ok: true \};/,
  )?.[0];
  assert.ok(preventiveBody);
  assert.match(preventiveBody!, /status:\s*"archived"/);
  // Service request uses 'cancelled' (matches existing service-request
  // status enum which has cancelled but not archived).
  const srBody = src.match(
    /export async function archiveServiceRequestAction[\s\S]*?return \{ ok: true \};/,
  )?.[0];
  assert.ok(srBody);
  assert.match(srBody!, /status:\s*"cancelled"/);
});

test("10.E.2: every new action audit-logs + revalidates the list path", () => {
  const src = read(ACTIONS);
  const expected: Record<string, { audit: string; path: string }> = {
    editPreventiveScheduleAction: {
      audit: "operations.preventive.update",
      path: "/dashboard/operations/preventive",
    },
    archivePreventiveScheduleAction: {
      audit: "operations.preventive.archive",
      path: "/dashboard/operations/preventive",
    },
    editServiceRequestAction: {
      audit: "operations.service_request.update",
      path: "/dashboard/operations/service-requests",
    },
    archiveServiceRequestAction: {
      audit: "operations.service_request.archive",
      path: "/dashboard/operations/service-requests",
    },
  };
  for (const [fn, expected_] of Object.entries(expected)) {
    const body = src.match(
      new RegExp(`export async function ${fn}\\b[\\s\\S]*?(?=export async|$)`),
    )?.[0];
    assert.ok(body, `${fn} body not found`);
    assert.ok(
      body!.includes(`"${expected_.audit}"`),
      `${fn} must audit-log "${expected_.audit}"`,
    );
    assert.match(
      body!,
      new RegExp(
        `revalidatePath\\("${expected_.path.replace(/[/]/g, "\\/")}"\\)`,
      ),
      `${fn} must revalidate ${expected_.path}`,
    );
  }
});

// ============================================================================
// Client wrapper
// ============================================================================

test("10.E.2: OperationsRowActions wrapper exists + is a client component", () => {
  assert.ok(exists(WRAPPER));
  const src = read(WRAPPER);
  assert.match(src, /^"use client"/m);
});

test("10.E.2: wrapper imports all 10 server actions (5 edit + 5 archive)", () => {
  const src = read(WRAPPER);
  for (const fn of [
    "editOperationTaskAction",
    "archiveOperationTaskAction",
    "editMaintenanceTicketAction",
    "archiveMaintenanceTicketAction",
    "editDamageReportAction",
    "archiveDamageReportAction",
    "editPreventiveScheduleAction",
    "archivePreventiveScheduleAction",
    "editServiceRequestAction",
    "archiveServiceRequestAction",
  ]) {
    assert.ok(src.includes(fn), `wrapper must import ${fn}`);
  }
});

test("10.E.2: wrapper handles all 5 entity kinds via discriminated `kind` prop", () => {
  const src = read(WRAPPER);
  assert.match(
    src,
    /OpsEntityKind\s*=\s*\|?\s*"task"\s*\|\s*"maintenance"\s*\|\s*"damage"\s*\|\s*"preventive"\s*\|\s*"service_request"/,
  );
});

test("10.E.2: wrapper composes RowActionsMenu + EntityFormModal + ArchiveConfirmDialog", () => {
  const src = read(WRAPPER);
  assert.match(src, /RowActionsMenu/);
  assert.match(src, /EntityFormModal/);
  assert.match(src, /ArchiveConfirmDialog/);
});

test("10.E.2: wrapper merges row.values with user edits before submit (preserves all schema fields)", () => {
  const src = read(WRAPPER);
  // The merge pattern is critical because the existing edit schemas
  // require every create-field; the modal only exposes a curated subset.
  assert.match(
    src,
    /const\s+merged[\s\S]{0,80}\.\.\.row\.values[\s\S]{0,40}\.\.\.values/,
  );
});

test("10.E.2: wrapper appends `id` to FormData for legacy actions (task/maintenance/damage)", () => {
  const src = read(WRAPPER);
  // editOperationTask/Maintenance/Damage take id-in-formdata; the new
  // preventive/service_request actions take it as a separate input arg.
  for (const fn of [
    "editOperationTaskAction",
    "editMaintenanceTicketAction",
    "editDamageReportAction",
    "archiveOperationTaskAction",
    "archiveMaintenanceTicketAction",
    "archiveDamageReportAction",
  ]) {
    assert.ok(
      src.includes(fn),
      `wrapper must call ${fn}`,
    );
  }
  // At least 3 fd.append("id", row.id) sites for the 3 legacy edits.
  const idAppends = src.match(/fd\.append\("id",\s*row\.id\)/g) ?? [];
  assert.ok(
    idAppends.length >= 3,
    `expected ≥3 fd.append("id", row.id) appends, got ${idAppends.length}`,
  );
});

// ============================================================================
// Page wiring
// ============================================================================

const PAGES: Array<{
  path: string;
  kind: "task" | "maintenance" | "damage" | "preventive" | "service_request";
}> = [
  { path: "src/app/(dashboard)/dashboard/operations/tasks/page.tsx", kind: "task" },
  { path: "src/app/(dashboard)/dashboard/operations/housekeeping/page.tsx", kind: "task" },
  { path: "src/app/(dashboard)/dashboard/operations/maintenance/page.tsx", kind: "maintenance" },
  { path: "src/app/(dashboard)/dashboard/operations/preventive/page.tsx", kind: "preventive" },
  { path: "src/app/(dashboard)/dashboard/operations/service-requests/page.tsx", kind: "service_request" },
  { path: "src/app/(dashboard)/dashboard/operations/damage-reports/page.tsx", kind: "damage" },
];

test("10.E.2: each list page imports OperationsRowActions", () => {
  for (const p of PAGES) {
    const src = read(p.path);
    assert.match(
      src,
      /import\s*\{\s*OperationsRowActions\s*\}\s*from\s*"@\/components\/dashboard\/operations\/operations-row-actions"/,
      `${p.path} missing OperationsRowActions import`,
    );
  }
});

test("10.E.2: each list page uses NoItemsYet for the empty state", () => {
  for (const p of PAGES) {
    const src = read(p.path);
    assert.match(
      src,
      /<NoItemsYet/,
      `${p.path} must render <NoItemsYet>`,
    );
  }
});

test("10.E.2: each list page renders OperationsRowActions with the correct `kind`", () => {
  for (const p of PAGES) {
    const src = read(p.path);
    assert.match(
      src,
      new RegExp(`<OperationsRowActions[\\s\\S]{0,400}kind="${p.kind}"`),
      `${p.path} must render <OperationsRowActions kind="${p.kind}">`,
    );
  }
});

test("10.E.2: each list page passes a values bag including the ID-row's title or name", () => {
  for (const p of PAGES) {
    const src = read(p.path);
    // values: { ... title: ... } or values: { ... name: ... }
    assert.match(
      src,
      /values:\s*\{[\s\S]{0,800}\b(?:title|name):/,
      `${p.path} must pass row.values payload`,
    );
  }
});

// ============================================================================
// Phase 10.E.2 closure
// ============================================================================

test("Phase 10.E.2: decisions doc shipped", () => {
  assert.ok(exists("tmp/stage-10-e-2-decisions.md"));
});

test("Phase 10.E.2: checklists deferred decision documented", () => {
  const src = read("tmp/stage-10-e-2-decisions.md");
  assert.match(src, /checklists/i);
  assert.match(src, /deferred|skipped|out of scope/i);
});
