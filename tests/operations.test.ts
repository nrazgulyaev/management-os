/**
 * Operations Runtime smoke tests — pure logic only. The service/action paths
 * touch `server-only` and the database, so end-to-end coverage waits for the
 * pgtap/Playwright wiring planned for v5.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");

// -----------------------------------------------------------------------------
// 0005 migration shape
// -----------------------------------------------------------------------------
test("migration 0005 declares all operations tables", () => {
  const sql = readFileSync(
    join(repoRoot, "drizzle/0005_operations_runtime.sql"),
    "utf8",
  );
  for (const t of [
    "operation_task_types",
    "operation_tasks",
    "checklist_templates",
    "checklist_template_items",
    "task_checklists",
    "task_checklist_items",
    "maintenance_tickets",
    "preventive_schedules",
    "task_attachments",
    "damage_reports",
    "service_requests",
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS "${t}"`), `missing ${t}`);
  }
  // RLS enabled on every operations table
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /FORCE ROW LEVEL SECURITY/);
  assert.match(sql, /assigned_self_read/);
});

// -----------------------------------------------------------------------------
// Code format
// -----------------------------------------------------------------------------
test("buildTaskCode produces OPS-YYYYMMDD-NNNN", async () => {
  const { buildTaskCode, isOperationsCode, buildMaintenanceCode, buildServiceRequestCode } =
    await import("../src/features/operations/codes");
  const fixedDate = new Date(Date.UTC(2026, 3, 25));
  assert.equal(buildTaskCode(7, fixedDate), "OPS-20260425-0007");
  assert.equal(buildMaintenanceCode(1, fixedDate), "MNT-20260425-0001");
  assert.equal(buildServiceRequestCode(42, fixedDate), "SR-20260425-0042");
  assert.equal(isOperationsCode("OPS-20260425-0007"), true);
  assert.equal(isOperationsCode("OPS-20260425-AB12"), true);
  assert.equal(isOperationsCode("ops-2026-0007"), false);
});

// -----------------------------------------------------------------------------
// Scheduling math
// -----------------------------------------------------------------------------
test("computeNextDueOn advances by frequency", async () => {
  const { computeNextDueOn } = await import("../src/features/operations/scheduling");
  assert.equal(computeNextDueOn({ frequency: "daily", from: "2026-04-25" }), "2026-04-26");
  assert.equal(computeNextDueOn({ frequency: "weekly", from: "2026-04-25" }), "2026-05-02");
  assert.equal(computeNextDueOn({ frequency: "biweekly", from: "2026-04-25" }), "2026-05-09");
  assert.equal(computeNextDueOn({ frequency: "monthly", from: "2026-01-31" }), "2026-02-28");
  assert.equal(computeNextDueOn({ frequency: "quarterly", from: "2026-04-25" }), "2026-07-25");
  assert.equal(computeNextDueOn({ frequency: "yearly", from: "2026-04-25" }), "2027-04-25");
  assert.equal(
    computeNextDueOn({ frequency: "custom", intervalDays: 10, from: "2026-04-25" }),
    "2026-05-05",
  );
});

test("computeNextDueOn rejects custom without intervalDays", async () => {
  const { computeNextDueOn } = await import("../src/features/operations/scheduling");
  assert.throws(() =>
    computeNextDueOn({ frequency: "custom", intervalDays: 0, from: "2026-04-25" }),
  );
});

// -----------------------------------------------------------------------------
// Status transitions
// -----------------------------------------------------------------------------
test("task status transitions enforce the lifecycle", async () => {
  const { TASK_TRANSITIONS, canTransition } = await import(
    "../src/features/operations/scheduling"
  );
  assert.equal(canTransition(TASK_TRANSITIONS, "open", "in_progress"), true);
  assert.equal(canTransition(TASK_TRANSITIONS, "in_progress", "needs_review"), true);
  assert.equal(canTransition(TASK_TRANSITIONS, "needs_review", "approved"), true);
  // Cannot resurrect approved/cancelled tasks.
  assert.equal(canTransition(TASK_TRANSITIONS, "approved", "in_progress"), false);
  assert.equal(canTransition(TASK_TRANSITIONS, "cancelled", "open"), false);
  // Cannot skip from open straight to completed.
  assert.equal(canTransition(TASK_TRANSITIONS, "open", "completed"), false);
});

test("maintenance ticket transitions block illegal jumps", async () => {
  const { MAINTENANCE_TRANSITIONS, canTransition } = await import(
    "../src/features/operations/scheduling"
  );
  assert.equal(canTransition(MAINTENANCE_TRANSITIONS, "open", "scheduled"), true);
  assert.equal(canTransition(MAINTENANCE_TRANSITIONS, "resolved", "closed"), true);
  assert.equal(canTransition(MAINTENANCE_TRANSITIONS, "closed", "open"), false);
});

test("service request transitions reject closed-state mutations", async () => {
  const { SERVICE_REQUEST_TRANSITIONS, canTransition } = await import(
    "../src/features/operations/scheduling"
  );
  assert.equal(canTransition(SERVICE_REQUEST_TRANSITIONS, "new", "accepted"), true);
  assert.equal(canTransition(SERVICE_REQUEST_TRANSITIONS, "completed", "in_progress"), false);
});

// -----------------------------------------------------------------------------
// Checklist completion rules
// -----------------------------------------------------------------------------
test("evaluateChecklistReadiness blocks completion when required items pending", async () => {
  const { evaluateChecklistReadiness } = await import(
    "../src/features/operations/checklists"
  );
  const result = evaluateChecklistReadiness([
    { status: "done", isRequired: true, photoRequired: false, hasAttachment: false },
    { status: "pending", isRequired: true, photoRequired: false },
    { status: "done", isRequired: false, photoRequired: false },
  ]);
  assert.equal(result.canComplete, false);
  assert.equal(result.totalRequired, 2);
  assert.equal(result.doneOrNa, 1);
});

test("evaluateChecklistReadiness blocks done items missing required photo", async () => {
  const { evaluateChecklistReadiness } = await import(
    "../src/features/operations/checklists"
  );
  const r = evaluateChecklistReadiness([
    { status: "done", isRequired: true, photoRequired: true, hasAttachment: false },
  ]);
  assert.equal(r.canComplete, false);
  assert.match(r.blockers[0], /photo required/);
});

test("evaluateChecklistReadiness allows skipped/not_applicable required items", async () => {
  const { evaluateChecklistReadiness } = await import(
    "../src/features/operations/checklists"
  );
  const r = evaluateChecklistReadiness([
    { status: "done", isRequired: true, photoRequired: false },
    { status: "skipped", isRequired: true, photoRequired: false },
    { status: "not_applicable", isRequired: true, photoRequired: false },
  ]);
  assert.equal(r.canComplete, true);
  assert.equal(r.totalRequired, 3);
});

// -----------------------------------------------------------------------------
// Schemas
// -----------------------------------------------------------------------------
test("createOperationTaskSchema accepts minimal valid input", async () => {
  const { createOperationTaskSchema } = await import("../src/features/operations/schema");
  const r = createOperationTaskSchema.safeParse({
    title: "Turnover · EV-S2",
    category: "housekeeping",
  });
  assert.equal(r.success, true);
});

test("createOperationTaskSchema rejects unknown category", async () => {
  const { createOperationTaskSchema } = await import("../src/features/operations/schema");
  const r = createOperationTaskSchema.safeParse({
    title: "x",
    category: "bogus",
  });
  assert.equal(r.success, false);
});

test("createPreventiveScheduleSchema requires interval for custom frequency", async () => {
  const { createPreventiveScheduleSchema } = await import(
    "../src/features/operations/schema"
  );
  const bad = createPreventiveScheduleSchema.safeParse({
    name: "Pool service",
    category: "maintenance",
    frequency: "custom",
    nextDueOn: "2026-04-26",
    villaId: "00000000-0000-0000-0000-000000000001",
    priority: "normal",
  });
  assert.equal(bad.success, false);

  const good = createPreventiveScheduleSchema.safeParse({
    name: "Pool service",
    category: "maintenance",
    frequency: "custom",
    intervalDays: 30,
    nextDueOn: "2026-04-26",
    villaId: "00000000-0000-0000-0000-000000000001",
    priority: "normal",
  });
  assert.equal(good.success, true);
});

test("createPreventiveScheduleSchema requires villa or project", async () => {
  const { createPreventiveScheduleSchema } = await import(
    "../src/features/operations/schema"
  );
  const r = createPreventiveScheduleSchema.safeParse({
    name: "Pool service",
    category: "maintenance",
    frequency: "weekly",
    nextDueOn: "2026-04-26",
    priority: "normal",
  });
  assert.equal(r.success, false);
});

test("createServiceRequestSchema validates request_type enum", async () => {
  const { createServiceRequestSchema } = await import("../src/features/operations/schema");
  const r = createServiceRequestSchema.safeParse({
    title: "Quick tidy",
    requestType: "cleaning",
  });
  assert.equal(r.success, true);
});

test("createDamageReportSchema accepts bigint cost in minor units", async () => {
  const { createDamageReportSchema } = await import("../src/features/operations/schema");
  const r = createDamageReportSchema.safeParse({
    title: "Stained rug",
    severity: "normal",
    estimatedCostMinor: 12500n,
    currency: "USD",
  });
  assert.equal(r.success, true);
});

// -----------------------------------------------------------------------------
// Permission matrix
// -----------------------------------------------------------------------------
test("operations permissions map to the expected roles", async () => {
  const { hasPermission } = await import(
    "../src/features/auth/permission-matrix"
  );
  const housekeeper = {
    mode: "live" as const,
    appUser: { id: "u", email: "x@x", fullName: "X", status: "active" },
    roles: ["housekeeper" as const],
    isInternal: true,
    isSuperAdmin: false,
  };
  const concierge = { ...housekeeper, roles: ["concierge" as const] };
  const supervisor = { ...housekeeper, roles: ["housekeeping_supervisor" as const] };
  const technician = { ...housekeeper, roles: ["technician" as const] };

  assert.equal(hasPermission(housekeeper, "housekeeping.write"), true);
  assert.equal(hasPermission(housekeeper, "operations.approve"), false);
  assert.equal(hasPermission(supervisor, "operations.approve"), true);
  assert.equal(hasPermission(supervisor, "housekeeping.write"), true);
  assert.equal(hasPermission(technician, "maintenance.write"), true);
  assert.equal(hasPermission(technician, "operations.approve"), false);
  assert.equal(hasPermission(concierge, "service_request.write"), true);
  assert.equal(hasPermission(concierge, "maintenance.write"), false);
});

// -----------------------------------------------------------------------------
// Field-staff filtering — uses the SQL shape only (services module is
// server-only, so we verify its query intent through the source text).
// -----------------------------------------------------------------------------
test("services.ts filters tasks by assigned_to for current staff", () => {
  const src = readFileSync(
    join(repoRoot, "src/features/operations/services.ts"),
    "utf8",
  );
  assert.match(src, /listTasksForCurrentStaff/);
  assert.match(src, /assignedTo:\s*me\.id/);
  assert.match(src, /eq\(operationTasks\.assignedTo, f\.assignedTo\)/);
});
