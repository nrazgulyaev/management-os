/**
 * v9C — pure-logic tests:
 *   - Migration 0013 shape (table + RLS + columns).
 *   - Bridge decision: skips ineligible status, no-charge, locked period.
 *   - Bridge decision: bridged when chargeable + open period.
 *   - Idempotency anchor (unique index on owner_stay_request_id).
 *   - Public quote response: stop_sell, min_los, no_plan, ok shapes.
 *   - Public quote response never exposes ratePlanId.
 *   - Public quote validates date input.
 *   - Permission matrix has owner_stay.finance_bridge; owners excluded.
 *   - Notification template-key map covers expected transitions.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");

// -----------------------------------------------------------------------------
// Migration shape
// -----------------------------------------------------------------------------
test("migration 0013 declares finance_links + owner_stay_requests columns + RLS", () => {
  const sql = readFileSync(
    join(
      repoRoot,
      "drizzle/0013_owner_stay_finance_notifications_quote_api.sql",
    ),
    "utf8",
  );
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "owner_stay_finance_links"/);
  assert.match(
    sql,
    /CREATE UNIQUE INDEX IF NOT EXISTS "owner_stay_finance_links_request_unique"/,
  );
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "finance_bridge_status"/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "finance_link_id"/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "completed_at"/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /FORCE ROW LEVEL SECURITY/);
  assert.match(sql, /CREATE POLICY internal_read ON "owner_stay_finance_links"/);
  assert.match(sql, /CREATE POLICY internal_write ON "owner_stay_finance_links"/);
});

// -----------------------------------------------------------------------------
// Pure bridge decision
// -----------------------------------------------------------------------------
const baseInput = {
  requestId: "r1",
  ownerId: "o1",
  villaId: "v1",
  projectId: "p1",
  status: "completed",
  effectiveDate: "2026-04-29",
  estimatedManagementCompensationMinor: 50000,
  estimatedOperationalCostMinor: 10000,
  currency: "USD",
};

test("decideBridge: bridged when chargeable + open period", async () => {
  const { decideBridge } = await import(
    "../src/features/owner-stays/finance-bridge-pure"
  );
  const out = decideBridge(baseInput, [
    {
      id: "p-open",
      status: "open",
      periodStart: "2026-04-01",
      periodEnd: "2026-04-30",
    },
  ]);
  assert.equal(out.status, "bridged");
  if (out.status === "bridged") {
    assert.equal(out.amounts.totalMinor, 60000);
    assert.equal(out.amounts.currency, "USD");
    assert.equal(out.period?.id, "p-open");
  }
});

test("decideBridge: skipped_no_charge when amounts are zero", async () => {
  const { decideBridge } = await import(
    "../src/features/owner-stays/finance-bridge-pure"
  );
  const out = decideBridge(
    {
      ...baseInput,
      estimatedManagementCompensationMinor: 0,
      estimatedOperationalCostMinor: 0,
    },
    [],
  );
  assert.equal(out.status, "skipped_no_charge");
  if (out.status === "skipped_no_charge") {
    assert.equal(out.amounts.totalMinor, 0);
    assert.match(out.reason, /no chargeable amount/);
  }
});

test("decideBridge: skipped_locked_period when target period is closed/locked", async () => {
  const { decideBridge } = await import(
    "../src/features/owner-stays/finance-bridge-pure"
  );
  const out = decideBridge(baseInput, [
    {
      id: "p-locked",
      status: "locked",
      periodStart: "2026-04-01",
      periodEnd: "2026-04-30",
    },
  ]);
  assert.equal(out.status, "skipped_locked_period");
  if (out.status === "skipped_locked_period") {
    assert.equal(out.period.id, "p-locked");
    assert.match(out.reason, /locked/);
  }
});

test("decideBridge: skipped_locked_period also for status='closed'", async () => {
  const { decideBridge } = await import(
    "../src/features/owner-stays/finance-bridge-pure"
  );
  const out = decideBridge(baseInput, [
    {
      id: "p-closed",
      status: "closed",
      periodStart: "2026-04-01",
      periodEnd: "2026-04-30",
    },
  ]);
  assert.equal(out.status, "skipped_locked_period");
});

test("decideBridge: bridged when no statement period covers the date (period=null)", async () => {
  const { decideBridge } = await import(
    "../src/features/owner-stays/finance-bridge-pure"
  );
  const out = decideBridge(baseInput, []);
  assert.equal(out.status, "bridged");
  if (out.status === "bridged") {
    assert.equal(out.period, null);
  }
});

test("decideBridge: failed when status is not bridge-eligible", async () => {
  const { decideBridge, isBridgeEligibleStatus } = await import(
    "../src/features/owner-stays/finance-bridge-pure"
  );
  for (const s of ["requested", "rejected", "cancelled", "pending_admin_approval"]) {
    assert.equal(isBridgeEligibleStatus(s), false, `${s} should NOT be eligible`);
    const out = decideBridge({ ...baseInput, status: s }, []);
    assert.equal(out.status, "failed");
  }
  for (const s of ["approved", "completed"]) {
    assert.equal(isBridgeEligibleStatus(s), true, `${s} should be eligible`);
  }
});

test("effectiveDateForRequest: requestedEnd → previous-day (last night)", async () => {
  const { effectiveDateForRequest } = await import(
    "../src/features/owner-stays/finance-bridge-pure"
  );
  assert.equal(effectiveDateForRequest("2026-04-30"), "2026-04-29");
  assert.equal(effectiveDateForRequest("2026-01-01"), "2025-12-31");
});

test("calculateOwnerStayFinanceAmounts: clamps negatives, sums correctly", async () => {
  const { calculateOwnerStayFinanceAmounts } = await import(
    "../src/features/owner-stays/finance-bridge-pure"
  );
  const out = calculateOwnerStayFinanceAmounts({
    ...baseInput,
    estimatedManagementCompensationMinor: -5,
    estimatedOperationalCostMinor: 1234,
  });
  assert.equal(out.compensationMinor, 0);
  assert.equal(out.operationalCostMinor, 1234);
  assert.equal(out.totalMinor, 1234);
  assert.equal(out.hasChargeable, true);
});

// -----------------------------------------------------------------------------
// Idempotency anchor — assert the unique index exists in migration SQL
// -----------------------------------------------------------------------------
test("finance bridge idempotency: unique index on owner_stay_request_id", () => {
  const sql = readFileSync(
    join(
      repoRoot,
      "drizzle/0013_owner_stay_finance_notifications_quote_api.sql",
    ),
    "utf8",
  );
  assert.match(
    sql,
    /CREATE UNIQUE INDEX IF NOT EXISTS "owner_stay_finance_links_request_unique"\s+ON "owner_stay_finance_links" \("owner_stay_request_id"\)/,
  );
});

// -----------------------------------------------------------------------------
// Public quote response
// -----------------------------------------------------------------------------
test("buildPublicQuoteResponse: ok happy path includes breakdown but no ratePlanId", async () => {
  const { buildPublicQuoteResponse } = await import(
    "../src/features/pricing/public-quote"
  );
  const out = buildPublicQuoteResponse({
    available: true,
    reason: "ok",
    currency: "USD",
    nights: 2,
    grossAmountMinor: 200_000,
    minLosWarning: null,
    breakdown: [
      { date: "2026-04-26", nightlyRateMinor: 100_000, source: "base", seasonId: null, stopSell: false, minLos: null },
      { date: "2026-04-27", nightlyRateMinor: 100_000, source: "base", seasonId: null, stopSell: false, minLos: null },
    ],
  });
  assert.equal(out.ok, true);
  assert.equal(out.available, true);
  assert.equal(out.reason, "ok");
  assert.equal(out.grossAmountFormatted, "2000.00");
  assert.equal(out.nightlyBreakdown.length, 2);
  assert.equal(out.nightlyBreakdown[0].amountFormatted, "1000.00");
  // Critical: no ratePlanId / seasonId surface anywhere.
  for (const n of out.nightlyBreakdown) {
    assert.ok(!("seasonId" in n), "must not expose seasonId");
    assert.ok(!("ratePlanId" in n), "must not expose ratePlanId");
  }
  assert.ok(!("ratePlanId" in out), "response must not expose ratePlanId");
});

test("buildPublicQuoteResponse: stop_sell → ok=true available=false reason=stop_sell", async () => {
  const { buildPublicQuoteResponse } = await import(
    "../src/features/pricing/public-quote"
  );
  const out = buildPublicQuoteResponse({
    available: false,
    reason: "stop_sell",
    currency: "USD",
    nights: 1,
    grossAmountMinor: 100_000,
    minLosWarning: null,
    breakdown: [
      { date: "2026-04-26", nightlyRateMinor: 100_000, source: "override", seasonId: null, stopSell: true, minLos: null },
    ],
  });
  assert.equal(out.ok, true);
  assert.equal(out.available, false);
  assert.equal(out.reason, "stop_sell");
});

test("buildPublicQuoteResponse: min_los_violation → ok=true available=false with warning", async () => {
  const { buildPublicQuoteResponse } = await import(
    "../src/features/pricing/public-quote"
  );
  const out = buildPublicQuoteResponse({
    available: false,
    reason: "min_los_violation",
    currency: "USD",
    nights: 2,
    grossAmountMinor: 200_000,
    minLosWarning: 7,
    breakdown: [
      { date: "2026-04-26", nightlyRateMinor: 100_000, source: "season", seasonId: "s1", stopSell: false, minLos: 7 },
      { date: "2026-04-27", nightlyRateMinor: 100_000, source: "season", seasonId: "s1", stopSell: false, minLos: 7 },
    ],
  });
  assert.equal(out.ok, true);
  assert.equal(out.available, false);
  assert.equal(out.reason, "min_los_violation");
  assert.equal(out.minLosRequired, 7);
  assert.ok(out.warnings.some((w) => /min_los/.test(w)));
});

test("buildPublicQuoteResponse: no_plan → ok=false reason=no_rate_plan", async () => {
  const { buildPublicQuoteResponse } = await import(
    "../src/features/pricing/public-quote"
  );
  const out = buildPublicQuoteResponse({
    available: false,
    reason: "no_plan" as never,
    currency: "USD",
    nights: 0,
    grossAmountMinor: 0,
    minLosWarning: null,
    breakdown: [],
  });
  assert.equal(out.ok, false);
  assert.equal(out.reason, "no_rate_plan");
});

test("buildPublicQuoteResponse: deterministic for identical inputs", async () => {
  const { buildPublicQuoteResponse } = await import(
    "../src/features/pricing/public-quote"
  );
  const args = {
    available: true,
    reason: "ok" as const,
    currency: "USD",
    nights: 1,
    grossAmountMinor: 100_000,
    minLosWarning: null,
    breakdown: [
      { date: "2026-04-26", nightlyRateMinor: 100_000, source: "base" as const, seasonId: null, stopSell: false, minLos: null },
    ],
  };
  const a = buildPublicQuoteResponse(args);
  const b = buildPublicQuoteResponse(args);
  assert.deepEqual(a, b);
});

test("publicQuoteInputSchema: rejects bad dates and out-of-order range", async () => {
  const { publicQuoteInputSchema } = await import(
    "../src/features/pricing/public-quote"
  );
  // Non-uuid villaId.
  assert.equal(
    publicQuoteInputSchema.safeParse({
      villaId: "not-a-uuid",
      checkIn: "2026-04-26",
      checkOut: "2026-04-30",
    }).success,
    false,
  );
  // Bad date format.
  assert.equal(
    publicQuoteInputSchema.safeParse({
      villaId: "00000000-0000-0000-0000-000000000000",
      checkIn: "2026/04/26",
      checkOut: "2026-04-30",
    }).success,
    false,
  );
  // checkOut <= checkIn.
  assert.equal(
    publicQuoteInputSchema.safeParse({
      villaId: "00000000-0000-0000-0000-000000000000",
      checkIn: "2026-04-30",
      checkOut: "2026-04-30",
    }).success,
    false,
  );
  // Happy path.
  assert.equal(
    publicQuoteInputSchema.safeParse({
      villaId: "00000000-0000-0000-0000-000000000000",
      checkIn: "2026-04-26",
      checkOut: "2026-04-30",
    }).success,
    true,
  );
});

test("formatMinor: pads decimals, handles zero and negatives", async () => {
  const { formatMinor } = await import(
    "../src/features/pricing/public-quote"
  );
  assert.equal(formatMinor(0), "0.00");
  assert.equal(formatMinor(5), "0.05");
  assert.equal(formatMinor(123456), "1234.56");
  assert.equal(formatMinor(-50), "-0.50");
});

// -----------------------------------------------------------------------------
// Notifications transition mapping
// -----------------------------------------------------------------------------
test("mapStatusTransitionToTemplate: covers approved/rejected/completed/cancelled/relocation", async () => {
  const { mapStatusTransitionToTemplate } = await import(
    "../src/features/owner-stays/notification-templates"
  );
  assert.equal(
    mapStatusTransitionToTemplate("requested", "approved"),
    "owner_stay.approved",
  );
  assert.equal(
    mapStatusTransitionToTemplate("pending_admin_approval", "rejected"),
    "owner_stay.rejected",
  );
  assert.equal(
    mapStatusTransitionToTemplate("approved", "completed"),
    "owner_stay.completed",
  );
  assert.equal(
    mapStatusTransitionToTemplate("requested", "cancelled"),
    "owner_stay.cancelled",
  );
  assert.equal(
    mapStatusTransitionToTemplate("requested", "requires_relocation"),
    "owner_stay.relocation_pending",
  );
  // Internal-only transitions stay quiet.
  assert.equal(
    mapStatusTransitionToTemplate("requested", "pending_admin_approval"),
    null,
  );
});

// -----------------------------------------------------------------------------
// Permission matrix
// -----------------------------------------------------------------------------
test("permission matrix exposes owner_stay.finance_bridge + correct scoping", async () => {
  const mod = await import("../src/features/auth/permission-matrix");
  const k = "owner_stay.finance_bridge";
  assert.ok(Array.isArray(mod.ROLE_CAPABILITIES[k]), `missing ${k}`);
  assert.ok(mod.ROLE_CAPABILITIES[k].includes("super_admin"));
  assert.ok(mod.ROLE_CAPABILITIES[k].includes("finance_manager"));
  assert.ok(mod.ROLE_CAPABILITIES[k].includes("operations_manager"));
  // Owners must NOT have the bridge permission.
  assert.ok(!mod.ROLE_CAPABILITIES[k].includes("investor_owner" as never));
  assert.ok(!mod.ROLE_CAPABILITIES[k].includes("investor_viewer" as never));
  // Field roles must NOT have it either.
  for (const role of ["housekeeper", "technician", "security"] as const) {
    assert.ok(
      !mod.ROLE_CAPABILITIES[k].includes(role as never),
      `${role} must not have ${k}`,
    );
  }
});
