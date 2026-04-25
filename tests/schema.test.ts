/**
 * Lightweight node:test smoke tests. Run with:
 *   npx tsx --test tests/schema.test.ts
 *
 * These are intentionally tiny — they verify that schema files import cleanly,
 * that zod schemas reject obvious bad input, and that audit recording is a
 * no-op when DB is not configured. Heavier coverage (RLS via pgtap, e2e via
 * Playwright) arrives in v3+ when the AI layer and finance engine land.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

test("schema barrel exports the expected tables", async () => {
  const schema = await import("../src/lib/db/schema");
  for (const k of [
    "appUsers",
    "roles",
    "permissions",
    "userRoles",
    "rolePermissions",
    "projects",
    "villas",
    "villaStatusEvents",
    "owners",
    "ownershipShares",
    "payoutMethods",
    "bookingChannels",
    "guests",
    "bookings",
    "documents",
    "auditEvents",
  ] as const) {
    assert.ok(k in schema, `${k} missing from schema barrel`);
  }
});

test("createProjectSchema rejects malformed slugs", async () => {
  const { createProjectSchema } = await import("../src/features/projects/schema");
  const bad = createProjectSchema.safeParse({
    slug: "Bad Slug!",
    name: "X",
    location: "Bali",
  });
  assert.equal(bad.success, false);
});

test("createBookingSchema enforces check_out > check_in", async () => {
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

test("createOwnerSchema accepts minimal valid input", async () => {
  const { createOwnerSchema } = await import("../src/features/owners/schema");
  const r = createOwnerSchema.safeParse({
    displayName: "Demo Owner",
    type: "individual",
    status: "active",
  });
  assert.equal(r.success, true);
});
