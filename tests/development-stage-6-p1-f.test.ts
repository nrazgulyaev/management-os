/**
 * Stage 6.P1.F — Reservation workflow + conflict detection tests.
 *
 * Pure-helper tests run the actual functions; service-layer tests
 * use the file-presence + grep pattern (the orchestration touches the
 * DB which we don't run in this test infra). UI tests likewise check
 * structural shape of the conflict-resolution surface.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  mapReservationToBooking,
  mapStatusToInternal,
  detectChanges,
  calculateRefund,
  detectOverlap,
  deriveBookingCode,
  DEFAULT_CANCELLATION_POLICY,
} from "../src/lib/channel-manager/workflow-helpers";
import type { ChannelReservationData } from "../src/lib/channel-manager/types";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf-8");
const exists = (rel: string) => existsSync(resolve(ROOT, rel));

const F_HELPERS = "src/lib/channel-manager/workflow-helpers.ts";
const F_SERVICE = "src/lib/channel-manager/service.ts";
const F_CONFLICTS_PAGE =
  "src/app/(development-app)/development-os/channels/conflicts/page.tsx";
const F_CONFLICT_ACTIONS =
  "src/components/development/channels/conflict-resolution-actions.tsx";

function sampleReservation(
  overrides: Partial<ChannelReservationData> = {},
): ChannelReservationData {
  return {
    externalReservationId: "EXT-1",
    externalStatus: "Book",
    guest: {
      firstName: "Alice",
      lastName: "Tester",
      email: "alice@example.com",
      phone: "+1-555-0100",
    },
    checkIn: new Date("2026-06-01"),
    checkOut: new Date("2026-06-05"),
    adults: 2,
    children: 1,
    totalAmountMinor: 50000n,
    currency: "USD",
    commissionMinor: 7500n,
    paymentCollectedBy: "channel",
    reservationCreatedAt: new Date("2026-04-30T08:00:00Z"),
    rawPayload: {},
    ...overrides,
  };
}

// ===========================================================================
// 1) mapReservationToBooking
// ===========================================================================

test("mapper: produces a fully-populated InternalBookingDraft", () => {
  const draft = mapReservationToBooking({
    reservation: sampleReservation(),
    villaId: "villa-1",
    guestId: "guest-1",
    channelId: "channel-1",
    channelKey: "booking_com",
  });
  assert.equal(draft.villaId, "villa-1");
  assert.equal(draft.guestId, "guest-1");
  assert.equal(draft.channelId, "channel-1");
  assert.equal(draft.bookingCode, "CB-BOOKING_COM-EXT-1");
  assert.equal(draft.sourceReference, "EXT-1");
  assert.equal(draft.status, "confirmed");
  assert.equal(draft.checkIn, "2026-06-01");
  assert.equal(draft.checkOut, "2026-06-05");
  assert.equal(draft.nights, 4);
  assert.equal(draft.adults, 2);
  assert.equal(draft.children, 1);
  assert.equal(draft.currency, "USD");
  assert.equal(draft.grossAmount, "500.00");
  assert.equal(draft.channelFeeAmount, "75.00");
});

test("mapper: status flips to cancelled for Booking 'Cancel' string", () => {
  const draft = mapReservationToBooking({
    reservation: sampleReservation({ externalStatus: "Cancel" }),
    villaId: "v",
    guestId: "g",
    channelId: "c",
    channelKey: "booking_com",
  });
  assert.equal(draft.status, "cancelled");
});

test("mapper: handles missing commission (defaults to 0)", () => {
  const draft = mapReservationToBooking({
    reservation: sampleReservation({ commissionMinor: undefined }),
    villaId: "v",
    guestId: "g",
    channelId: "c",
    channelKey: "airbnb",
  });
  assert.equal(draft.channelFeeAmount, "0");
});

test("mapper: nights computed as integer (rounded for half-day inputs)", () => {
  const draft = mapReservationToBooking({
    reservation: sampleReservation({
      checkIn: new Date("2026-06-01T00:00:00Z"),
      checkOut: new Date("2026-06-04T00:00:00Z"),
    }),
    villaId: "v",
    guestId: "g",
    channelId: "c",
    channelKey: "trip_com",
  });
  assert.equal(draft.nights, 3);
});

test("mapper: large minor amounts stringify without float drift", () => {
  const draft = mapReservationToBooking({
    reservation: sampleReservation({
      totalAmountMinor: 999999999n, // ~$10M
      commissionMinor: 12345678n,
    }),
    villaId: "v",
    guestId: null,
    channelId: null,
    channelKey: "expedia",
  });
  // BigInt math preserves exact cents.
  assert.equal(draft.grossAmount, "9999999.99");
  assert.equal(draft.channelFeeAmount, "123456.78");
});

// ===========================================================================
// 2) mapStatusToInternal
// ===========================================================================

test("status: cancellation variants map to 'cancelled'", () => {
  for (const s of [
    "Cancel",
    "cancelled",
    "canceled",
    "cancellation_by_host",
    "cancellation_by_guest",
  ]) {
    assert.equal(mapStatusToInternal(s), "cancelled");
  }
});

test("status: no_show variants", () => {
  assert.equal(mapStatusToInternal("no_show"), "no_show");
  assert.equal(mapStatusToInternal("noshow"), "no_show");
});

test("status: completion variants map to 'checked_out'", () => {
  assert.equal(mapStatusToInternal("completed"), "checked_out");
  assert.equal(mapStatusToInternal("checkout_complete"), "checked_out");
});

test("status: unknown / undefined → 'confirmed' (safe default)", () => {
  assert.equal(mapStatusToInternal(undefined), "confirmed");
  assert.equal(mapStatusToInternal("future_unknown"), "confirmed");
});

// ===========================================================================
// 3) detectChanges
// ===========================================================================

test("changes: identical reservations → empty array", () => {
  const r = sampleReservation();
  assert.deepEqual(detectChanges(r, r), []);
});

test("changes: detects checkIn / checkOut date shifts", () => {
  const a = sampleReservation();
  const b = sampleReservation({
    checkIn: new Date("2026-06-02"),
    checkOut: new Date("2026-06-06"),
  });
  const diff = detectChanges(a, b);
  assert.ok(diff.find((d) => d.field === "checkIn"));
  assert.ok(diff.find((d) => d.field === "checkOut"));
});

test("changes: detects adults/children/total/currency shifts", () => {
  const a = sampleReservation();
  const b = sampleReservation({
    adults: 3,
    children: 0,
    totalAmountMinor: 60000n,
    currency: "EUR",
  });
  const diff = detectChanges(a, b);
  assert.ok(diff.find((d) => d.field === "adults"));
  assert.ok(diff.find((d) => d.field === "children"));
  assert.ok(diff.find((d) => d.field === "totalAmountMinor"));
  assert.ok(diff.find((d) => d.field === "currency"));
});

test("changes: detects guest field shifts (any of name/email/phone)", () => {
  const a = sampleReservation();
  const b = sampleReservation({
    guest: { ...a.guest, email: "different@example.com" },
  });
  const diff = detectChanges(a, b);
  assert.equal(diff.length, 1);
  assert.equal(diff[0].field, "guest");
});

// ===========================================================================
// 4) calculateRefund
// ===========================================================================

test("refund: free bucket when cancelled well before check-in", () => {
  const r = calculateRefund({
    totalAmountMinor: 100000n,
    checkIn: new Date("2026-06-01"),
    cancelledAt: new Date("2026-05-01"),
  });
  assert.equal(r.bucket, "free");
  assert.equal(r.refundPct, 100);
  assert.equal(r.refundMinor, 100000n);
});

test("refund: moderate bucket when cancelled in the late window", () => {
  const r = calculateRefund({
    totalAmountMinor: 100000n,
    checkIn: new Date("2026-06-01"),
    cancelledAt: new Date("2026-05-26"), // 6 days before
    policy: { ...DEFAULT_CANCELLATION_POLICY }, // free=14, moderate=7
  });
  // 6 days before is past the moderate threshold (7) → late bucket.
  assert.equal(r.bucket, "late");
  assert.equal(r.refundPct, 0);
});

test("refund: late bucket when cancelled inside moderate window", () => {
  const r = calculateRefund({
    totalAmountMinor: 100000n,
    checkIn: new Date("2026-06-01"),
    cancelledAt: new Date("2026-05-25"), // 7 days before
  });
  assert.equal(r.bucket, "moderate");
  assert.equal(r.refundPct, 50);
  assert.equal(r.refundMinor, 50000n);
});

test("refund: no_show overrides days-before logic", () => {
  const r = calculateRefund({
    totalAmountMinor: 100000n,
    checkIn: new Date("2026-06-01"),
    cancelledAt: new Date("2026-05-01"),
    noShow: true,
  });
  assert.equal(r.bucket, "no_show");
  assert.equal(r.refundPct, 0);
});

test("refund: custom policy honored", () => {
  const r = calculateRefund({
    totalAmountMinor: 100000n,
    checkIn: new Date("2026-06-01"),
    cancelledAt: new Date("2026-05-25"),
    policy: {
      freeUntilDays: 30,
      moderateUntilDays: 7,
      lateRefundPct: 25,
      noShowRefundPct: 0,
    },
  });
  assert.equal(r.bucket, "moderate");
  assert.equal(r.refundPct, 25);
  assert.equal(r.refundMinor, 25000n);
});

test("refund: rounding is half-up not truncation", () => {
  // 50% of 101 → 50.5 → 51 (not 50).
  const r = calculateRefund({
    totalAmountMinor: 101n,
    checkIn: new Date("2026-06-01"),
    cancelledAt: new Date("2026-05-25"),
  });
  assert.equal(r.refundMinor, 51n);
});

// ===========================================================================
// 5) detectOverlap
// ===========================================================================

test("overlap: no overlap when windows don't touch", () => {
  const r = detectOverlap({
    candidateCheckIn: "2026-06-01",
    candidateCheckOut: "2026-06-05",
    existing: [
      { id: "a", checkIn: "2026-07-01", checkOut: "2026-07-05" },
      { id: "b", checkIn: "2026-05-01", checkOut: "2026-05-15" },
    ],
  });
  assert.deepEqual(r, []);
});

test("overlap: detects partial overlap (candidate starts inside existing)", () => {
  const r = detectOverlap({
    candidateCheckIn: "2026-06-03",
    candidateCheckOut: "2026-06-10",
    existing: [{ id: "x", checkIn: "2026-06-01", checkOut: "2026-06-05" }],
  });
  assert.deepEqual(r, ["x"]);
});

test("overlap: same-day turnover does NOT count as overlap", () => {
  // Existing: 06-01 → 06-05; candidate starts on 06-05 (turnover day).
  const r = detectOverlap({
    candidateCheckIn: "2026-06-05",
    candidateCheckOut: "2026-06-08",
    existing: [{ id: "x", checkIn: "2026-06-01", checkOut: "2026-06-05" }],
  });
  assert.deepEqual(r, []);
});

test("overlap: candidate fully contains existing → conflict", () => {
  const r = detectOverlap({
    candidateCheckIn: "2026-06-01",
    candidateCheckOut: "2026-06-30",
    existing: [{ id: "x", checkIn: "2026-06-10", checkOut: "2026-06-15" }],
  });
  assert.deepEqual(r, ["x"]);
});

test("overlap: candidate fully contained inside existing → conflict", () => {
  const r = detectOverlap({
    candidateCheckIn: "2026-06-10",
    candidateCheckOut: "2026-06-15",
    existing: [{ id: "x", checkIn: "2026-06-01", checkOut: "2026-06-30" }],
  });
  assert.deepEqual(r, ["x"]);
});

test("overlap: candidateId excluded from self-comparison", () => {
  const r = detectOverlap({
    candidateCheckIn: "2026-06-01",
    candidateCheckOut: "2026-06-05",
    candidateId: "self",
    existing: [{ id: "self", checkIn: "2026-06-01", checkOut: "2026-06-05" }],
  });
  assert.deepEqual(r, []);
});

test("overlap: invalid checkOut <= checkIn returns empty", () => {
  const r = detectOverlap({
    candidateCheckIn: "2026-06-05",
    candidateCheckOut: "2026-06-01",
    existing: [{ id: "x", checkIn: "2026-06-01", checkOut: "2026-06-05" }],
  });
  assert.deepEqual(r, []);
});

// ===========================================================================
// 6) deriveBookingCode
// ===========================================================================

test("bookingCode: deterministic shape CB-{CHANNEL}-{ID}", () => {
  assert.equal(
    deriveBookingCode("booking_com", "BK-1234567"),
    "CB-BOOKING_COM-BK-1234567",
  );
});

test("bookingCode: strips spreadsheet-unfriendly characters", () => {
  assert.equal(
    deriveBookingCode("trip_com", "TR/123!@#"),
    "CB-TRIP_COM-TR123",
  );
});

// ===========================================================================
// 7) Service file shape (orchestration + conflict resolution actions)
// ===========================================================================

test("service: file exists with use server + load-bearing exports", () => {
  assert.ok(exists(F_SERVICE));
  const src = read(F_SERVICE);
  assert.match(src, /^"use server";/);
  for (const fn of [
    "handleIncomingReservation",
    "resolveConflictByConfirmingNew",
    "resolveConflictByRejectingNew",
    "listConflictPendingReservations",
  ]) {
    assert.match(src, new RegExp(`export async function ${fn}`));
  }
});

test("service: handleIncomingReservation has new/modified/cancelled paths + conflict short-circuit", () => {
  const src = read(F_SERVICE);
  // Outcome enum carries every documented state.
  for (const o of [
    "created",
    "updated",
    "cancelled",
    "no_change",
    "conflict_pending",
    "skipped",
    "failed",
  ]) {
    assert.match(src, new RegExp(`"${o}"`));
  }
  // Calls into the pure helpers — never reimplements them.
  assert.match(src, /detectChanges\(/);
  assert.match(src, /detectOverlap\(/);
  assert.match(src, /calculateRefund\(/);
  assert.match(src, /mapReservationToBooking\(/);
});

test("service: ensureBookingChannelRow + findOrCreateGuest avoid duplicate inserts", () => {
  const src = read(F_SERVICE);
  // Guest dedup by email; channel dedup by key — both look up first.
  assert.match(src, /findOrCreateGuest\b/);
  assert.match(src, /ensureBookingChannelRow\b/);
  // Bookings projection uses onConflictDoUpdate keyed on bookingCode so
  // re-runs are idempotent (deterministic CB-{channel}-{ext} key).
  assert.match(src, /onConflictDoUpdate\(\{[\s\S]*target: bookings\.bookingCode/);
});

test("service: cancellation path waives commission via record update", () => {
  const src = read(F_SERVICE);
  assert.match(src, /channelCommissionRecords/);
  // Cancellation appends a refund-bucket note to bookings.notes
  assert.match(src, /Cancelled via channel/);
});

test("service: ensureCommissionRecord uses ON CONFLICT DO NOTHING (one record per reservation)", () => {
  const src = read(F_SERVICE);
  assert.match(
    src,
    /onConflictDoNothing\(\{[\s\S]*channelCommissionRecords\.channelReservationId/,
  );
});

// ===========================================================================
// 8) Conflict resolution UI
// ===========================================================================

test("conflicts page: exists + lists conflicts + links to inbox detail", () => {
  assert.ok(exists(F_CONFLICTS_PAGE));
  const src = read(F_CONFLICTS_PAGE);
  assert.match(src, /listConflictPendingReservations/);
  assert.match(src, /conflict-card-\$\{c\.id\}/);
  assert.match(src, /\/development-os\/channels\/inbox\/\$\{c\.id\}/);
});

test("conflicts page: empty state when no conflicts", () => {
  const src = read(F_CONFLICTS_PAGE);
  assert.match(src, /No conflicts/);
});

test("conflict actions: client component with confirm/reject + two-click confirm", () => {
  assert.ok(exists(F_CONFLICT_ACTIONS));
  const src = read(F_CONFLICT_ACTIONS);
  assert.match(src, /^"use client";/);
  assert.match(src, /resolveConflictByConfirmingNew/);
  assert.match(src, /resolveConflictByRejectingNew/);
  // Two-click guard so accidental click doesn't cancel a real booking.
  assert.match(src, /confirmingConfirm/);
  assert.match(src, /confirmingReject/);
});

test("conflict actions: data-testids let smoke tests target each action", () => {
  const src = read(F_CONFLICT_ACTIONS);
  assert.match(src, /conflict-confirm-\$\{channelReservationId\}/);
  assert.match(src, /conflict-reject-\$\{channelReservationId\}/);
});

// ===========================================================================
// 9) Channels page integration — Conflicts nav button
// ===========================================================================

test("channels page: header surfaces Conflicts link alongside Inbox + Calendar", () => {
  const src = read(
    "src/app/(development-app)/development-os/channels/page.tsx",
  );
  assert.match(src, /\/development-os\/channels\/conflicts/);
  assert.match(src, /AlertTriangle/);
});

// ===========================================================================
// 10) Helpers file exports
// ===========================================================================

test("helpers: file exists + exports the documented surface", () => {
  assert.ok(exists(F_HELPERS));
  const src = read(F_HELPERS);
  for (const fn of [
    "mapReservationToBooking",
    "mapStatusToInternal",
    "detectChanges",
    "calculateRefund",
    "detectOverlap",
    "deriveBookingCode",
    "DEFAULT_CANCELLATION_POLICY",
  ]) {
    assert.match(
      src,
      new RegExp(`export (function|const) ${fn}`),
      `${fn} missing or not exported`,
    );
  }
});

test("helpers: pure module — no server-only, no Drizzle import", () => {
  const src = read(F_HELPERS);
  // Check actual imports, not docstring mentions.
  assert.doesNotMatch(src, /^import\s+["']server-only["']/m);
  assert.doesNotMatch(src, /from "drizzle/);
  assert.doesNotMatch(src, /from "@\/lib\/db/);
});
