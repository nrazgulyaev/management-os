/**
 * v9A — pure-logic smoke tests:
 *   - Migration 0011 shape (6 tables, RLS, role insert).
 *   - Half-open interval / back-to-back rule.
 *   - Conflict detection (active-only, type-aware, exclusion).
 *   - Booking-date → block-range conversion.
 *   - Readiness pure mapping (task → readiness).
 *   - Check-in/out request status transitions.
 *   - Responsibility scope matcher (NULL = any).
 *   - Permission matrix exposes new keys.
 *
 * No DB / no `server-only` import — every imported module is pure.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");

// -----------------------------------------------------------------------------
// Migration 0011
// -----------------------------------------------------------------------------
test("migration 0011 declares all 6 tables + RLS + booking_manager role", () => {
  const sql = readFileSync(
    join(repoRoot, "drizzle/0011_villa_availability_front_office_readiness.sql"),
    "utf8",
  );
  for (const t of [
    "villa_calendar_blocks",
    "villa_readiness_states",
    "booking_stay_events",
    "checkin_checkout_requests",
    "user_responsibility_scopes",
    "security_camera_devices",
  ]) {
    assert.match(
      sql,
      new RegExp(`CREATE TABLE IF NOT EXISTS "${t}"`),
      `missing ${t}`,
    );
  }
  assert.match(sql, /booking_manager/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /FORCE ROW LEVEL SECURITY/);
  // Cameras must have an extra write policy beyond the loop's read policy.
  assert.match(sql, /CREATE POLICY internal_write ON "security_camera_devices"/);
  // Partial unique index for one-open-row-per-villa readiness.
  assert.match(sql, /villa_readiness_states_open_unique/);
  assert.match(
    sql,
    /WHERE "effective_to" IS NULL/,
    "missing partial-unique-index predicate",
  );
});

// -----------------------------------------------------------------------------
// Pure interval logic
// -----------------------------------------------------------------------------
test("intervalsOverlap: half-open semantics (back-to-back is NOT a conflict)", async () => {
  const { intervalsOverlap } = await import(
    "../src/features/availability/calendar"
  );
  // a = [10, 12), b = [12, 14) — touching, no overlap.
  assert.equal(
    intervalsOverlap(
      "2026-04-26T10:00:00Z",
      "2026-04-26T12:00:00Z",
      "2026-04-26T12:00:00Z",
      "2026-04-26T14:00:00Z",
    ),
    false,
  );
  // a = [10, 13), b = [12, 14) — overlap.
  assert.equal(
    intervalsOverlap(
      "2026-04-26T10:00:00Z",
      "2026-04-26T13:00:00Z",
      "2026-04-26T12:00:00Z",
      "2026-04-26T14:00:00Z",
    ),
    true,
  );
});

test("detectConflicts: active blocks of a blocking type produce conflicts", async () => {
  const { detectConflicts } = await import(
    "../src/features/availability/calendar"
  );
  const blocks = [
    {
      id: "b1",
      villaId: "V1",
      blockType: "guest_booking",
      status: "active",
      startsAt: "2026-04-26T00:00:00Z",
      endsAt: "2026-04-30T00:00:00Z",
    },
    {
      id: "b2",
      villaId: "V1",
      blockType: "out_of_order",
      status: "cancelled", // ignored
      startsAt: "2026-04-25T00:00:00Z",
      endsAt: "2026-04-27T00:00:00Z",
    },
    {
      id: "b3",
      villaId: "V2",
      blockType: "owner_stay",
      status: "active", // wrong villa, ignored
      startsAt: "2026-04-26T00:00:00Z",
      endsAt: "2026-04-30T00:00:00Z",
    },
  ];
  const conflicts = detectConflicts(blocks, {
    villaId: "V1",
    startsAt: "2026-04-29T00:00:00Z",
    endsAt: "2026-05-01T00:00:00Z",
  });
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].id, "b1");
});

test("detectConflicts: back-to-back is allowed for the same villa", async () => {
  const { detectConflicts } = await import(
    "../src/features/availability/calendar"
  );
  const blocks = [
    {
      id: "b1",
      villaId: "V1",
      blockType: "guest_booking",
      status: "active",
      startsAt: "2026-04-26T00:00:00Z",
      endsAt: "2026-04-30T00:00:00Z",
    },
  ];
  const conflicts = detectConflicts(blocks, {
    villaId: "V1",
    startsAt: "2026-04-30T00:00:00Z",
    endsAt: "2026-05-03T00:00:00Z",
  });
  assert.equal(conflicts.length, 0);
});

test("detectConflicts: excludeBlockId honours self-exclusion (re-sync)", async () => {
  const { detectConflicts } = await import(
    "../src/features/availability/calendar"
  );
  const blocks = [
    {
      id: "self",
      villaId: "V1",
      blockType: "guest_booking",
      status: "active",
      startsAt: "2026-04-26T00:00:00Z",
      endsAt: "2026-04-30T00:00:00Z",
    },
  ];
  const conflicts = detectConflicts(blocks, {
    villaId: "V1",
    startsAt: "2026-04-26T00:00:00Z",
    endsAt: "2026-04-30T00:00:00Z",
    excludeBlockId: "self",
  });
  assert.equal(conflicts.length, 0);
});

test("hasConflict mirrors detectConflicts but short-circuits", async () => {
  const { hasConflict } = await import("../src/features/availability/calendar");
  const blocks = [
    {
      id: "b1",
      villaId: "V1",
      blockType: "out_of_order",
      status: "active",
      startsAt: "2026-04-26T00:00:00Z",
      endsAt: "2026-04-27T00:00:00Z",
    },
  ];
  assert.equal(
    hasConflict(blocks, {
      villaId: "V1",
      startsAt: "2026-04-26T12:00:00Z",
      endsAt: "2026-04-26T14:00:00Z",
    }),
    true,
  );
  assert.equal(
    hasConflict(blocks, {
      villaId: "V1",
      startsAt: "2026-04-27T00:00:00Z",
      endsAt: "2026-04-28T00:00:00Z",
    }),
    false,
  );
});

test("bookingDatesToBlockRange uses UTC midnight at both ends", async () => {
  const { bookingDatesToBlockRange } = await import(
    "../src/features/availability/calendar"
  );
  const { startsAt, endsAt } = bookingDatesToBlockRange(
    "2026-04-26",
    "2026-04-30",
  );
  assert.equal(startsAt.toISOString(), "2026-04-26T00:00:00.000Z");
  assert.equal(endsAt.toISOString(), "2026-04-30T00:00:00.000Z");
});

// -----------------------------------------------------------------------------
// Readiness — pure mapping
// -----------------------------------------------------------------------------
test("readinessFromTaskUpdate maps housekeeping lifecycle", async () => {
  const { readinessFromTaskUpdate } = await import(
    "../src/features/readiness/lifecycle"
  );
  assert.equal(readinessFromTaskUpdate("housekeeping", "in_progress"), "cleaning");
  assert.equal(readinessFromTaskUpdate("housekeeping", "needs_review"), "inspection");
  assert.equal(readinessFromTaskUpdate("housekeeping", "approved"), "ready");
  // Maintenance categories aren't auto-mapped — stay null.
  assert.equal(readinessFromTaskUpdate("maintenance", "in_progress"), null);
});

// -----------------------------------------------------------------------------
// Check-in/out request status transitions
// -----------------------------------------------------------------------------
test("canTransitionRequestStatus: only legal transitions are accepted", async () => {
  const { canTransitionRequestStatus } = await import(
    "../src/features/front-office/transitions"
  );
  assert.equal(canTransitionRequestStatus("requested", "approved"), true);
  assert.equal(canTransitionRequestStatus("approved", "completed"), true);
  assert.equal(canTransitionRequestStatus("rejected", "approved"), false);
  assert.equal(canTransitionRequestStatus("completed", "approved"), false);
  assert.equal(canTransitionRequestStatus("approved", "rejected"), false);
});

// -----------------------------------------------------------------------------
// Responsibility scope matcher
// -----------------------------------------------------------------------------
test("matchesScope: NULL columns mean 'any'", async () => {
  const { matchesScope } = await import(
    "../src/features/responsibility-scopes/match"
  );
  // Scope: any villa in project A, housekeeping category only.
  const scope = {
    status: "active",
    scopeType: "housekeeping",
    projectId: "PROJ_A",
    villaId: null,
    taskCategory: "housekeeping",
  };
  assert.equal(
    matchesScope(scope, {
      scopeType: "housekeeping",
      projectId: "PROJ_A",
      villaId: "V1",
      category: "housekeeping",
    }),
    true,
  );
  // Wrong project — no match.
  assert.equal(
    matchesScope(scope, {
      scopeType: "housekeeping",
      projectId: "PROJ_B",
      villaId: "V1",
      category: "housekeeping",
    }),
    false,
  );
  // Wrong category — no match.
  assert.equal(
    matchesScope(scope, {
      scopeType: "housekeeping",
      projectId: "PROJ_A",
      villaId: "V1",
      category: "maintenance",
    }),
    false,
  );
});

test("matchesScope: archived scopes never match", async () => {
  const { matchesScope } = await import(
    "../src/features/responsibility-scopes/match"
  );
  assert.equal(
    matchesScope(
      {
        status: "archived",
        scopeType: "operations",
        projectId: null,
        villaId: null,
        taskCategory: null,
      },
      { scopeType: "operations", projectId: "P", villaId: "V", category: "x" },
    ),
    false,
  );
});

test("userHasScopeForTask: any matching scope wins", async () => {
  const { userHasScopeForTask } = await import(
    "../src/features/responsibility-scopes/match"
  );
  const scopes = [
    {
      status: "active",
      scopeType: "operations",
      projectId: "PROJ_A",
      villaId: null,
      taskCategory: null,
    },
    {
      status: "active",
      scopeType: "operations",
      projectId: "PROJ_B",
      villaId: null,
      taskCategory: null,
    },
  ];
  assert.equal(
    userHasScopeForTask(scopes, {
      scopeType: "operations",
      projectId: "PROJ_B",
      villaId: "V99",
      category: "x",
    }),
    true,
  );
  assert.equal(
    userHasScopeForTask(scopes, {
      scopeType: "operations",
      projectId: "PROJ_C",
      villaId: "V99",
      category: "x",
    }),
    false,
  );
});

// -----------------------------------------------------------------------------
// Permission matrix
// -----------------------------------------------------------------------------
test("permission matrix exposes all v9A keys", async () => {
  const mod = await import("../src/features/auth/permission-matrix");
  for (const k of [
    "availability.read",
    "availability.write",
    "front_office.read",
    "front_office.write",
    "readiness.read",
    "readiness.write",
    "responsibility_scopes.read",
    "responsibility_scopes.manage",
    "security.read",
    "security.manage",
  ]) {
    assert.ok(
      Array.isArray(mod.ROLE_CAPABILITIES[k]),
      `missing v9A capability: ${k}`,
    );
    assert.ok(
      mod.ROLE_CAPABILITIES[k].includes("super_admin"),
      `super_admin should have ${k}`,
    );
  }
  // booking_manager owns front-office + availability.
  assert.ok(
    mod.ROLE_CAPABILITIES["front_office.write"].includes("booking_manager"),
  );
  assert.ok(
    mod.ROLE_CAPABILITIES["availability.write"].includes("booking_manager"),
  );
  // Owner roles must not see security.
  assert.ok(
    !mod.ROLE_CAPABILITIES["security.read"].includes("investor_owner" as never),
  );
  assert.ok(
    !mod.ROLE_CAPABILITIES["security.manage"].includes("investor_viewer" as never),
  );
});

test("isOwnerSafeCameraSurface always returns false (defence in depth)", async () => {
  const { isOwnerSafeCameraSurface } = await import(
    "../src/features/security/visibility"
  );
  assert.equal(isOwnerSafeCameraSurface(), false);
});
