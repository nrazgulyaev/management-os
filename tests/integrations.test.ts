/**
 * Pure-logic smoke tests for v6: ICS parser, calendar conflict math,
 * booking-automation title interpolation, finance bridge maths, count
 * variance, permission matrix.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");

// -----------------------------------------------------------------------------
// Migration 0007 shape
// -----------------------------------------------------------------------------
test("migration 0007 declares all v6 tables + tmu finance columns", () => {
  const sql = readFileSync(
    join(repoRoot, "drizzle/0007_booking_channels_calendar_sync_automation.sql"),
    "utf8",
  );
  for (const t of [
    "channel_calendar_feeds",
    "channel_calendar_events",
    "booking_conflicts",
    "booking_automation_rules",
    "booking_automation_runs",
    "finance_material_usage_links",
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS "${t}"`), `missing ${t}`);
  }
  assert.match(sql, /finance_bridge_status/);
  assert.match(sql, /expense_line_id/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
});

// -----------------------------------------------------------------------------
// ICS parser
// -----------------------------------------------------------------------------
const SAMPLE_ICS_BASIC = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Arconique//Test//EN
BEGIN:VEVENT
UID:airbnb-9001@airbnb.com
SUMMARY:Reserved (Airbnb)
DTSTART;VALUE=DATE:20260501
DTEND;VALUE=DATE:20260505
END:VEVENT
END:VCALENDAR`;

const SAMPLE_ICS_DATETIME = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:booking-42@booking.com
SUMMARY:CLOSED - Not available
DESCRIPTION:Maintenance window
LOCATION:Eternal S5
DTSTART:20260420T140000Z
DTEND:20260424T100000Z
END:VEVENT
END:VCALENDAR`;

const SAMPLE_ICS_FOLDED = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:vrbo-folded@example.com
SUMMARY:Long summary that
 wraps onto a second line
DTSTART;VALUE=DATE:20260601
DTEND;VALUE=DATE:20260604
END:VEVENT
END:VCALENDAR`;

const SAMPLE_ICS_MISSING_DTEND = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:bad-event-1@x
SUMMARY:Missing dtend
DTSTART;VALUE=DATE:20260301
END:VEVENT
END:VCALENDAR`;

test("ICS parser handles all-day VEVENT with VALUE=DATE", async () => {
  const { parseIcsCalendar } = await import("../src/features/integrations/calendar-sync/ical");
  const r = parseIcsCalendar(SAMPLE_ICS_BASIC);
  assert.equal(r.errors.length, 0);
  assert.equal(r.events.length, 1);
  assert.equal(r.events[0].uid, "airbnb-9001@airbnb.com");
  assert.equal(r.events[0].dtStart, "2026-05-01");
  assert.equal(r.events[0].dtEnd, "2026-05-05");
  assert.equal(r.events[0].isAllDay, true);
  assert.equal(r.events[0].summary, "Reserved (Airbnb)");
});

test("ICS parser handles DATE-TIME format and capture description/location", async () => {
  const { parseIcsCalendar } = await import("../src/features/integrations/calendar-sync/ical");
  const r = parseIcsCalendar(SAMPLE_ICS_DATETIME);
  assert.equal(r.events.length, 1);
  assert.equal(r.events[0].dtStart, "2026-04-20");
  assert.equal(r.events[0].dtEnd, "2026-04-24");
  assert.equal(r.events[0].description, "Maintenance window");
  assert.equal(r.events[0].location, "Eternal S5");
  assert.equal(r.events[0].isAllDay, false);
});

test("ICS parser unfolds continuation lines", async () => {
  const { parseIcsCalendar } = await import("../src/features/integrations/calendar-sync/ical");
  const r = parseIcsCalendar(SAMPLE_ICS_FOLDED);
  assert.equal(r.events.length, 1);
  assert.equal(r.events[0].summary, "Long summary thatwraps onto a second line");
});

test("ICS parser reports malformed events without losing the whole feed", async () => {
  const { parseIcsCalendar } = await import("../src/features/integrations/calendar-sync/ical");
  const r = parseIcsCalendar(SAMPLE_ICS_MISSING_DTEND);
  assert.equal(r.events.length, 0);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0].reason, /DTEND/);
});

test("dateRangesOverlap respects exclusive checkout convention", async () => {
  const { dateRangesOverlap } = await import("../src/features/integrations/calendar-sync/ical");
  // Adjacent: A checkout = B check-in → NOT an overlap.
  assert.equal(dateRangesOverlap("2026-05-01", "2026-05-05", "2026-05-05", "2026-05-08"), false);
  // Overlapping
  assert.equal(dateRangesOverlap("2026-05-01", "2026-05-05", "2026-05-04", "2026-05-08"), true);
  // Disjoint
  assert.equal(dateRangesOverlap("2026-05-01", "2026-05-05", "2026-05-06", "2026-05-08"), false);
});

test("isValidFeedUrl rejects file:// and ftp://", async () => {
  const { isValidFeedUrl } = await import("../src/features/integrations/calendar-sync/ical");
  assert.equal(isValidFeedUrl("https://example.com/feed.ics"), true);
  assert.equal(isValidFeedUrl("http://localhost/foo.ics"), true);
  assert.equal(isValidFeedUrl("file:///etc/passwd"), false);
  assert.equal(isValidFeedUrl("ftp://example.com"), false);
  assert.equal(isValidFeedUrl("not a url"), false);
});

// -----------------------------------------------------------------------------
// Booking-automation title interpolation
// -----------------------------------------------------------------------------
test("applyTitleTemplate interpolates {villa} and {checkout_date}", async () => {
  const { applyTitleTemplate } = await import("../src/features/booking-automation/title");
  assert.equal(
    applyTitleTemplate("Checkout cleaning · {villa} · {checkout_date}", {
      villa: "EV-S5",
      checkout_date: "2026-05-05",
    }),
    "Checkout cleaning · EV-S5 · 2026-05-05",
  );
  // Missing keys remain as-is.
  assert.equal(
    applyTitleTemplate("{villa}/{missing}", { villa: "EV-S5" }),
    "EV-S5/{missing}",
  );
});

// -----------------------------------------------------------------------------
// Finance bridge maths
// -----------------------------------------------------------------------------
test("computeBridgeAmount = round(quantity × unit_cost_minor)", async () => {
  const { computeBridgeAmount } = await import(
    "../src/features/finance/material-usage-bridge-pure"
  );
  const r = computeBridgeAmount({
    ownerChargeableUsage: true,
    ownerChargeableItem: true,
    unitCostMinor: 850n,
    quantity: 3,
    currency: "USD",
  });
  assert.deepEqual(r, { amountMinor: 2550n, currency: "USD" });
});

test("computeBridgeAmount returns null when unit cost or currency missing", async () => {
  const { computeBridgeAmount } = await import(
    "../src/features/finance/material-usage-bridge-pure"
  );
  assert.equal(
    computeBridgeAmount({
      ownerChargeableUsage: true,
      ownerChargeableItem: true,
      unitCostMinor: null,
      quantity: 3,
      currency: "USD",
    }),
    null,
  );
  assert.equal(
    computeBridgeAmount({
      ownerChargeableUsage: true,
      ownerChargeableItem: true,
      unitCostMinor: 850n,
      quantity: 3,
      currency: null,
    }),
    null,
  );
});

test("mapItemToExpenseType produces deterministic expense categories", async () => {
  const { mapItemToExpenseType } = await import(
    "../src/features/finance/material-usage-bridge-pure"
  );
  assert.equal(mapItemToExpenseType("towel", null), "linen_replacement");
  assert.equal(mapItemToExpenseType("amenity", "toiletries"), "toiletries");
  assert.equal(mapItemToExpenseType("chemical", "pool_chems"), "consumables");
  assert.equal(mapItemToExpenseType("spare_part", "spare_parts"), "spare_part");
  assert.equal(mapItemToExpenseType(null, null), "maintenance");
});

// -----------------------------------------------------------------------------
// Inventory count variance
// -----------------------------------------------------------------------------
test("computeCountVariance handles negative and positive variance", async () => {
  const { computeCountVariance, totalAbsVariance } = await import(
    "../src/features/inventory/counts"
  );
  assert.equal(
    computeCountVariance({ itemId: "x", expectedQuantity: 10, countedQuantity: 8 }).variance,
    -2,
  );
  assert.equal(
    computeCountVariance({ itemId: "x", expectedQuantity: 10, countedQuantity: 12 }).variance,
    2,
  );
  assert.equal(
    computeCountVariance({ itemId: "x", expectedQuantity: null, countedQuantity: 5 }).variance,
    5,
  );
  assert.equal(
    totalAbsVariance([
      { itemId: "a", expectedQuantity: 10, countedQuantity: 8 }, // 2
      { itemId: "b", expectedQuantity: 5, countedQuantity: 7 }, // 2
      { itemId: "c", expectedQuantity: 0, countedQuantity: 0 }, // 0
    ]),
    4,
  );
});

// -----------------------------------------------------------------------------
// Schema validators
// -----------------------------------------------------------------------------
test("createCalendarFeedSchema rejects non-http(s) URLs", async () => {
  const { createCalendarFeedSchema } = await import(
    "../src/features/integrations/calendar-sync/schema"
  );
  const bad = createCalendarFeedSchema.safeParse({
    villaId: "00000000-0000-0000-0000-000000000001",
    feedName: "Some feed",
    feedUrl: "ftp://example.com/x.ics",
  });
  assert.equal(bad.success, false);

  const good = createCalendarFeedSchema.safeParse({
    villaId: "00000000-0000-0000-0000-000000000001",
    feedName: "Airbnb · EV-S5",
    feedUrl: "https://example.com/x.ics",
  });
  assert.equal(good.success, true);
});

test("createAutomationRuleSchema enforces title length + offset bounds", async () => {
  const { createAutomationRuleSchema } = await import(
    "../src/features/booking-automation/schema"
  );
  const r = createAutomationRuleSchema.safeParse({
    ruleName: "Checkout cleaning",
    triggerEvent: "booking_created",
    taskCategory: "housekeeping",
    titleTemplate: "Checkout · {villa}",
    dueOffsetMinutes: 60,
    priority: "normal",
  });
  assert.equal(r.success, true);
  const bad = createAutomationRuleSchema.safeParse({
    ruleName: "Checkout cleaning",
    triggerEvent: "booking_created",
    taskCategory: "housekeeping",
    titleTemplate: "X",
    dueOffsetMinutes: 60,
    priority: "normal",
  });
  assert.equal(bad.success, false);
});

// -----------------------------------------------------------------------------
// Permission matrix
// -----------------------------------------------------------------------------
test("v6 permissions gate the right roles", async () => {
  const { hasPermission } = await import("../src/features/auth/permission-matrix");
  const operationsManager = {
    mode: "live" as const,
    appUser: { id: "u", email: "a@x", fullName: "Ops", status: "active" },
    roles: ["operations_manager" as const],
    isInternal: true,
    isSuperAdmin: false,
  };
  const finance = { ...operationsManager, roles: ["finance_manager" as const] };
  const accountant = { ...operationsManager, roles: ["accountant" as const] };
  const housekeeper = { ...operationsManager, roles: ["housekeeper" as const] };

  assert.equal(hasPermission(operationsManager, "integrations.read"), true);
  assert.equal(hasPermission(operationsManager, "integrations.write"), true);
  assert.equal(hasPermission(operationsManager, "bookings.sync"), true);
  assert.equal(hasPermission(operationsManager, "automation.write"), true);
  assert.equal(hasPermission(operationsManager, "finance.bridge_material_usage"), false);

  assert.equal(hasPermission(finance, "finance.bridge_material_usage"), true);
  assert.equal(hasPermission(finance, "integrations.read"), true);
  assert.equal(hasPermission(finance, "integrations.write"), false);

  assert.equal(hasPermission(accountant, "finance.bridge_material_usage"), true);

  assert.equal(hasPermission(housekeeper, "inventory.count.read"), false);
  assert.equal(hasPermission(housekeeper, "inventory.count.approve"), false);
});
