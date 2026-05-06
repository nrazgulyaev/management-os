/**
 * Prompt 101 — Owner Calendar & Villa Health Reports.
 *
 * Pure-logic + source-grep tests covering:
 *   • maskGuestName edge cases (mixed case, single token, empty,
 *     whitespace, hyphenated last names).
 *   • eventOverlapsDate honours half-open `[start, end)` semantics so
 *     the calendar agrees with `bookings.check_in <= d < check_out`.
 *   • ownerSafeBookingProjection silently drops email / phone / any
 *     extra field — owner UI can never accidentally render them.
 *   • mergeCalendarSources returns events sorted by `startDate` then
 *     by source priority, and respects the four preference flags
 *     (guest names / country / channel labels / maintenance details).
 *   • calculateVillaHealthScore + classifyVillaHealthStatus produce
 *     the documented thresholds, and the negative-review penalty is
 *     bounded.
 *   • aggregateReviewRating filters non-published / non-owner-visible.
 *   • countBlockedNights mirrors half-open semantics.
 *   • summarizeVillaHealthExplanation is deterministic (same input →
 *     identical lines).
 *   • Permission matrix: investor roles get `.read` only,
 *     booking_manager / finance_manager / concierge can NOT manage
 *     health, field roles are excluded everywhere.
 *   • Migration 0023 pins the `owner_visible_events.source_type`
 *     enum and the `villa_health_snapshots.health_status` enum.
 *   • Source grep: owner routes don't reference any guest-private
 *     field (email / phone / token_hash / password_ciphertext /
 *     code_display / camera URLs / staff private notes / storage_path).
 *
 * No DB / no `server-only` import.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");

// -----------------------------------------------------------------------------
// maskGuestName
// -----------------------------------------------------------------------------
test("maskGuestName produces owner-safe labels", async () => {
  const { maskGuestName } = await import(
    "../src/features/owner-intelligence/calendar-pure"
  );
  assert.equal(maskGuestName("Emma Whitmore"), "Emma W.");
  assert.equal(maskGuestName("ALICIA KEYS-COOPER"), "Alicia K.");
  assert.equal(maskGuestName("  Made  "), "Made");
  assert.equal(maskGuestName(""), "Guest");
  assert.equal(maskGuestName(null), "Guest");
  assert.equal(maskGuestName(undefined), "Guest");
  assert.equal(maskGuestName("   "), "Guest");
  // Single token stays as a first name only.
  assert.equal(maskGuestName("madonna"), "Madonna");
  // Multi-word middle is collapsed: only first + last initial.
  assert.equal(maskGuestName("María Del Carmen Pérez"), "María P.");
});

// -----------------------------------------------------------------------------
// eventOverlapsDate — half-open semantics
// -----------------------------------------------------------------------------
test("eventOverlapsDate honours half-open [start, end) semantics", async () => {
  const { eventOverlapsDate } = await import(
    "../src/features/owner-intelligence/calendar-pure"
  );
  // 4-night booking, check-in 2026-04-26, check-out 2026-04-30.
  const ev = { startDate: "2026-04-26", endDate: "2026-04-30" };
  assert.equal(eventOverlapsDate(ev, "2026-04-25"), false);
  assert.equal(eventOverlapsDate(ev, "2026-04-26"), true);
  assert.equal(eventOverlapsDate(ev, "2026-04-29"), true);
  // Check-out day is NOT covered (matches bookings convention).
  assert.equal(eventOverlapsDate(ev, "2026-04-30"), false);
  assert.equal(eventOverlapsDate(ev, "2026-05-01"), false);
  // Open-ended event: only start matters.
  const open = { startDate: "2026-04-15", endDate: null };
  assert.equal(eventOverlapsDate(open, "2026-04-14"), false);
  assert.equal(eventOverlapsDate(open, "2026-04-15"), true);
  assert.equal(eventOverlapsDate(open, "2026-12-31"), true);
});

// -----------------------------------------------------------------------------
// ownerSafeBookingProjection — never carries email / phone
// -----------------------------------------------------------------------------
test("ownerSafeBookingProjection drops email / phone / extra fields", async () => {
  const { ownerSafeBookingProjection } = await import(
    "../src/features/owner-intelligence/calendar-pure"
  );
  const projected = ownerSafeBookingProjection({
    id: "b1",
    villaId: "v1",
    villaCode: "EV-S5",
    checkIn: "2026-04-26",
    checkOut: "2026-04-30",
    status: "confirmed",
    channelLabel: "Airbnb",
    guestFullName: "Emma Whitmore",
    guestCountry: "GB",
    guestCount: 4,
    // The next fields exist on the raw type but must never make it
    // through. We cast through `unknown` so TypeScript would still
    // allow stranger shapes via the seam-argument pattern.
    ...({
      guestEmail: "emma@example.com",
      guestPhone: "+44 20 7000 0000",
      tokenHash: "deadbeef",
      passwordCiphertext: "ENCRYPTED",
      codeDisplay: "1234",
      cameraUrl: "rtsp://internal.cam/1",
      staffPrivateNotes: "owner is picky",
      storagePath: "buckets/private/x.png",
    } as Record<string, unknown>),
  });
  assert.deepEqual(Object.keys(projected).sort(), [
    "channelLabel",
    "checkIn",
    "checkOut",
    "guestCount",
    "guestCountry",
    "guestFullName",
    "id",
    "status",
    "villaCode",
    "villaId",
  ]);
  for (const banned of [
    "guestEmail",
    "guestPhone",
    "tokenHash",
    "passwordCiphertext",
    "codeDisplay",
    "cameraUrl",
    "staffPrivateNotes",
    "storagePath",
  ]) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(projected, banned),
      false,
      `projection accidentally carried ${banned}`,
    );
  }
});

// -----------------------------------------------------------------------------
// mergeCalendarSources — sort + preferences
// -----------------------------------------------------------------------------
test("mergeCalendarSources sorts and respects preference flags", async () => {
  const { mergeCalendarSources } = await import(
    "../src/features/owner-intelligence/calendar-pure"
  );
  const merged = mergeCalendarSources({
    bookings: [
      {
        id: "b1",
        villaId: "v1",
        villaCode: "EV-S5",
        checkIn: "2026-04-25",
        checkOut: "2026-04-30",
        status: "confirmed",
        channelLabel: "Airbnb",
        guestFullName: "Emma Whitmore",
        guestCountry: "GB",
        guestCount: 4,
      },
    ],
    ownerStays: [
      {
        id: "os1",
        villaId: "v1",
        villaCode: "EV-S5",
        startDate: "2026-04-20",
        endDate: "2026-04-23",
        status: "approved",
      },
    ],
    blocks: [
      {
        id: "blk1",
        villaId: "v1",
        villaCode: "EV-S5",
        source: "maintenance_block",
        startDate: "2026-04-22",
        endDate: "2026-04-24",
        reason: "AC service",
      },
    ],
    tasks: [
      {
        id: "t1",
        villaId: "v1",
        villaCode: "EV-S5",
        source: "housekeeping_task",
        scheduledFor: "2026-04-30",
        title: "Departure clean",
      },
    ],
    preferences: {
      showGuestNames: true,
      showGuestCountry: true,
      showChannelLabels: true,
      showMaintenanceDetails: true,
    },
  });
  // Sorted by startDate ascending.
  const dates = merged.map((e) => e.startDate);
  for (let i = 1; i < dates.length; i++) {
    assert.ok(dates[i - 1] <= dates[i], "events not sorted by startDate");
  }
  const booking = merged.find((e) => e.source === "booking");
  assert.ok(booking);
  assert.equal(booking.guestDisplayName, "Emma W.");
  assert.equal(booking.guestCountry, "GB");
  assert.equal(booking.channelLabel, "Airbnb");
  // Maintenance reason surfaced when the flag is on.
  const maintenance = merged.find((e) => e.source === "maintenance_block");
  assert.ok(maintenance);
  assert.equal(maintenance.title, "AC service");

  // Now hide everything.
  const merged2 = mergeCalendarSources({
    bookings: [
      {
        id: "b1",
        villaId: "v1",
        villaCode: "EV-S5",
        checkIn: "2026-04-25",
        checkOut: "2026-04-30",
        status: "confirmed",
        channelLabel: "Airbnb",
        guestFullName: "Emma Whitmore",
        guestCountry: "GB",
        guestCount: 4,
      },
    ],
    ownerStays: [],
    blocks: [
      {
        id: "blk1",
        villaId: "v1",
        villaCode: "EV-S5",
        source: "maintenance_block",
        startDate: "2026-04-22",
        endDate: "2026-04-24",
        reason: "AC service",
      },
    ],
    tasks: [],
    preferences: {
      showGuestNames: false,
      showGuestCountry: false,
      showChannelLabels: false,
      showMaintenanceDetails: false,
    },
  });
  const b2 = merged2.find((e) => e.source === "booking");
  assert.ok(b2);
  assert.equal(b2.guestDisplayName, null);
  assert.equal(b2.guestCountry, null);
  assert.equal(b2.channelLabel, null);
  // Title falls back to the safe placeholder when the name is hidden.
  assert.equal(b2.title, "Guest stay");
  const m2 = merged2.find((e) => e.source === "maintenance_block");
  assert.ok(m2);
  // Reason hidden when showMaintenanceDetails is off.
  assert.equal(m2.title, "Maintenance");
});

// -----------------------------------------------------------------------------
// Health scoring
// -----------------------------------------------------------------------------
test("calculateVillaHealthScore + classifyVillaHealthStatus thresholds", async () => {
  const { calculateVillaHealthScore, classifyVillaHealthStatus } =
    await import("../src/features/owner-intelligence/health-pure");

  const excellent = calculateVillaHealthScore({
    bookedNights: 27,
    availableNights: 30,
    ownerStayNights: 1,
    maintenanceBlockedNights: 0,
    housekeepingTasksCompleted: 12,
    maintenanceTicketsOpen: 0,
    maintenanceTicketsCompleted: 4,
    preventiveTasksDue: 0,
    utilityRiskCount: 0,
    averageReviewRating: 4.9,
    negativeReviewCount: 0,
    reserveBalanceMinor: 1_500_000n,
    reserveCurrency: "USD",
  });
  assert.ok(excellent.score >= 85, `expected excellent, got ${excellent.score}`);
  assert.equal(excellent.status, "excellent");

  const attention = calculateVillaHealthScore({
    bookedNights: 6,
    availableNights: 30,
    ownerStayNights: 0,
    maintenanceBlockedNights: 5,
    housekeepingTasksCompleted: 5,
    maintenanceTicketsOpen: 4,
    maintenanceTicketsCompleted: 1,
    preventiveTasksDue: 4,
    utilityRiskCount: 3,
    averageReviewRating: 2.4,
    negativeReviewCount: 2,
    reserveBalanceMinor: 50_000n,
    reserveCurrency: "USD",
  });
  assert.ok(attention.score < 55, `expected attention, got ${attention.score}`);
  assert.equal(attention.status, "attention");

  // Boundary: a borderline 70 should classify as 'good'.
  assert.equal(classifyVillaHealthStatus(70), "good");
  assert.equal(classifyVillaHealthStatus(69.99), "watch");
  assert.equal(classifyVillaHealthStatus(85), "excellent");
  assert.equal(classifyVillaHealthStatus(54), "attention");
  assert.equal(classifyVillaHealthStatus(null), "unknown");

  // Negative penalty is bounded.
  const heavyNegative = calculateVillaHealthScore({
    bookedNights: 27,
    availableNights: 30,
    ownerStayNights: 0,
    maintenanceBlockedNights: 0,
    housekeepingTasksCompleted: 12,
    maintenanceTicketsOpen: 0,
    maintenanceTicketsCompleted: 4,
    preventiveTasksDue: 0,
    utilityRiskCount: 0,
    averageReviewRating: 4.9,
    negativeReviewCount: 50,
    reserveBalanceMinor: 1_500_000n,
    reserveCurrency: "USD",
  });
  assert.ok(heavyNegative.score >= 0);
  // Penalty caps at 20, so the score should not be more than 20 below
  // the no-negative version.
  assert.ok(excellent.score - heavyNegative.score <= 20.5);
});

test("aggregateReviewRating filters non-published / non-owner-visible", async () => {
  const { aggregateReviewRating } = await import(
    "../src/features/owner-intelligence/health-pure"
  );
  const reviews = [
    { rating: 4.9, status: "published", ownerVisible: true },
    { rating: 4.0, status: "published", ownerVisible: true },
    { rating: 1.5, status: "hidden", ownerVisible: false },
    { rating: 2.0, status: "draft", ownerVisible: true },
    { rating: null, status: "published", ownerVisible: true },
    { rating: 3.0, status: "published", ownerVisible: false },
  ];
  const adminAggregate = aggregateReviewRating(reviews);
  assert.equal(adminAggregate.sampleSize, 3);
  assert.equal(
    adminAggregate.average,
    Math.round(((4.9 + 4.0 + 3.0) / 3) * 100) / 100,
  );
  const ownerAggregate = aggregateReviewRating(reviews, { ownerMode: true });
  assert.equal(ownerAggregate.sampleSize, 2);
  assert.equal(
    ownerAggregate.average,
    Math.round(((4.9 + 4.0) / 2) * 100) / 100,
  );
});

test("countBlockedNights uses half-open semantics", async () => {
  const { countBlockedNights } = await import(
    "../src/features/owner-intelligence/health-pure"
  );
  const blocks: Array<{
    startDate: string;
    endDate: string;
    source: "maintenance_block" | "internal_hold" | "out_of_order";
  }> = [
    { startDate: "2026-04-01", endDate: "2026-04-04", source: "maintenance_block" },
    { startDate: "2026-04-10", endDate: "2026-04-12", source: "internal_hold" },
    { startDate: "2026-04-20", endDate: "2026-04-20", source: "out_of_order" },
  ];
  assert.equal(countBlockedNights(blocks), 5); // 3 + 2 + 0
  assert.equal(countBlockedNights(blocks, "maintenance_block"), 3);
  assert.equal(countBlockedNights(blocks, "internal_hold"), 2);
});

test("summarizeVillaHealthExplanation is deterministic", async () => {
  const { summarizeVillaHealthExplanation } = await import(
    "../src/features/owner-intelligence/health-pure"
  );
  const input = {
    villaName: "Eternal S5",
    periodStart: "2026-04-01",
    periodEnd: "2026-04-30",
    bookedNights: 18,
    availableNights: 30,
    ownerStayNights: 1,
    maintenanceBlockedNights: 3,
    housekeepingTasksCompleted: 12,
    maintenanceTicketsOpen: 1,
    maintenanceTicketsCompleted: 3,
    preventiveTasksDue: 2,
    utilityRiskCount: 1,
    averageReviewRating: 4.1,
    negativeReviewCount: 0,
    reserveBalanceMinor: 780_000n,
    reserveCurrency: "USD",
  };
  const a = summarizeVillaHealthExplanation(input);
  const b = summarizeVillaHealthExplanation(input);
  assert.deepEqual(a, b);
  assert.ok(a.length >= 5);
  assert.ok(a[0].includes("Eternal S5"));
  assert.ok(a[0].includes("60% occupancy")); // 18/30 = 60%
});

// -----------------------------------------------------------------------------
// Permission matrix
// -----------------------------------------------------------------------------
test("permission matrix — investor reads, owners can't manage, field roles excluded", async () => {
  const { ROLE_CAPABILITIES } = await import(
    "../src/features/auth/permission-matrix"
  );
  const allows = (perm: string, role: string): boolean =>
    (ROLE_CAPABILITIES[perm] ?? []).includes(role as never);

  // Investors get reads.
  assert.equal(allows("owner_calendar.read", "investor_owner"), true);
  assert.equal(allows("owner_calendar.read", "investor_viewer"), true);
  assert.equal(allows("villa_health.read", "investor_owner"), true);
  assert.equal(allows("villa_health.read", "investor_viewer"), true);
  assert.equal(allows("guest_review.read", "investor_owner"), true);

  // Investors do NOT get any management or write capability.
  assert.equal(allows("owner_calendar.manage", "investor_owner"), false);
  assert.equal(allows("villa_health.generate", "investor_owner"), false);
  assert.equal(allows("guest_review.write", "investor_owner"), false);
  assert.equal(allows("guest_review.manage", "investor_owner"), false);

  // booking_manager can read but cannot generate health snapshots.
  assert.equal(allows("villa_health.read", "booking_manager"), true);
  assert.equal(allows("villa_health.generate", "booking_manager"), false);

  // finance_manager: read but no manage.
  assert.equal(allows("owner_calendar.read", "finance_manager"), true);
  assert.equal(allows("owner_calendar.manage", "finance_manager"), false);

  // Field roles are excluded everywhere.
  for (const role of [
    "housekeeping_supervisor",
    "housekeeper",
    "maintenance_lead",
    "maintenance_tech",
  ]) {
    assert.equal(
      allows("owner_calendar.read", role),
      false,
      `${role} should not read owner calendar`,
    );
    assert.equal(
      allows("villa_health.read", role),
      false,
      `${role} should not read villa health`,
    );
    assert.equal(
      allows("guest_review.read", role),
      false,
      `${role} should not read guest reviews`,
    );
  }
});

// -----------------------------------------------------------------------------
// Migration source pinning
// -----------------------------------------------------------------------------
test("migration 0023 pins owner_visible_events.source_type enum", () => {
  const sql = readFileSync(
    join(repoRoot, "drizzle/0023_owner_calendar_health_reports.sql"),
    "utf-8",
  );
  for (const value of [
    "'booking'",
    "'owner_stay'",
    "'maintenance_block'",
    "'housekeeping_task'",
    "'maintenance_ticket'",
    "'review'",
    "'statement'",
    "'reserve'",
    "'utility'",
    "'readiness'",
  ]) {
    assert.ok(
      sql.includes(value),
      `migration missing owner_visible_events source_type ${value}`,
    );
  }
  // Severity enum
  for (const v of ["'info'", "'success'", "'warning'", "'critical'"]) {
    assert.ok(sql.includes(v), `migration missing severity ${v}`);
  }
  // Health-status enum
  for (const v of ["'excellent'", "'good'", "'watch'", "'attention'", "'unknown'"]) {
    assert.ok(sql.includes(v), `migration missing health_status ${v}`);
  }
  // RLS enabled + forced + ownership scope hook present.
  assert.ok(sql.includes("ENABLE ROW LEVEL SECURITY"));
  assert.ok(sql.includes("FORCE ROW LEVEL SECURITY"));
  assert.ok(sql.includes("public.current_owner_ids()"));
  assert.ok(sql.includes("ownership_shares"));
});

// -----------------------------------------------------------------------------
// Source grep — owner routes never reference banned guest fields.
// -----------------------------------------------------------------------------
const BANNED_TOKENS = [
  "guest.email",
  "guest.phone",
  "guests.email",
  "guests.phone",
  "guestEmail",
  "guestPhone",
  "tokenHash",
  "token_hash",
  "passwordCiphertext",
  "password_ciphertext",
  "codeDisplay",
  "code_display",
  "displayPassword",
  "display_password",
  "rawToken",
  "raw_token",
  "rtsp://",
  "staffPrivateNotes",
  "staff_private_notes",
  "internalNotes",
  "internal_notes",
  "storagePath",
  "storage_path",
];

function walk(dir: string, files: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, files);
    else if (s.isFile() && /\.(ts|tsx)$/.test(name)) files.push(p);
  }
  return files;
}

test("owner routes do not reference banned guest-private fields", () => {
  const ownerRoot = join(repoRoot, "src/app/(owner)");
  const files = walk(ownerRoot);
  for (const f of files) {
    const body = readFileSync(f, "utf-8");
    for (const token of BANNED_TOKENS) {
      assert.equal(
        body.includes(token),
        false,
        `owner route ${f} mentions banned token "${token}"`,
      );
    }
  }
});
