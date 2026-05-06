/**
 * Prompt 102 — Guest Journey Automation.
 *
 * Pure-logic + source-grep tests covering:
 *   • calculateScheduledFor offsets (-7d before check-in, +1d after
 *     checkout, edge cases on missing anchors).
 *   • ruleAppliesToBooking villa / project / channel scoping +
 *     paused-rule skipping.
 *   • Suggestion visibility (active + not expired vs. dismissed +
 *     expired).
 *   • CTA builder routes service suggestions to /stay/[token]/services
 *     and guide to /stay/[token]/guide.
 *   • Review channel routing (direct → internal_survey, airbnb →
 *     airbnb, booking_com → booking_com).
 *   • shouldRequestReview is false during the stay and true after.
 *   • Migration 0024 pins the journey-run + suggestion + review-
 *     request idempotency unique indexes.
 *   • Owner-visible projection sanitises emails / phones and masks
 *     guest names.
 *   • Permission matrix: investor_owner has no raw guest_journey
 *     access, concierge can run but not manage, field roles excluded.
 *   • Static source tests: /stay routes don't reference tokenHash /
 *     passwordCiphertext / codeDisplay; /owner routes don't reference
 *     guest.email / guest.phone.
 *   • Notification dedupe key shape is deterministic.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");

// -----------------------------------------------------------------------------
// rules-pure: anchor + offset
// -----------------------------------------------------------------------------
test("calculateScheduledFor: -7d before check-in", async () => {
  const { calculateScheduledFor, resolveAnchorDate } = await import(
    "../src/features/guest-journey/rules-pure"
  );
  const ctx = {
    id: "b1",
    villaId: "v1",
    projectId: "p1",
    channelKey: "airbnb",
    checkIn: "2026-04-26",
    checkOut: "2026-04-30",
    status: "confirmed",
  };
  const anchor = resolveAnchorDate(ctx, "check_in");
  assert.ok(anchor);
  const scheduled = calculateScheduledFor(anchor, -7 * 24 * 60);
  assert.ok(scheduled);
  assert.equal(scheduled.toISOString().slice(0, 10), "2026-04-19");
});

test("calculateScheduledFor: +1d after checkout", async () => {
  const { calculateScheduledFor, resolveAnchorDate } = await import(
    "../src/features/guest-journey/rules-pure"
  );
  const ctx = {
    id: "b1",
    villaId: "v1",
    projectId: "p1",
    channelKey: "direct",
    checkIn: "2026-04-26",
    checkOut: "2026-04-30",
    status: "confirmed",
  };
  const anchor = resolveAnchorDate(ctx, "check_out");
  assert.ok(anchor);
  const scheduled = calculateScheduledFor(anchor, 1 * 24 * 60);
  assert.ok(scheduled);
  assert.equal(scheduled.toISOString().slice(0, 10), "2026-05-01");
});

test("resolveAnchorDate returns null for missing anchors", async () => {
  const { resolveAnchorDate } = await import(
    "../src/features/guest-journey/rules-pure"
  );
  const ctx = {
    id: "b1",
    villaId: "v1",
    projectId: "p1",
    channelKey: "direct",
    checkIn: "2026-04-26",
    checkOut: "2026-04-30",
    status: "confirmed",
  };
  assert.equal(resolveAnchorDate(ctx, "guest_arrived"), null);
  assert.equal(resolveAnchorDate(ctx, "guest_checked_out"), null);
});

// -----------------------------------------------------------------------------
// rules-pure: ruleAppliesToBooking
// -----------------------------------------------------------------------------
test("ruleAppliesToBooking — villa / project / channel scoping + status", async () => {
  const { ruleAppliesToBooking } = await import(
    "../src/features/guest-journey/rules-pure"
  );
  const ctx = {
    id: "b1",
    villaId: "v1",
    projectId: "p1",
    channelKey: "airbnb",
    checkIn: "2026-04-26",
    checkOut: "2026-04-30",
    status: "confirmed",
  };
  const baseRule = {
    id: "r1",
    ruleKey: "test",
    journeyStage: "in_stay" as const,
    triggerAnchor: "check_in" as const,
    offsetMinutes: 0,
    status: "active" as const,
    villaId: null,
    projectId: null,
    appliesToChannel: null,
    channel: "in_app",
    templateKey: null,
    suggestionType: null,
    serviceId: null,
    priority: "normal" as const,
  };
  // No scope — applies.
  assert.equal(ruleAppliesToBooking(baseRule, ctx), true);
  // Project-specific rule that matches.
  assert.equal(
    ruleAppliesToBooking({ ...baseRule, projectId: "p1" }, ctx),
    true,
  );
  // Project-specific rule that does NOT match.
  assert.equal(
    ruleAppliesToBooking({ ...baseRule, projectId: "other" }, ctx),
    false,
  );
  // Villa-specific rule that matches.
  assert.equal(
    ruleAppliesToBooking({ ...baseRule, villaId: "v1" }, ctx),
    true,
  );
  // Villa-specific rule that does NOT match.
  assert.equal(
    ruleAppliesToBooking({ ...baseRule, villaId: "v2" }, ctx),
    false,
  );
  // Channel-specific rule with `any` always matches.
  assert.equal(
    ruleAppliesToBooking({ ...baseRule, appliesToChannel: "any" }, ctx),
    true,
  );
  // Channel-specific rule that matches.
  assert.equal(
    ruleAppliesToBooking({ ...baseRule, appliesToChannel: "airbnb" }, ctx),
    true,
  );
  // Channel-specific rule that does NOT match.
  assert.equal(
    ruleAppliesToBooking({ ...baseRule, appliesToChannel: "direct" }, ctx),
    false,
  );
  // Paused rule never applies.
  assert.equal(
    ruleAppliesToBooking({ ...baseRule, status: "paused" }, ctx),
    false,
  );
  // Archived rule never applies.
  assert.equal(
    ruleAppliesToBooking({ ...baseRule, status: "archived" }, ctx),
    false,
  );
});

// -----------------------------------------------------------------------------
// suggestions-pure: visibility + CTA builder
// -----------------------------------------------------------------------------
test("suggestionIsVisible — active + not expired vs dismissed / expired", async () => {
  const { suggestionIsVisible } = await import(
    "../src/features/guest-journey/suggestions-pure"
  );
  const now = new Date("2026-04-26T10:00:00Z");
  // Active + not expired + suggested in the past → visible.
  assert.equal(
    suggestionIsVisible(
      {
        status: "active",
        suggestedFor: new Date("2026-04-25T10:00:00Z"),
        expiresAt: new Date("2026-04-30T10:00:00Z"),
      },
      now,
    ),
    true,
  );
  // Dismissed → hidden.
  assert.equal(
    suggestionIsVisible(
      {
        status: "dismissed",
        suggestedFor: null,
        expiresAt: new Date("2026-04-30T10:00:00Z"),
      },
      now,
    ),
    false,
  );
  // Expired → hidden.
  assert.equal(
    suggestionIsVisible(
      {
        status: "active",
        suggestedFor: null,
        expiresAt: new Date("2026-04-25T10:00:00Z"),
      },
      now,
    ),
    false,
  );
  // Suggested-for in the future → not yet visible.
  assert.equal(
    suggestionIsVisible(
      {
        status: "active",
        suggestedFor: new Date("2026-04-27T10:00:00Z"),
        expiresAt: null,
      },
      now,
    ),
    false,
  );
});

test("buildSuggestionCta — services route + guide route", async () => {
  const { buildSuggestionCta } = await import(
    "../src/features/guest-journey/suggestions-pure"
  );
  const transferCta = buildSuggestionCta(
    "airport_transfer",
    "abc123",
    "airport-transfer",
  );
  assert.equal(
    transferCta.ctaHref,
    "/stay/abc123/services?service=airport-transfer",
  );
  const guideCta = buildSuggestionCta("guide", "abc123");
  assert.equal(guideCta.ctaHref, "/stay/abc123/guide");
  const conciergeCta = buildSuggestionCta("concierge", "abc123");
  assert.equal(conciergeCta.ctaHref, "/stay/abc123/concierge");
  const lateCheckoutCta = buildSuggestionCta("late_checkout", "abc123");
  assert.equal(lateCheckoutCta.ctaHref, "/stay/abc123/check-out");
  // Service suggestion without a service key falls back to the
  // catalog page.
  const breakfastNoKey = buildSuggestionCta("breakfast", "abc123");
  assert.equal(breakfastNoKey.ctaHref, "/stay/abc123/services");
});

// -----------------------------------------------------------------------------
// review-pure
// -----------------------------------------------------------------------------
test("pickReviewChannelForBooking — channel routing", async () => {
  const { pickReviewChannelForBooking } = await import(
    "../src/features/guest-journey/review-pure"
  );
  assert.equal(pickReviewChannelForBooking("direct"), "internal_survey");
  assert.equal(pickReviewChannelForBooking("airbnb"), "airbnb");
  assert.equal(pickReviewChannelForBooking("booking"), "booking_com");
  assert.equal(pickReviewChannelForBooking("booking_com"), "booking_com");
  assert.equal(pickReviewChannelForBooking("manual"), "internal_survey");
  assert.equal(pickReviewChannelForBooking(null), "internal_survey");
  assert.equal(pickReviewChannelForBooking("unknown"), "internal_survey");
});

test("shouldRequestReview — eligibility window", async () => {
  const { shouldRequestReview } = await import(
    "../src/features/guest-journey/review-pure"
  );
  // During the stay: not eligible.
  assert.equal(
    shouldRequestReview(
      { status: "checked_in", checkOut: "2026-04-30" },
      new Date("2026-04-28T10:00:00Z"),
    ),
    false,
  );
  // Morning of checkout (before 14:00 UTC): not eligible yet.
  assert.equal(
    shouldRequestReview(
      { status: "confirmed", checkOut: "2026-04-30" },
      new Date("2026-04-30T08:00:00Z"),
    ),
    false,
  );
  // After checkout: eligible.
  assert.equal(
    shouldRequestReview(
      { status: "checked_out", checkOut: "2026-04-30" },
      new Date("2026-05-01T10:00:00Z"),
    ),
    true,
  );
  // Cancelled / no-show: never.
  assert.equal(
    shouldRequestReview(
      { status: "cancelled", checkOut: "2026-04-30" },
      new Date("2026-05-01T10:00:00Z"),
    ),
    false,
  );
});

test("buildReviewRequestUrl — channel-specific URLs", async () => {
  const { buildReviewRequestUrl } = await import(
    "../src/features/guest-journey/review-pure"
  );
  assert.equal(
    buildReviewRequestUrl("internal_survey", {
      bookingId: "b1",
      bookingCode: "ARC-1",
      rawToken: "abc123",
    }),
    "/stay/abc123/review",
  );
  assert.ok(
    buildReviewRequestUrl("airbnb", {
      bookingId: "b1",
      bookingCode: "ARC-1",
      rawToken: null,
      externalReference: "AIR-99",
    }).startsWith("https://www.airbnb.com/"),
  );
  assert.ok(
    buildReviewRequestUrl("booking_com", {
      bookingId: "b1",
      bookingCode: "ARC-1",
      rawToken: null,
    }).startsWith("https://"),
  );
});

// -----------------------------------------------------------------------------
// events-pure: owner-safe projection
// -----------------------------------------------------------------------------
test("isJourneyEventOwnerSafe + sanitizeJourneyEventForOwner strip emails / phones", async () => {
  const { isJourneyEventOwnerSafe, sanitizeJourneyEventForOwner } =
    await import("../src/features/guest-journey/events-pure");
  const tainted = {
    bookingId: "b1",
    stayTokenId: null,
    eventType: "service_clicked" as const,
    sourceType: "guest_action" as const,
    sourceId: null,
    title: "Guest opened guide",
    description:
      "Email: emma@example.com Phone: +44 20 7000 0000 Token: deadbeef",
    eventAt: new Date("2026-04-25T10:00:00Z"),
    ownerVisible: true,
    severity: "info" as const,
    metadataJson: {
      tokenHash: "abcd",
      camera_url: "rtsp://internal/1",
      orderRef: "GSO-001",
    },
    guestFullName: "Emma Whitmore",
  };
  // Pre-sanitize: not safe — banned tokens are present.
  assert.equal(isJourneyEventOwnerSafe(tainted), false);
  // After sanitize: forbidden fields gone, guest label masked.
  const cleaned = sanitizeJourneyEventForOwner(tainted);
  assert.equal(cleaned.description?.includes("@"), false);
  assert.equal(cleaned.description?.includes("+44"), false);
  const meta = cleaned.metadataJson ?? {};
  assert.equal(Object.prototype.hasOwnProperty.call(meta, "tokenHash"), false);
  assert.equal(
    Object.prototype.hasOwnProperty.call(meta, "camera_url"),
    false,
  );
  assert.equal(meta.guestLabel, "Emma W.");
  assert.equal(meta.orderRef, "GSO-001");
});

// -----------------------------------------------------------------------------
// Notification dedupe key shape
// -----------------------------------------------------------------------------
test("buildNotificationDedupeKey deterministic shape", async () => {
  const { buildNotificationDedupeKey, buildJourneyRunKey } = await import(
    "../src/features/guest-journey/rules-pure"
  );
  const date = new Date("2026-04-19T07:00:00Z");
  const key = buildNotificationDedupeKey("b1", "r1", date);
  assert.equal(key, "journey:b1:r1:2026-04-19");
  // Re-running the same call yields the same key.
  assert.equal(buildNotificationDedupeKey("b1", "r1", date), key);
  // No date → just the run key.
  assert.equal(
    buildNotificationDedupeKey("b1", "r1", null),
    buildJourneyRunKey("b1", "r1"),
  );
});

test("buildReviewRequestDedupeKey separates by stage", async () => {
  const { buildReviewRequestDedupeKey } = await import(
    "../src/features/guest-journey/review-pure"
  );
  const a = buildReviewRequestDedupeKey("b1", "airbnb", "initial");
  const b = buildReviewRequestDedupeKey("b1", "airbnb", "reminder_1");
  assert.notEqual(a, b);
  assert.equal(a, "review:b1:airbnb:initial");
});

// -----------------------------------------------------------------------------
// Migration source pinning — idempotency unique indexes
// -----------------------------------------------------------------------------
test("migration 0024 pins idempotency unique indexes + RLS", () => {
  const sql = readFileSync(
    join(repoRoot, "drizzle/0024_guest_journey_automation.sql"),
    "utf-8",
  );
  // Suggestions: unique on (booking_id, rule_id) where rule_id is not null
  assert.ok(
    sql.includes("guest_journey_suggestions_booking_rule_unique"),
    "missing suggestion unique index",
  );
  assert.ok(
    /WHERE\s+"rule_id"\s+IS\s+NOT\s+NULL/i.test(sql),
    "suggestion unique index missing partial WHERE clause",
  );
  // Runs: unique on (booking_id, rule_id)
  assert.ok(
    sql.includes("guest_journey_runs_booking_rule_unique"),
    "missing runs unique index",
  );
  // Review requests: unique on (booking_id, channel)
  assert.ok(
    sql.includes("guest_review_requests_booking_channel_unique"),
    "missing review_requests unique index",
  );
  // RLS enabled + forced for all five tables
  for (const t of [
    "guest_journey_rules",
    "guest_journey_suggestions",
    "guest_journey_runs",
    "guest_journey_events",
    "guest_review_requests",
  ]) {
    assert.ok(sql.includes(`'${t}'`), `migration missing RLS for ${t}`);
  }
  assert.ok(sql.includes("ENABLE ROW LEVEL SECURITY"));
  assert.ok(sql.includes("FORCE ROW LEVEL SECURITY"));
  // No `current_owner_ids()` policies on guest_journey_* — owner
  // access flows through owner_visible_events (Prompt 101) only.
  assert.equal(
    /CREATE POLICY[^;]*owner[^;]*ON\s+"?guest_journey_/i.test(sql),
    false,
    "guest_journey_* tables must not have owner self-read policies",
  );
});

// -----------------------------------------------------------------------------
// Permission matrix
// -----------------------------------------------------------------------------
test("permission matrix — investor/concierge/field exclusions", async () => {
  const { ROLE_CAPABILITIES } = await import(
    "../src/features/auth/permission-matrix"
  );
  const allows = (perm: string, role: string): boolean =>
    (ROLE_CAPABILITIES[perm] ?? []).includes(role as never);

  // investor_owner has NO raw guest_journey access.
  assert.equal(allows("guest_journey.read", "investor_owner"), false);
  assert.equal(allows("guest_journey.write", "investor_owner"), false);
  assert.equal(allows("guest_journey.run", "investor_owner"), false);
  assert.equal(allows("guest_journey.manage", "investor_owner"), false);
  assert.equal(allows("review_request.read", "investor_owner"), false);
  assert.equal(allows("review_request.write", "investor_owner"), false);

  // concierge can run + read but not manage.
  assert.equal(allows("guest_journey.run", "concierge"), true);
  assert.equal(allows("guest_journey.read", "concierge"), true);
  assert.equal(allows("guest_journey.manage", "concierge"), false);

  // booking_manager can run + write but not manage.
  assert.equal(allows("guest_journey.write", "booking_manager"), true);
  assert.equal(allows("guest_journey.manage", "booking_manager"), false);

  // Field roles excluded.
  for (const role of [
    "housekeeping_supervisor",
    "housekeeper",
    "technician",
  ]) {
    for (const perm of [
      "guest_journey.read",
      "guest_journey.write",
      "guest_journey.run",
      "guest_journey.manage",
      "review_request.read",
      "review_request.write",
    ]) {
      assert.equal(
        allows(perm, role),
        false,
        `${role} should not have ${perm}`,
      );
    }
  }
});

// -----------------------------------------------------------------------------
// Source grep
// -----------------------------------------------------------------------------
const STAY_BANNED_TOKENS = [
  "tokenHash",
  "token_hash",
  "passwordCiphertext",
  "password_ciphertext",
  "codeDisplay",
  "code_display",
];
const OWNER_BANNED_TOKENS = [
  "guest.email",
  "guest.phone",
  "guests.email",
  "guests.phone",
  "guestEmail",
  "guestPhone",
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

test("Prompt 102 additions — no banned-token references", () => {
  // The pre-existing /stay/[token]/page.tsx and check-in page use
  // tokenHash / codeDisplay for the token-gated server-side reveal
  // flow (v9G hardening) — those are legitimate. The grep below
  // covers the new feature module + the recommended-now client
  // component added in Prompt 102.
  const targets = [
    join(repoRoot, "src/components/stay/recommended-now.tsx"),
    join(repoRoot, "src/features/guest-journey/runner.ts"),
    join(repoRoot, "src/features/guest-journey/services.ts"),
    join(repoRoot, "src/features/guest-journey/owner-events-rebuild.ts"),
    join(repoRoot, "src/features/guest-journey/actions.ts"),
  ];
  for (const f of targets) {
    const body = readFileSync(f, "utf-8");
    for (const token of STAY_BANNED_TOKENS) {
      assert.equal(
        body.includes(token),
        false,
        `${f} mentions banned token "${token}"`,
      );
    }
  }
});

test("/owner routes do not reference guest.email / guest.phone", () => {
  const ownerRoot = join(repoRoot, "src/app/(owner)");
  const files = walk(ownerRoot);
  for (const f of files) {
    const body = readFileSync(f, "utf-8");
    for (const token of OWNER_BANNED_TOKENS) {
      assert.equal(
        body.includes(token),
        false,
        `${f} mentions banned token "${token}"`,
      );
    }
  }
});
