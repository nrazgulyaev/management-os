/**
 * Prompt 108 — Direct Booking Owner Portal Surface + Owner Revenue
 * Transparency.
 *
 * Pure-logic + source-grep + migration-pin tests covering:
 *   • migration RLS / unique indexes / column additions
 *   • pure projection (guest masking, source mapping, public status,
 *     half-open night count, owner-safe redaction)
 *   • revenue source bucket aggregation
 *   • monthly source mix determinism
 *   • permissions matrix (investor_owner, finance_manager,
 *     booking_manager, field exclusions)
 *   • owner statement source grouping
 *   • cron route file existence + correct jobKey wiring
 *   • source greps:
 *       - no guest.email / guest.phone / hold token / providerSessionId
 *         / financeLinkId / revenueLineId / statementPeriodId in owner
 *         portal route files
 *       - statement source labels do not embed source IDs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");

// -----------------------------------------------------------------------------
// Migration shape
// -----------------------------------------------------------------------------
test("migration 0030 pins 3 owner projection tables + RLS + uniques", () => {
  const sql = readFileSync(
    join(repoRoot, "drizzle/0030_direct_booking_owner_portal.sql"),
    "utf-8",
  );
  for (const t of [
    '"owner_booking_summaries"',
    '"owner_booking_revenue_breakdowns"',
    '"owner_revenue_source_monthly"',
  ]) {
    assert.ok(sql.includes(t), `missing table ${t}`);
  }
  assert.ok(sql.includes("ENABLE ROW LEVEL SECURITY"));
  assert.ok(sql.includes("FORCE ROW LEVEL SECURITY"));
  assert.ok(sql.includes("owner_self_read"));
  assert.ok(sql.includes("public.current_owner_ids()"));
  // CHECK constraints on enums.
  assert.ok(sql.includes("owner_booking_summaries_source_check"));
  assert.ok(sql.includes("owner_booking_summaries_status_check"));
  assert.ok(sql.includes("owner_booking_revenue_breakdowns_category_check"));
  assert.ok(sql.includes("owner_booking_revenue_breakdowns_direction_check"));
  // Idempotency.
  assert.ok(sql.includes("owner_booking_summaries_booking_unique"));
  assert.ok(sql.includes("owner_booking_summaries_request_unique"));
  assert.ok(sql.includes("owner_revenue_source_monthly_unique"));
});

// -----------------------------------------------------------------------------
// Pure: guest name masking
// -----------------------------------------------------------------------------
test("maskOwnerGuestName produces friendly non-identifying labels", async () => {
  const { maskOwnerGuestName } = await import(
    "../src/features/owner-bookings/calendar-pure"
  );
  assert.equal(maskOwnerGuestName("Emma Whitmore"), "Emma W.");
  assert.equal(maskOwnerGuestName("Made"), "Made");
  assert.equal(maskOwnerGuestName("ALICIA KEYS-COOPER"), "Alicia K.");
  assert.equal(maskOwnerGuestName(null), "Guest");
  assert.equal(maskOwnerGuestName(""), "Guest");
  assert.equal(maskOwnerGuestName("   "), "Guest");
});

// -----------------------------------------------------------------------------
// Pure: source mapping
// -----------------------------------------------------------------------------
test("mapBookingChannelToSourceType + publicBookingSourceLabel mapping", async () => {
  const {
    mapBookingChannelToSourceType,
    publicBookingSourceLabel,
    buildOwnerLabel,
  } = await import("../src/features/owner-bookings/calendar-pure");

  assert.equal(
    mapBookingChannelToSourceType({
      channelKey: "direct",
      channelType: "direct",
      hasDirectBookingRequest: false,
    }),
    "direct_booking",
  );
  assert.equal(
    mapBookingChannelToSourceType({
      channelKey: "airbnb",
      channelType: "ota",
      hasDirectBookingRequest: false,
    }),
    "ota_airbnb",
  );
  assert.equal(
    mapBookingChannelToSourceType({
      channelKey: "booking_com",
      channelType: "ota",
      hasDirectBookingRequest: false,
    }),
    "ota_booking_com",
  );
  assert.equal(
    mapBookingChannelToSourceType({
      channelKey: "vrbo",
      channelType: "ota",
      hasDirectBookingRequest: false,
    }),
    "ota_vrbo",
  );
  // Direct booking request flag wins.
  assert.equal(
    mapBookingChannelToSourceType({
      channelKey: "airbnb",
      channelType: "ota",
      hasDirectBookingRequest: true,
    }),
    "direct_booking",
  );

  assert.equal(publicBookingSourceLabel("direct_booking", null), "Direct booking");
  assert.equal(publicBookingSourceLabel("ota_airbnb", null), "Airbnb");
  assert.equal(publicBookingSourceLabel("owner_stay", null), "Owner stay");

  assert.equal(
    buildOwnerLabel("direct_booking", "confirmed", null),
    "Direct booking · Confirmed",
  );
  assert.equal(
    buildOwnerLabel("ota_airbnb", "in_house", "Airbnb"),
    "Airbnb stay · Guest in-house",
  );
  assert.equal(buildOwnerLabel("owner_stay", "owner_stay", null), "Owner stay");
});

// -----------------------------------------------------------------------------
// Pure: public status mapping
// -----------------------------------------------------------------------------
test("publicBookingStatus collapses booking/request/deposit statuses", async () => {
  const { publicBookingStatus, isOwnerVisibleBookingStatus } = await import(
    "../src/features/owner-bookings/calendar-pure"
  );
  // Booking-side.
  assert.equal(
    publicBookingStatus({ bookingStatus: "confirmed" }),
    "confirmed",
  );
  assert.equal(
    publicBookingStatus({ bookingStatus: "checked_in" }),
    "in_house",
  );
  assert.equal(
    publicBookingStatus({ bookingStatus: "checked_out" }),
    "completed",
  );
  assert.equal(
    publicBookingStatus({ bookingStatus: "cancelled" }),
    "cancelled",
  );
  // Request-side.
  assert.equal(
    publicBookingStatus({ requestStatus: "submitted" }),
    "under_review",
  );
  assert.equal(
    publicBookingStatus({ requestStatus: "approved" }),
    "deposit_pending",
  );
  assert.equal(
    publicBookingStatus({ requestStatus: "rejected" }),
    "cancelled",
  );
  assert.equal(
    publicBookingStatus({ requestStatus: "expired" }),
    "expired",
  );
  // Deposit-only.
  assert.equal(
    publicBookingStatus({ depositStatus: "pending" }),
    "deposit_pending",
  );
  // Owner stay always wins.
  assert.equal(
    publicBookingStatus({ ownerStayStatus: "approved" }),
    "owner_stay",
  );

  // Visibility predicate: cancelled / expired hidden, inquiries hidden
  // unless they actively block.
  assert.equal(isOwnerVisibleBookingStatus("cancelled", false), false);
  assert.equal(isOwnerVisibleBookingStatus("expired", false), false);
  assert.equal(isOwnerVisibleBookingStatus("inquiry", false), false);
  assert.equal(isOwnerVisibleBookingStatus("inquiry", true), true);
  assert.equal(isOwnerVisibleBookingStatus("confirmed", false), true);
});

// -----------------------------------------------------------------------------
// Pure: half-open night count
// -----------------------------------------------------------------------------
test("calculateBookingNights respects half-open booking convention", async () => {
  const { calculateBookingNights, monthKey } = await import(
    "../src/features/owner-bookings/calendar-pure"
  );
  assert.equal(calculateBookingNights("2026-04-10", "2026-04-13"), 3);
  assert.equal(calculateBookingNights("2026-04-10", "2026-04-10"), 0);
  // Inverted dates → 0, not negative.
  assert.equal(calculateBookingNights("2026-04-13", "2026-04-10"), 0);
  // Date objects work too.
  assert.equal(
    calculateBookingNights(new Date("2026-04-10"), new Date("2026-04-12")),
    2,
  );
  // Month bucket.
  assert.equal(monthKey("2026-04-22"), "2026-04-01");
  assert.equal(monthKey(new Date("2026-04-22T12:00:00Z")), "2026-04-01");
});

// -----------------------------------------------------------------------------
// Pure: owner-safe redaction drops banned fields
// -----------------------------------------------------------------------------
test("safeOwnerBookingProjection drops every banned field", async () => {
  const { safeOwnerBookingProjection } = await import(
    "../src/features/owner-bookings/calendar-pure"
  );
  const polluted = {
    id: "abc",
    villaId: "v1",
    guestEmail: "x@y.com",
    guest_email: "x@y.com",
    phone: "+1",
    guest_phone: "+1",
    holdTokenHash: "deadbeef",
    tokenPrefix: "abc12345",
    providerSessionId: "man_xxx",
    provider_session_id: "man_xxx",
    financeLinkId: "ff",
    finance_link_id: "ff",
    revenueLineId: "rl",
    revenue_line_id: "rl",
    statementPeriodId: "sp",
    internalNotes: "secret",
    decisionNote: "rejected because…",
    safeField: "ok",
  };
  const out = safeOwnerBookingProjection(polluted);
  assert.equal(Object.prototype.hasOwnProperty.call(out, "guestEmail"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(out, "guest_email"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(out, "phone"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(out, "guest_phone"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(out, "holdTokenHash"), false);
  assert.equal(
    Object.prototype.hasOwnProperty.call(out, "providerSessionId"),
    false,
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(out, "financeLinkId"),
    false,
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(out, "revenueLineId"),
    false,
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(out, "statementPeriodId"),
    false,
  );
  assert.equal(Object.prototype.hasOwnProperty.call(out, "decisionNote"), false);
  assert.equal(out.safeField, "ok");
});

// -----------------------------------------------------------------------------
// Revenue: monthly bucket aggregation determinism
// -----------------------------------------------------------------------------
test("buildRevenueSourceMonthlyBuckets is deterministic + groups by source", async () => {
  const { buildRevenueSourceMonthlyBuckets, summarizeOwnerRevenueSourceMix } =
    await import("../src/features/owner-bookings/revenue-pure");
  const rows = [
    {
      ownerId: "o1",
      villaId: "v1",
      projectId: null,
      serviceDate: "2026-04-10",
      sourceType: "direct_booking" as const,
      grossRevenueMinor: 100_000n,
      deductionsMinor: 18_000n,
      netOwnerEffectMinor: 82_000n,
      bookingCount: 1,
      occupiedNights: 3,
      currency: "USD",
    },
    {
      ownerId: "o1",
      villaId: "v1",
      projectId: null,
      serviceDate: "2026-04-22",
      sourceType: "ota_airbnb" as const,
      grossRevenueMinor: 200_000n,
      deductionsMinor: 30_000n,
      netOwnerEffectMinor: 170_000n,
      bookingCount: 1,
      occupiedNights: 4,
      currency: "USD",
    },
    {
      ownerId: "o1",
      villaId: "v1",
      projectId: null,
      serviceDate: "2026-04-25",
      sourceType: "ota_booking_com" as const,
      grossRevenueMinor: 50_000n,
      deductionsMinor: 5_000n,
      netOwnerEffectMinor: 45_000n,
      bookingCount: 1,
      occupiedNights: 1,
      currency: "USD",
    },
  ];
  const buckets = buildRevenueSourceMonthlyBuckets(rows);
  // Direct booking + (Airbnb + Booking.com → "ota") = 2 buckets.
  assert.equal(buckets.length, 2);
  const ota = buckets.find((b) => b.sourceType === "ota");
  assert.ok(ota, "ota bucket missing");
  assert.equal(ota!.grossRevenueMinor, 250_000n);
  assert.equal(ota!.bookingCount, 2);
  assert.equal(ota!.occupiedNights, 5);
  // Mix summary aggregates correctly.
  const mix = summarizeOwnerRevenueSourceMix(buckets, "USD");
  const directMix = mix.find((m) => m.bucket === "direct_booking");
  assert.ok(directMix);
  assert.equal(directMix!.grossRevenueMinor, 100_000n);
  // ADR = 100_000 / 3 = 33_333n
  assert.equal(directMix!.averageRevenuePerNightMinor, 33_333n);
});

test("totalNetOwnerEffectMinor sums across rows", async () => {
  const { totalNetOwnerEffectMinor } = await import(
    "../src/features/owner-bookings/revenue-pure"
  );
  const rows = [
    {
      ownerId: "o1",
      villaId: null,
      projectId: null,
      periodMonth: "2026-04-01",
      sourceType: "direct_booking" as const,
      grossRevenueMinor: 100_000n,
      deductionsMinor: 0n,
      netOwnerEffectMinor: 100_000n,
      bookingCount: 1,
      occupiedNights: 3,
      currency: "USD",
    },
    {
      ownerId: "o1",
      villaId: null,
      projectId: null,
      periodMonth: "2026-04-01",
      sourceType: "ota" as const,
      grossRevenueMinor: 200_000n,
      deductionsMinor: 30_000n,
      netOwnerEffectMinor: 170_000n,
      bookingCount: 1,
      occupiedNights: 4,
      currency: "USD",
    },
    {
      ownerId: "o1",
      villaId: null,
      projectId: null,
      periodMonth: "2026-04-01",
      sourceType: "ota" as const,
      grossRevenueMinor: 50_000n,
      deductionsMinor: 5_000n,
      netOwnerEffectMinor: 45_000n,
      bookingCount: 1,
      occupiedNights: 1,
      // Different currency — must be excluded.
      currency: "IDR",
    },
  ];
  assert.equal(totalNetOwnerEffectMinor(rows, "USD"), 270_000n);
});

// -----------------------------------------------------------------------------
// Revenue explanation
// -----------------------------------------------------------------------------
test("formatOwnerRevenueExplanation handles posted, pending, and pre-confirmation", async () => {
  const { formatOwnerRevenueExplanation } = await import(
    "../src/features/owner-bookings/revenue-pure"
  );
  // Posted to a statement.
  const posted = formatOwnerRevenueExplanation(
    {
      sourceType: "direct_booking",
      publicStatus: "completed",
      revenuePosted: true,
      statementId: "stmt-1",
      totalAmountMinor: 100_000n,
    },
    [],
  );
  assert.match(posted, /direct/i);
  assert.match(posted, /statement/i);

  // Posted but no statement yet.
  const pending = formatOwnerRevenueExplanation(
    {
      sourceType: "ota_airbnb",
      publicStatus: "completed",
      revenuePosted: true,
      statementId: null,
      totalAmountMinor: 100_000n,
    },
    [],
  );
  assert.match(pending, /next statement/i);

  // Inquiry.
  const inquiry = formatOwnerRevenueExplanation(
    {
      sourceType: "direct_booking",
      publicStatus: "inquiry",
      revenuePosted: false,
      statementId: null,
      totalAmountMinor: null,
    },
    [],
  );
  assert.match(inquiry, /inquiry/i);
  assert.match(inquiry, /no revenue/i);
});

// -----------------------------------------------------------------------------
// Permissions matrix
// -----------------------------------------------------------------------------
test("permissions matrix — owner_booking + owner_revenue role tiers", async () => {
  const { hasPermission } = await import(
    "../src/features/auth/permission-matrix"
  );
  const ctx = (
    role: "investor_owner" | "investor_viewer" | "finance_manager" |
      "booking_manager" | "concierge" | "housekeeper" | "field" | "agent",
  ) => ({
    mode: "live" as const,
    appUser: null,
    roles: [role as never],
    isInternal: role !== "investor_owner" && role !== "investor_viewer",
    isSuperAdmin: false,
  });
  // investor_owner has read but not manage.
  assert.equal(hasPermission(ctx("investor_owner"), "owner_booking.read"), true);
  assert.equal(hasPermission(ctx("investor_owner"), "owner_revenue.read"), true);
  assert.equal(
    hasPermission(ctx("investor_owner"), "owner_booking.manage"),
    false,
  );
  assert.equal(
    hasPermission(ctx("investor_owner"), "owner_revenue.manage"),
    false,
  );
  // investor_viewer same — read only.
  assert.equal(
    hasPermission(ctx("investor_viewer"), "owner_booking.read"),
    true,
  );
  assert.equal(
    hasPermission(ctx("investor_viewer"), "owner_booking.manage"),
    false,
  );
  // finance_manager can manage revenue.
  assert.equal(
    hasPermission(ctx("finance_manager"), "owner_revenue.manage"),
    true,
  );
  // booking_manager can manage booking projection but not reverse
  // finance.
  assert.equal(
    hasPermission(ctx("booking_manager"), "owner_booking.manage"),
    true,
  );
  assert.equal(
    hasPermission(
      ctx("booking_manager"),
      "direct_booking.reconcile.reverse",
    ),
    false,
  );
  // concierge / housekeeper / agent excluded.
  assert.equal(hasPermission(ctx("concierge"), "owner_booking.read"), false);
  assert.equal(hasPermission(ctx("housekeeper"), "owner_booking.read"), false);
  assert.equal(hasPermission(ctx("agent"), "owner_booking.read"), false);
});

// -----------------------------------------------------------------------------
// Statement source grouping
// -----------------------------------------------------------------------------
test("groupStatementLinesBySource maps direct_booking_accommodation to 'Direct booking revenue'", async () => {
  const { groupStatementLinesBySource, classifyStatementLine } = await import(
    "../src/features/owner-bookings/statement-source-groups"
  );
  const lines = [
    {
      id: "1",
      statementId: "s",
      lineType: "revenue" as const,
      category: "direct_booking_accommodation",
      description: "Direct booking accommodation revenue",
      amountMinor: 200_000n,
      currency: "USD",
      ownerVisible: true,
      sortOrder: 0,
      sourceTable: "revenue_lines",
      sourceId: "rl-1",
    },
    {
      id: "2",
      statementId: "s",
      lineType: "revenue" as const,
      category: "ota_airbnb",
      description: "Airbnb accommodation",
      amountMinor: 150_000n,
      currency: "USD",
      ownerVisible: true,
      sortOrder: 1,
      sourceTable: "revenue_lines",
      sourceId: "rl-2",
    },
    {
      id: "3",
      statementId: "s",
      lineType: "fee" as const,
      category: "channel_fee",
      description: "Airbnb commission",
      amountMinor: -22_500n,
      currency: "USD",
      ownerVisible: true,
      sortOrder: 2,
      sourceTable: "fee_lines",
      sourceId: "fl-1",
    },
  ];
  assert.equal(classifyStatementLine(lines[0]), "direct_booking");
  assert.equal(classifyStatementLine(lines[1]), "ota");
  assert.equal(classifyStatementLine(lines[2]), "tax_fee");
  const buckets = groupStatementLinesBySource(lines);
  const labels = buckets.map((b) => b.label);
  assert.ok(labels.includes("Direct booking revenue"));
  assert.ok(labels.includes("OTA revenue"));
  assert.ok(labels.includes("Taxes / fees"));
});

// -----------------------------------------------------------------------------
// Cron + job wiring
// -----------------------------------------------------------------------------
test("cron route for owner_booking_projection_rebuild exists + dispatches correct key", () => {
  const path = join(
    repoRoot,
    "src/app/api/cron/owner-booking-projection-rebuild/route.ts",
  );
  assert.ok(existsSync(path));
  const body = readFileSync(path, "utf-8");
  assert.ok(body.includes('handleCronJobRequest'));
  assert.ok(body.includes("owner_booking_projection_rebuild"));
});

test("job catalog includes owner_booking_projection_rebuild + executor wires it", () => {
  const defs = readFileSync(
    join(repoRoot, "src/features/jobs/definitions.ts"),
    "utf-8",
  );
  assert.ok(defs.includes('"owner_booking_projection_rebuild"'));
  assert.ok(defs.includes('"0 4 * * *"'));
  const actions = readFileSync(
    join(repoRoot, "src/features/jobs/actions.ts"),
    "utf-8",
  );
  assert.ok(actions.includes('"owner_booking_projection_rebuild"'));
  assert.ok(actions.includes("runOwnerBookingProjectionRebuildJob"));
});

// -----------------------------------------------------------------------------
// Source grep — owner-portal route files do not embed banned identifiers.
// -----------------------------------------------------------------------------
function readAllUnder(root: string): string[] {
  if (!existsSync(root)) return [];
  const out: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      const s = statSync(p);
      if (s.isDirectory()) stack.push(p);
      else if (entry.endsWith(".tsx") || entry.endsWith(".ts")) out.push(p);
    }
  }
  return out;
}

test("owner portal route files do not reference internal IDs / PII channels", () => {
  const ownerRoot = join(repoRoot, "src/app/(owner)/owner");
  const files = readAllUnder(ownerRoot);
  const banned = [
    "guest.email",
    "guestEmail",
    "guest_email",
    "guest.phone",
    "guestPhone",
    "guest_phone",
    "holdTokenHash",
    "tokenPrefix",
    "providerSessionId",
    "provider_session_id",
    "providerPaymentId",
    "financeLinkId",
    "finance_link_id",
    "revenueLineId",
    "revenue_line_id",
    "statementPeriodId",
    "statement_period_id",
    "configPrivateEncrypted",
    "paymentWebhook",
  ];
  for (const f of files) {
    const body = readFileSync(f, "utf-8");
    for (const b of banned) {
      assert.equal(
        body.includes(b),
        false,
        `${f} contains banned identifier ${b}`,
      );
    }
  }
});

test("owner booking detail page does not import direct_booking_finance_links service or schema", () => {
  const detail = readFileSync(
    join(repoRoot, "src/app/(owner)/owner/bookings/[id]/page.tsx"),
    "utf-8",
  );
  assert.equal(detail.includes("direct-booking-finance"), false);
  assert.equal(detail.includes("finance-reconciliation"), false);
  assert.equal(detail.includes("directBookingFinanceLinks"), false);
});

test("statement source group copy contains no source IDs", async () => {
  const mod = await import(
    "../src/features/owner-bookings/statement-source-groups"
  );
  // Every label / description in the bucket map.
  const lines = [
    {
      id: "1",
      statementId: "s",
      lineType: "revenue" as const,
      category: "direct_booking_accommodation",
      description: "Direct booking accommodation revenue",
      amountMinor: 1n,
      currency: "USD",
      ownerVisible: true,
      sortOrder: 0,
      sourceTable: "revenue_lines",
      sourceId: "secret-rl-id",
    },
  ];
  const buckets = mod.groupStatementLinesBySource(lines);
  for (const b of buckets) {
    assert.ok(mod.statementSourceCopyContainsNoSourceIds(b.label));
    assert.ok(mod.statementSourceCopyContainsNoSourceIds(b.description));
  }
});

// -----------------------------------------------------------------------------
// Statement detail rendering — the rendered admin/owner page does not
// inline `revenue_line_id` / `finance_link_id` etc.
// -----------------------------------------------------------------------------
test("StatementDetail component does not surface internal source IDs", () => {
  const body = readFileSync(
    join(repoRoot, "src/components/finance/statement-detail.tsx"),
    "utf-8",
  );
  for (const banned of [
    "line.sourceId",
    "line.source_id",
    "financeLinkId",
    "finance_link_id",
    "revenueLineId",
    "revenue_line_id",
    "statementPeriodId",
    "statement_period_id",
  ]) {
    assert.equal(
      body.includes(banned),
      false,
      `statement-detail.tsx leaks ${banned}`,
    );
  }
});
