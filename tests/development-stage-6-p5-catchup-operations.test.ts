/**
 * Stage 6.P5-CATCHUP — Operations Edit + Archive tests.
 *
 * Validates:
 *   - 6 new server actions exist + carry "use server" via the actions file's
 *     top-of-file directive
 *   - Schemas validate as expected
 *   - Status enums extended with "archived" on tasks / maintenance / damage
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  archiveDamageReportSchema,
  archiveMaintenanceTicketSchema,
  archiveOperationTaskSchema,
  damageStatusEnum,
  editDamageReportSchema,
  editMaintenanceTicketSchema,
  editOperationTaskSchema,
  maintenanceStatusEnum,
  taskStatusEnum,
} from "../src/features/operations/schema";

const HERE =
  typeof __dirname !== "undefined"
    ? __dirname
    : dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

function readFile(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

// ===========================================================================
// 1) Status enums extended with "archived"
// ===========================================================================

test("taskStatusEnum includes 'archived'", () => {
  const result = taskStatusEnum.safeParse("archived");
  assert.equal(result.success, true);
});

test("maintenanceStatusEnum includes 'archived'", () => {
  const result = maintenanceStatusEnum.safeParse("archived");
  assert.equal(result.success, true);
});

test("damageStatusEnum includes 'archived'", () => {
  const result = damageStatusEnum.safeParse("archived");
  assert.equal(result.success, true);
});

// ===========================================================================
// 2) Edit schemas accept full record updates
// ===========================================================================

test("editOperationTaskSchema requires id + title + category", () => {
  const ok = editOperationTaskSchema.safeParse({
    id: "11111111-1111-1111-1111-111111111111",
    title: "Replace A/C filter",
    category: "maintenance",
    priority: "normal",
  });
  assert.equal(ok.success, true, JSON.stringify(ok));

  const missing = editOperationTaskSchema.safeParse({ title: "x" });
  assert.equal(missing.success, false);
});

test("editMaintenanceTicketSchema requires id + title + issueCategory", () => {
  const ok = editMaintenanceTicketSchema.safeParse({
    id: "11111111-1111-1111-1111-111111111111",
    title: "Pool pump leak",
    issueCategory: "pool",
    severity: "high",
  });
  assert.equal(ok.success, true);
});

test("editDamageReportSchema requires id + title + severity", () => {
  const ok = editDamageReportSchema.safeParse({
    id: "11111111-1111-1111-1111-111111111111",
    title: "Broken bedside lamp",
    severity: "low",
  });
  assert.equal(ok.success, true);
});

// ===========================================================================
// 3) Archive schemas accept id + optional reason
// ===========================================================================

test("archive schemas accept id alone", () => {
  for (const schema of [
    archiveOperationTaskSchema,
    archiveMaintenanceTicketSchema,
    archiveDamageReportSchema,
  ]) {
    const ok = schema.safeParse({
      id: "11111111-1111-1111-1111-111111111111",
    });
    assert.equal(ok.success, true);
  }
});

test("archive schemas reject non-uuid id", () => {
  for (const schema of [
    archiveOperationTaskSchema,
    archiveMaintenanceTicketSchema,
    archiveDamageReportSchema,
  ]) {
    const bad = schema.safeParse({ id: "not-a-uuid" });
    assert.equal(bad.success, false);
  }
});

test("archive schemas accept optional reason", () => {
  const ok = archiveOperationTaskSchema.safeParse({
    id: "11111111-1111-1111-1111-111111111111",
    reason: "Duplicate of OPS-20260507-0001",
  });
  assert.equal(ok.success, true);
});

test("archive schemas reject reason longer than 500 chars", () => {
  const bad = archiveOperationTaskSchema.safeParse({
    id: "11111111-1111-1111-1111-111111111111",
    reason: "x".repeat(501),
  });
  assert.equal(bad.success, false);
});

// ===========================================================================
// 4) Server actions are exported + file carries "use server"
// ===========================================================================

test('operations/actions.ts opens with "use server"', () => {
  const src = readFile("src/features/operations/actions.ts");
  assert.match(src, /^"use server";/);
});

test("operations/actions.ts exports the 6 new edit + archive actions", () => {
  const src = readFile("src/features/operations/actions.ts");
  for (const fn of [
    "editOperationTaskAction",
    "archiveOperationTaskAction",
    "editMaintenanceTicketAction",
    "archiveMaintenanceTicketAction",
    "editDamageReportAction",
    "archiveDamageReportAction",
  ]) {
    assert.match(src, new RegExp(`export\\s+async\\s+function\\s+${fn}\\b`));
  }
});

test("operations/actions.ts gates Edit+Archive on operations.write permission", () => {
  const src = readFile("src/features/operations/actions.ts");
  // Each new action calls requirePermission("operations.write").
  const matches = src.match(/requirePermission\("operations\.write"\)/g) ?? [];
  // 4 pre-existing + 6 new = 10 minimum. Guard against regression by
  // asserting >= 10.
  assert.ok(
    matches.length >= 10,
    `expected at least 10 requirePermission calls, got ${matches.length}`,
  );
});

test("operations/actions.ts records audit events for each edit + archive", () => {
  const src = readFile("src/features/operations/actions.ts");
  for (const action of [
    "operations.task.edit",
    "operations.task.archive",
    "operations.maintenance.edit",
    "operations.maintenance.archive",
    "operations.damage.edit",
    "operations.damage.archive",
  ]) {
    assert.match(src, new RegExp(`action:\\s*"${action.replace(/\./g, "\\.")}"`));
  }
});

// ===========================================================================
// 5) Architecture doc P5 catch-up note
// ===========================================================================

test("architecture doc: P5 carries CATCHUP marker (active or accepted)", () => {
  const src = readFile("docs/development-os-architecture.md");
  assert.match(src, /Stage 6\.P5 — Productivity Tools .*\[(ACTIVE|ACCEPTED) 6\.P5-CATCHUP\]/);
});

test("operations Edit+Archive: archived status doesn't allow re-archive", () => {
  // The action body refuses double-archive — assert the guard string is
  // present in the source. End-to-end DB-touching tests live behind the
  // pgtap/Playwright harness planned for Phase A.4.
  const src = readFile("src/features/operations/actions.ts");
  assert.match(
    src,
    /Already archived\./,
    "double-archive guard string missing",
  );
});
