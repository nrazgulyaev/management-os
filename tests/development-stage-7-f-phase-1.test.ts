/**
 * Stage 7.F.A — Phase 1 (Workflow Death-Points) acceptance tests.
 *
 * Source-level invariants for the 5 sub-items:
 *   A.1 Front Office check-in / check-out buttons
 *   A.2 Maintenance ticket staff-assignment (bridges via operation_task)
 *   A.3 Dev OS purchase-request approve / reject buttons
 *   A.4 Service-request actions (verified existing — already wired)
 *   A.5 Checklist runner (verified existing — already wired)
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assignMaintenanceTicketSchema,
} from "../src/features/operations/schema";

const HERE =
  typeof __dirname !== "undefined"
    ? __dirname
    : dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

function readFile(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8");
}
function fileExists(rel: string): boolean {
  return existsSync(resolve(ROOT, rel));
}

// ===========================================================================
// 7.F.A.1 — Front Office check-in / check-out
// ===========================================================================

test("7.F.A.1: check-in/out client component exists", () => {
  assert.ok(fileExists("src/components/front-office/check-in-out-buttons.tsx"));
});

test("7.F.A.1: component exports CheckInButton + CheckOutButton", () => {
  const src = readFile("src/components/front-office/check-in-out-buttons.tsx");
  assert.match(src, /export\s+function\s+CheckInButton\b/);
  assert.match(src, /export\s+function\s+CheckOutButton\b/);
  // Visibility gates by status — confirmed → check-in, checked_in → check-out.
  assert.match(src, /bookingStatus\s*!==\s*"confirmed"/);
  assert.match(src, /bookingStatus\s*!==\s*"checked_in"/);
});

test("7.F.A.1: component delegates to setBookingStatusAction (no new server action)", () => {
  const src = readFile("src/components/front-office/check-in-out-buttons.tsx");
  assert.match(src, /setBookingStatusAction/);
  assert.match(src, /from\s+["']@\/features\/bookings\/actions["']/);
});

test("7.F.A.1: arrivals page wires CheckInButton on row", () => {
  const src = readFile(
    "src/app/(dashboard)/dashboard/front-office/arrivals/page.tsx",
  );
  assert.match(src, /CheckInButton/);
  assert.match(src, /bookingId={r\.bookingId}/);
});

test("7.F.A.1: departures page wires CheckOutButton on row", () => {
  const src = readFile(
    "src/app/(dashboard)/dashboard/front-office/departures/page.tsx",
  );
  assert.match(src, /CheckOutButton/);
  assert.match(src, /bookingId={r\.bookingId}/);
});

test("7.F.A.1: DepartureRow exposes bookingStatus for the gate", () => {
  const src = readFile("src/features/front-office/services.ts");
  assert.match(src, /bookingStatus: r\.b\.status/);
  // Type definition includes bookingStatus.
  assert.match(src, /bookingStatus: string;/);
});

// ===========================================================================
// 7.F.A.2 — Maintenance staff-assignment
// ===========================================================================

test("7.F.A.2: assignMaintenanceTicketSchema validates ticketId + assigneeId", () => {
  const ok = assignMaintenanceTicketSchema.safeParse({
    ticketId: "11111111-1111-1111-1111-111111111111",
    assigneeId: "22222222-2222-2222-2222-222222222222",
  });
  assert.equal(ok.success, true);

  const bad = assignMaintenanceTicketSchema.safeParse({
    ticketId: "not-uuid",
    assigneeId: "22222222-2222-2222-2222-222222222222",
  });
  assert.equal(bad.success, false);
});

test("7.F.A.2: schema accepts optional scheduledFor in YYYY-MM-DD", () => {
  const ok = assignMaintenanceTicketSchema.safeParse({
    ticketId: "11111111-1111-1111-1111-111111111111",
    assigneeId: "22222222-2222-2222-2222-222222222222",
    scheduledFor: "2026-06-15",
  });
  assert.equal(ok.success, true);

  const bad = assignMaintenanceTicketSchema.safeParse({
    ticketId: "11111111-1111-1111-1111-111111111111",
    assigneeId: "22222222-2222-2222-2222-222222222222",
    scheduledFor: "06/15/2026",
  });
  assert.equal(bad.success, false);
});

test("7.F.A.2: assignMaintenanceTicketAction exported + uses bridge logic", () => {
  const src = readFile("src/features/operations/actions.ts");
  assert.match(
    src,
    /export\s+async\s+function\s+assignMaintenanceTicketAction\b/,
  );
  // Must check both branches: ticket has linked task vs needs new task.
  assert.match(src, /if \(ticket\.taskId\)/);
  // Bridge: when no taskId, creates a new operation_task + links via taskId.
  assert.match(src, /buildTaskCode\(counter\)/);
  assert.match(src, /\.update\(maintenanceTickets\)/);
  assert.match(src, /taskId: newTask\.id/);
});

test("7.F.A.2: assign action gates on operations.assign permission + records audit", () => {
  const src = readFile("src/features/operations/actions.ts");
  // Specifically the maintenance.assign audit event.
  assert.match(src, /action:\s*"operations\.maintenance\.assign"/);
  // The function uses requirePermission("operations.assign"). Match the
  // call inside the function body — there are 10+ requirePermission
  // calls in the file; this asserts the action exists.
  const assignBlock = src.slice(src.indexOf("assignMaintenanceTicketAction"));
  assert.match(
    assignBlock.slice(0, 2000),
    /requirePermission\("operations\.assign"\)/,
  );
});

test("7.F.A.2: maintenance dropdown component exists", () => {
  assert.ok(fileExists("src/components/operations/maintenance-assign.tsx"));
  const src = readFile("src/components/operations/maintenance-assign.tsx");
  assert.match(src, /export\s+function\s+MaintenanceAssignDropdown\b/);
  assert.match(src, /assignMaintenanceTicketAction/);
});

test("7.F.A.2: maintenance detail page wires the assign dropdown", () => {
  const src = readFile(
    "src/app/(dashboard)/dashboard/operations/maintenance/[id]/page.tsx",
  );
  assert.match(src, /MaintenanceAssignDropdown/);
  assert.match(src, /listAppUsers/);
  assert.match(src, /operations\.assign/);
});

test("7.F.A.2: ticket detail row exposes assignedTo + assigneeName", () => {
  const src = readFile("src/features/operations/services.ts");
  // Type definition.
  assert.match(src, /taskId:\s*string\s*\|\s*null;/);
  assert.match(src, /assignedTo:\s*string\s*\|\s*null;/);
  assert.match(src, /assigneeName:\s*string\s*\|\s*null;/);
  // Resolver in getMaintenanceTicketById.
  assert.match(src, /taskAssignedTo:\s*operationTasks\.assignedTo/);
});

// ===========================================================================
// 7.F.A.3 — Dev OS purchase-request approve / reject
// ===========================================================================

test("7.F.A.3: DevOsPurchaseRequestActions component exists", () => {
  const path =
    "src/components/development/procurement/request-actions.tsx";
  assert.ok(fileExists(path));
  const src = readFile(path);
  assert.match(src, /export\s+function\s+DevOsPurchaseRequestActions\b/);
  // Calls the canonical transitionPurchaseRequest action.
  assert.match(src, /transitionPurchaseRequest/);
});

test("7.F.A.3: component renders Approve / Reject / Cancel buttons gated by status + role", () => {
  const src = readFile(
    "src/components/development/procurement/request-actions.tsx",
  );
  assert.match(src, /status === "draft"/);
  assert.match(src, /status === "submitted"/);
  assert.match(src, /canApprove/);
  // Reject requires reason (server-side schema also enforces but UI prompts).
  assert.match(src, /Reason for rejection/);
});

test("7.F.A.3: PR detail page wires the actions component", () => {
  const src = readFile(
    "src/app/(development-app)/development-os/procurement/purchase-requests/[code]/page.tsx",
  );
  assert.match(src, /DevOsPurchaseRequestActions/);
  // Role-membership check populates canApprove from the user context.
  assert.match(src, /canApprove\s*=\s*ctx\.roles\.some/);
  assert.match(src, /finance_manager|operations_manager|procurement_manager/);
});

test("7.F.A.3: server-side threshold re-check still runs in transitionPurchaseRequest", () => {
  // Defense-in-depth — UI gates by role membership but the server still
  // consults `approval_thresholds`. This existed pre-7.F; we verify it
  // didn't regress.
  const src = readFile(
    "src/lib/development/server/procurement/procurement-actions.ts",
  );
  assert.match(src, /lookupRequiredApproval/);
  assert.match(src, /approval_thresholds|approvalThresholds/);
});

// ===========================================================================
// 7.F.A.4 — Service requests (verified existing wiring)
// ===========================================================================

test("7.F.A.4: ServiceRequestActions component exists + wired on detail", () => {
  assert.ok(
    fileExists("src/components/operations/service-request-actions.tsx"),
  );
  const detailSrc = readFile(
    "src/app/(dashboard)/dashboard/operations/service-requests/[id]/page.tsx",
  );
  assert.match(detailSrc, /ServiceRequestActions/);
});

// ===========================================================================
// 7.F.A.5 — Checklists (verified existing wiring)
// ===========================================================================

test("7.F.A.5: ChecklistRunner + ChecklistFromTemplateForm wired on task detail", () => {
  const src = readFile(
    "src/app/(dashboard)/dashboard/operations/tasks/[id]/page.tsx",
  );
  assert.match(src, /ChecklistRunner/);
  assert.match(src, /ChecklistFromTemplateForm/);
});

test("7.F.A.5: completeChecklistAction + updateChecklistItemAction reachable from runner", () => {
  const src = readFile("src/components/operations/checklist-runner.tsx");
  assert.match(src, /completeChecklistAction/);
  assert.match(src, /updateChecklistItemAction/);
});

// ===========================================================================
// Phase 1 closure — no migrations, no new providers
// ===========================================================================

test("Phase 1: no new migration files were added", () => {
  // The latest migration (per Stage 7.0 Path C) is 0086. Phase 1 ships
  // no new migrations; only UI + existing-action wiring.
  assert.ok(
    fileExists(
      "drizzle/0086_development_os_stage_7_0_ai_commerce_retrofit.sql",
    ),
  );
  assert.ok(
    !fileExists("drizzle/0087_development_os_stage_7_f.sql"),
    "No 0087+ migration should exist after Phase 1",
  );
});
