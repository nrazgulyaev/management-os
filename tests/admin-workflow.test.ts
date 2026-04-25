/**
 * Lightweight node:test smoke tests for v2.5 hardening.
 * Run with: npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";

test("share schema rejects 0 and >100", async () => {
  const { createShareSchema } = await import("../src/features/shares/schema");
  assert.equal(
    createShareSchema.safeParse({
      ownerId: "00000000-0000-0000-0000-000000000001",
      villaId: "00000000-0000-0000-0000-000000000002",
      sharePercent: 0,
      model: "individual",
      startsOn: "2025-01-01",
      status: "active",
    }).success,
    false,
  );
  assert.equal(
    createShareSchema.safeParse({
      ownerId: "00000000-0000-0000-0000-000000000001",
      villaId: "00000000-0000-0000-0000-000000000002",
      sharePercent: 101,
      model: "individual",
      startsOn: "2025-01-01",
      status: "active",
    }).success,
    false,
  );
});

test("share schema requires villa or project", async () => {
  const { createShareSchema } = await import("../src/features/shares/schema");
  const r = createShareSchema.safeParse({
    ownerId: "00000000-0000-0000-0000-000000000001",
    sharePercent: 50,
    model: "individual",
    startsOn: "2025-01-01",
    status: "active",
  });
  assert.equal(r.success, false);
});

test("share schema enforces pooled = project, individual = villa", async () => {
  const { createShareSchema } = await import("../src/features/shares/schema");
  const pooledOnVilla = createShareSchema.safeParse({
    ownerId: "00000000-0000-0000-0000-000000000001",
    villaId: "00000000-0000-0000-0000-000000000002",
    sharePercent: 50,
    model: "pooled",
    startsOn: "2025-01-01",
    status: "active",
  });
  assert.equal(pooledOnVilla.success, false);

  const individualOnProject = createShareSchema.safeParse({
    ownerId: "00000000-0000-0000-0000-000000000001",
    projectId: "00000000-0000-0000-0000-000000000003",
    sharePercent: 50,
    model: "individual",
    startsOn: "2025-01-01",
    status: "active",
  });
  assert.equal(individualOnProject.success, false);
});

test("computeShareTotals flags exceed and under-allocation", async () => {
  const { computeShareTotals } = await import("../src/features/shares/totals");
  const totals = computeShareTotals([
    {
      id: "1", ownerId: "o1", ownerName: "A",
      villaId: "v1", villaCode: "EV-S1",
      projectId: null, projectName: null,
      sharePercent: 60, model: "individual",
      startsOn: "2024-01-01", endsOn: null, status: "active",
    },
    {
      id: "2", ownerId: "o2", ownerName: "B",
      villaId: "v1", villaCode: "EV-S1",
      projectId: null, projectName: null,
      sharePercent: 50, model: "individual",
      startsOn: "2024-01-01", endsOn: null, status: "active",
    },
    {
      id: "3", ownerId: "o3", ownerName: "C",
      villaId: "v2", villaCode: "EV-S2",
      projectId: null, projectName: null,
      sharePercent: 40, model: "individual",
      startsOn: "2024-01-01", endsOn: null, status: "active",
    },
  ]);
  const v1 = totals.find((t) => t.scopeId === "v1")!;
  const v2 = totals.find((t) => t.scopeId === "v2")!;
  assert.equal(v1.exceedsHundred, true);
  assert.equal(v2.underAllocated, true);
});

test("booking schema enforces check_out > check_in", async () => {
  const { createBookingSchema } = await import("../src/features/bookings/schema");
  const r = createBookingSchema.safeParse({
    villaId: "00000000-0000-0000-0000-000000000001",
    bookingCode: "ARC-T-1",
    status: "confirmed",
    checkIn: "2026-04-25",
    checkOut: "2026-04-25",
    currency: "USD",
    grossAmount: 100,
    cleaningFeeAmount: 0,
    channelFeeAmount: 0,
    paymentFeeAmount: 0,
  });
  assert.equal(r.success, false);
});

test("hasPermission grants super_admin everything; matrix gates others", async () => {
  const { hasPermission } = await import("../src/features/auth/permission-matrix");
  const adminCtx = {
    mode: "live" as const,
    appUser: { id: "u", email: "a@b", fullName: "A", status: "active" },
    roles: ["super_admin" as const],
    isInternal: true,
    isSuperAdmin: true,
  };
  const accountantCtx = {
    mode: "live" as const,
    appUser: { id: "u", email: "a@b", fullName: "A", status: "active" },
    roles: ["accountant" as const],
    isInternal: true,
    isSuperAdmin: false,
  };
  assert.equal(hasPermission(adminCtx, "projects.write"), true);
  assert.equal(hasPermission(accountantCtx, "projects.write"), false);
  assert.equal(hasPermission(accountantCtx, "owners.read"), true);
});
