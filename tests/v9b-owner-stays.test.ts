/**
 * v9B — pure-logic tests:
 *   - Migration 0012 shape (8 tables, RLS, owner-self policies).
 *   - quoteForRangePure: exclusive checkout, override > season > base,
 *     stop_sell, min_los, deterministic.
 *   - Owner-stay policy resolution (villa beats project beats global).
 *   - Free-night allowance with peak rule.
 *   - Estimator combines policy + quote.
 *   - Relocation rules: same group, same-or-better rank, target free,
 *     no self-relocation.
 *   - Permission matrix exposes v9B keys; owners excluded from
 *     relocation/security; owner has owner_stay.read/write.
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
test("migration 0012 declares all 8 tables + RLS + owner-self policies", () => {
  const sql = readFileSync(
    join(repoRoot, "drizzle/0012_owner_stays_relocation_basic_rates.sql"),
    "utf8",
  );
  for (const t of [
    "owner_stay_policies",
    "owner_stay_requests",
    "villa_equivalence_groups",
    "villa_equivalence_group_members",
    "booking_relocation_candidates",
    "rate_plans",
    "rate_plan_seasons",
    "rate_plan_overrides",
  ]) {
    assert.match(
      sql,
      new RegExp(`CREATE TABLE IF NOT EXISTS "${t}"`),
      `missing ${t}`,
    );
  }
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /FORCE ROW LEVEL SECURITY/);
  assert.match(sql, /CREATE POLICY owner_self_read ON "owner_stay_requests"/);
  assert.match(sql, /CREATE POLICY owner_self_insert ON "owner_stay_requests"/);
  assert.match(sql, /CREATE POLICY owner_self_cancel ON "owner_stay_requests"/);
  assert.match(sql, /CREATE POLICY internal_write ON "owner_stay_requests"/);
});

// -----------------------------------------------------------------------------
// quoteForRangePure
// -----------------------------------------------------------------------------
const PLAN = {
  id: "plan-1",
  baseCurrency: "USD",
  baseNightlyRateMinor: 50000, // 500.00 USD
  managementFeePercent: null,
};

test("quoteForRangePure: checkOut is exclusive, base rate every night", async () => {
  const { quoteForRangePure } = await import(
    "../src/features/pricing/quote"
  );
  const out = quoteForRangePure({
    ratePlan: PLAN,
    seasons: [],
    overrides: [],
    checkIn: "2026-04-26",
    checkOut: "2026-04-30",
  });
  assert.equal(out.available, true);
  assert.equal(out.nights, 4);
  assert.equal(out.grossAmountMinor, 50000 * 4);
  assert.equal(out.breakdown.length, 4);
  assert.deepEqual(
    out.breakdown.map((b) => b.source),
    ["base", "base", "base", "base"],
  );
});

test("quoteForRangePure: deterministic — same inputs → same output", async () => {
  const { quoteForRangePure } = await import(
    "../src/features/pricing/quote"
  );
  const inputs = {
    ratePlan: PLAN,
    seasons: [],
    overrides: [],
    checkIn: "2026-04-26",
    checkOut: "2026-04-30",
  };
  const a = quoteForRangePure(inputs);
  const b = quoteForRangePure(inputs);
  assert.deepEqual(a, b);
});

test("quoteForRangePure: override beats season beats base", async () => {
  const { quoteForRangePure } = await import(
    "../src/features/pricing/quote"
  );
  const out = quoteForRangePure({
    ratePlan: PLAN,
    seasons: [
      {
        id: "s1",
        startsOn: "2026-04-25",
        endsOn: "2026-04-29",
        multiplier: "1.5",
        nightlyRateMinor: null,
        minLos: null,
        maxLos: null,
        stopSell: false,
        status: "active",
      },
    ],
    overrides: [
      {
        stayDate: "2026-04-27",
        nightlyRateMinor: 99999,
        minLos: null,
        stopSell: false,
      },
    ],
    checkIn: "2026-04-26",
    checkOut: "2026-04-30",
  });
  // 26 → season 1.5x = 75000
  // 27 → override = 99999
  // 28 → season 1.5x = 75000
  // 29 → base = 50000  (season ends 04-29 inclusive — date is in season; base only on 04-30 but excluded)
  // wait: season is 04-25..04-29 inclusive, 04-29 is in season. checkOut 04-30 is exclusive — so 04-29 is the last night.
  assert.equal(out.breakdown[0].source, "season");
  assert.equal(out.breakdown[1].source, "override");
  assert.equal(out.breakdown[1].nightlyRateMinor, 99999);
  assert.equal(out.breakdown[2].source, "season");
  assert.equal(out.breakdown[3].source, "season");
});

test("quoteForRangePure: season with fixed nightly_rate_minor wins over multiplier", async () => {
  const { quoteForRangePure } = await import(
    "../src/features/pricing/quote"
  );
  const out = quoteForRangePure({
    ratePlan: PLAN,
    seasons: [
      {
        id: "s1",
        startsOn: "2026-04-25",
        endsOn: "2026-04-30",
        multiplier: "1.5", // ignored
        nightlyRateMinor: 88888,
        minLos: null,
        maxLos: null,
        stopSell: false,
        status: "active",
      },
    ],
    overrides: [],
    checkIn: "2026-04-26",
    checkOut: "2026-04-28",
  });
  assert.equal(out.breakdown[0].nightlyRateMinor, 88888);
  assert.equal(out.breakdown[1].nightlyRateMinor, 88888);
});

test("quoteForRangePure: stop_sell on any night → unavailable", async () => {
  const { quoteForRangePure } = await import(
    "../src/features/pricing/quote"
  );
  const out = quoteForRangePure({
    ratePlan: PLAN,
    seasons: [],
    overrides: [
      {
        stayDate: "2026-04-27",
        nightlyRateMinor: null,
        minLos: null,
        stopSell: true,
      },
    ],
    checkIn: "2026-04-26",
    checkOut: "2026-04-29",
  });
  assert.equal(out.available, false);
  assert.equal(out.reason, "stop_sell");
});

test("quoteForRangePure: min_los warning when stay shorter than required", async () => {
  const { quoteForRangePure } = await import(
    "../src/features/pricing/quote"
  );
  const out = quoteForRangePure({
    ratePlan: PLAN,
    seasons: [
      {
        id: "s1",
        startsOn: "2026-04-25",
        endsOn: "2026-04-30",
        multiplier: "1",
        nightlyRateMinor: null,
        minLos: 7,
        maxLos: null,
        stopSell: false,
        status: "active",
      },
    ],
    overrides: [],
    checkIn: "2026-04-26",
    checkOut: "2026-04-29",
  });
  assert.equal(out.available, false);
  assert.equal(out.reason, "min_los_violation");
  assert.equal(out.requiredMinLos, 7);
});

test("quoteForRangePure: empty range / inverted → no_nights", async () => {
  const { quoteForRangePure } = await import(
    "../src/features/pricing/quote"
  );
  const out = quoteForRangePure({
    ratePlan: PLAN,
    seasons: [],
    overrides: [],
    checkIn: "2026-04-30",
    checkOut: "2026-04-30",
  });
  assert.equal(out.available, false);
  assert.equal(out.reason, "no_nights");
});

test("calculateManagementCompensationPure: percent rounded to nearest minor unit", async () => {
  const { calculateManagementCompensationPure } = await import(
    "../src/features/pricing/quote"
  );
  assert.equal(calculateManagementCompensationPure(20000, 25), 5000);
  assert.equal(calculateManagementCompensationPure(20000, 0), 0);
  assert.equal(calculateManagementCompensationPure(20000, null), 0);
  assert.equal(calculateManagementCompensationPure(20000, "12.5"), 2500);
});

// -----------------------------------------------------------------------------
// Owner-stay policy resolution
// -----------------------------------------------------------------------------
test("pickApplicablePolicy: villa wins over project wins over global", async () => {
  const { pickApplicablePolicy } = await import(
    "../src/features/owner-stays/policy"
  );
  const base = {
    freeNightsPerYear: 7,
    freeNightsApplyToPeak: false,
    requiresApproval: true,
    allowDisplacingGuestBookings: false,
    relocationAllowed: true,
    operationalCostModel: "actual_costs",
    fixedOperationalCostMinor: null,
    currency: "USD",
    compensationModel: "none",
    compensationPercent: null,
    fixedCompensationMinor: null,
    blackoutDates: null,
    peakSeasonRules: null,
    status: "active",
  };
  const policies = [
    { id: "global", projectId: null, villaId: null, ...base },
    { id: "project", projectId: "P", villaId: null, ...base },
    { id: "villa", projectId: "P", villaId: "V1", ...base },
  ];
  assert.equal(pickApplicablePolicy(policies, "V1", "P")?.id, "villa");
  assert.equal(pickApplicablePolicy(policies, "V2", "P")?.id, "project");
  assert.equal(pickApplicablePolicy(policies, "V2", "PX")?.id, "global");
});

// -----------------------------------------------------------------------------
// Free nights / peak rule
// -----------------------------------------------------------------------------
test("applyFreeNights: free nights apply to non-peak by default", async () => {
  const { applyFreeNights } = await import(
    "../src/features/owner-stays/policy"
  );
  const out = applyFreeNights({
    totalNights: 10,
    peakNightCount: 4,
    policy: { freeNightsPerYear: 14, freeNightsApplyToPeak: false },
    alreadyAppliedThisYear: 0,
  });
  // Eligible non-peak nights: 6. Cap: 14. Used: 6.
  assert.equal(out.allowanceNightsApplied, 6);
  assert.equal(out.billableNights, 4);
});

test("applyFreeNights: peak inclusion makes all nights eligible", async () => {
  const { applyFreeNights } = await import(
    "../src/features/owner-stays/policy"
  );
  const out = applyFreeNights({
    totalNights: 10,
    peakNightCount: 4,
    policy: { freeNightsPerYear: 14, freeNightsApplyToPeak: true },
    alreadyAppliedThisYear: 0,
  });
  assert.equal(out.allowanceNightsApplied, 10);
  assert.equal(out.billableNights, 0);
});

test("applyFreeNights: allowance already used capped correctly", async () => {
  const { applyFreeNights } = await import(
    "../src/features/owner-stays/policy"
  );
  const out = applyFreeNights({
    totalNights: 5,
    peakNightCount: 0,
    policy: { freeNightsPerYear: 14, freeNightsApplyToPeak: false },
    alreadyAppliedThisYear: 12,
  });
  // 14 - 12 = 2 remaining; 5 nights stay → 2 allowance, 3 billable.
  assert.equal(out.allowanceNightsApplied, 2);
  assert.equal(out.billableNights, 3);
});

test("applyFreeNights: policy with 0 free nights → all billable", async () => {
  const { applyFreeNights } = await import(
    "../src/features/owner-stays/policy"
  );
  const out = applyFreeNights({
    totalNights: 4,
    peakNightCount: 0,
    policy: { freeNightsPerYear: 0, freeNightsApplyToPeak: false },
    alreadyAppliedThisYear: 0,
  });
  assert.equal(out.allowanceNightsApplied, 0);
  assert.equal(out.billableNights, 4);
});

test("blackoutNights: handles single-date strings + ranges", async () => {
  const { blackoutNights } = await import(
    "../src/features/owner-stays/policy"
  );
  const policy = {
    blackoutDates: [
      "2026-04-27",
      { start: "2026-12-20", end: "2026-12-26" },
    ],
  };
  assert.deepEqual(
    blackoutNights(policy, ["2026-04-26", "2026-04-27", "2026-12-21"]).sort(),
    ["2026-04-27", "2026-12-21"].sort(),
  );
});

test("peakNights: matches ranges from policy.peakSeasonRules", async () => {
  const { peakNights } = await import("../src/features/owner-stays/policy");
  const policy = {
    peakSeasonRules: {
      ranges: [{ start: "2026-12-20", end: "2027-01-05" }],
    },
  };
  assert.deepEqual(
    peakNights(policy, ["2026-12-19", "2026-12-21", "2027-01-06"]),
    ["2026-12-21"],
  );
});

// -----------------------------------------------------------------------------
// Estimator
// -----------------------------------------------------------------------------
test("estimateOwnerStay: free nights consume non-peak nights, billable charges only those", async () => {
  const { estimateOwnerStay } = await import(
    "../src/features/owner-stays/estimate"
  );
  const out = estimateOwnerStay({
    policy: {
      id: "p1",
      projectId: null,
      villaId: null,
      freeNightsPerYear: 14,
      freeNightsApplyToPeak: false,
      requiresApproval: true,
      allowDisplacingGuestBookings: false,
      relocationAllowed: true,
      operationalCostModel: "fixed_per_stay",
      fixedOperationalCostMinor: 10000,
      currency: "USD",
      compensationModel: "percent_of_expected_gross",
      compensationPercent: 25,
      fixedCompensationMinor: null,
      blackoutDates: null,
      peakSeasonRules: null,
      status: "active",
    },
    quote: {
      available: true,
      reason: "ok",
      currency: "USD",
      nights: 4,
      grossAmountMinor: 200000,
      breakdown: [
        { date: "2026-04-26", nightlyRateMinor: 50000, source: "base", seasonId: null, stopSell: false, minLos: null },
        { date: "2026-04-27", nightlyRateMinor: 50000, source: "base", seasonId: null, stopSell: false, minLos: null },
        { date: "2026-04-28", nightlyRateMinor: 50000, source: "base", seasonId: null, stopSell: false, minLos: null },
        { date: "2026-04-29", nightlyRateMinor: 50000, source: "base", seasonId: null, stopSell: false, minLos: null },
      ],
      minLosWarning: null,
    },
    requestedStart: "2026-04-26",
    requestedEnd: "2026-04-30",
    alreadyAppliedThisYear: 0,
  });
  // No peak nights → all 4 nights are eligible. Allowance covers all 4.
  assert.equal(out.allowanceNightsApplied, 4);
  assert.equal(out.billableNights, 0);
  // Owner gross on billable nights = 0 → compensation = 0; fixed op cost still 10000.
  assert.equal(out.estimatedManagementCompensationMinor, 0);
  assert.equal(out.estimatedOperationalCostMinor, 10000);
  assert.equal(out.estimatedTotalOwnerChargeMinor, 10000);
});

test("estimateOwnerStay: after free nights exhausted → all nights billable + compensation kicks in", async () => {
  const { estimateOwnerStay } = await import(
    "../src/features/owner-stays/estimate"
  );
  const out = estimateOwnerStay({
    policy: {
      id: "p1",
      projectId: null,
      villaId: null,
      freeNightsPerYear: 14,
      freeNightsApplyToPeak: false,
      requiresApproval: true,
      allowDisplacingGuestBookings: false,
      relocationAllowed: true,
      operationalCostModel: "none",
      fixedOperationalCostMinor: null,
      currency: "USD",
      compensationModel: "percent_of_expected_gross",
      compensationPercent: 25,
      fixedCompensationMinor: null,
      blackoutDates: null,
      peakSeasonRules: null,
      status: "active",
    },
    quote: {
      available: true,
      reason: "ok",
      currency: "USD",
      nights: 4,
      grossAmountMinor: 200000,
      breakdown: [
        { date: "2026-04-26", nightlyRateMinor: 50000, source: "base", seasonId: null, stopSell: false, minLos: null },
        { date: "2026-04-27", nightlyRateMinor: 50000, source: "base", seasonId: null, stopSell: false, minLos: null },
        { date: "2026-04-28", nightlyRateMinor: 50000, source: "base", seasonId: null, stopSell: false, minLos: null },
        { date: "2026-04-29", nightlyRateMinor: 50000, source: "base", seasonId: null, stopSell: false, minLos: null },
      ],
      minLosWarning: null,
    },
    requestedStart: "2026-04-26",
    requestedEnd: "2026-04-30",
    alreadyAppliedThisYear: 14,
  });
  assert.equal(out.allowanceNightsApplied, 0);
  assert.equal(out.billableNights, 4);
  assert.equal(out.estimatedGrossRevenueMinor, 200000);
  assert.equal(out.estimatedManagementCompensationMinor, 50000); // 25% of 200000
  assert.equal(out.estimatedTotalOwnerChargeMinor, 50000);
});

test("estimateOwnerStay: blackout night surfaces a warning", async () => {
  const { estimateOwnerStay } = await import(
    "../src/features/owner-stays/estimate"
  );
  const out = estimateOwnerStay({
    policy: {
      id: "p1",
      projectId: null,
      villaId: null,
      freeNightsPerYear: 14,
      freeNightsApplyToPeak: false,
      requiresApproval: false,
      allowDisplacingGuestBookings: false,
      relocationAllowed: true,
      operationalCostModel: "none",
      fixedOperationalCostMinor: null,
      currency: "USD",
      compensationModel: "none",
      compensationPercent: null,
      fixedCompensationMinor: null,
      blackoutDates: ["2026-04-27"],
      peakSeasonRules: null,
      status: "active",
    },
    quote: {
      available: true,
      reason: "ok",
      currency: "USD",
      nights: 2,
      grossAmountMinor: 100000,
      breakdown: [
        { date: "2026-04-26", nightlyRateMinor: 50000, source: "base", seasonId: null, stopSell: false, minLos: null },
        { date: "2026-04-27", nightlyRateMinor: 50000, source: "base", seasonId: null, stopSell: false, minLos: null },
      ],
      minLosWarning: null,
    },
    requestedStart: "2026-04-26",
    requestedEnd: "2026-04-28",
    alreadyAppliedThisYear: 0,
  });
  assert.equal(out.blackoutNightCount, 1);
  assert.ok(out.warnings.some((w) => /blackout/.test(w)));
  assert.equal(out.requiresAdminApproval, true);
});

// -----------------------------------------------------------------------------
// Relocation rules
// -----------------------------------------------------------------------------
const baseBooking = {
  id: "b1",
  villaId: "V_FROM",
  checkIn: "2026-04-26",
  checkOut: "2026-04-30",
};

test("evaluateCandidate: ok when same group + same/better rank + target free", async () => {
  const { evaluateCandidate } = await import(
    "../src/features/owner-stays/relocation-rules"
  );
  const out = evaluateCandidate({
    booking: baseBooking,
    targetActiveBlocks: [],
    targetVilla: { id: "V_TO", status: "active" },
    fromMembership: {
      villaId: "V_FROM",
      groupId: "G",
      qualityRank: 100,
      status: "active",
    },
    targetMembership: {
      villaId: "V_TO",
      groupId: "G",
      qualityRank: 100,
      status: "active",
    },
  });
  assert.equal(out.ok, true);
  assert.ok(out.score > 0);
});

test("evaluateCandidate: rejects different group", async () => {
  const { evaluateCandidate } = await import(
    "../src/features/owner-stays/relocation-rules"
  );
  const out = evaluateCandidate({
    booking: baseBooking,
    targetActiveBlocks: [],
    targetVilla: { id: "V_TO", status: "active" },
    fromMembership: {
      villaId: "V_FROM",
      groupId: "G_A",
      qualityRank: 100,
      status: "active",
    },
    targetMembership: {
      villaId: "V_TO",
      groupId: "G_B",
      qualityRank: 100,
      status: "active",
    },
  });
  assert.equal(out.ok, false);
  assert.equal(out.reason, "different_equivalence_group");
});

test("evaluateCandidate: rejects worse quality rank (downgrade)", async () => {
  const { evaluateCandidate } = await import(
    "../src/features/owner-stays/relocation-rules"
  );
  const out = evaluateCandidate({
    booking: baseBooking,
    targetActiveBlocks: [],
    targetVilla: { id: "V_TO", status: "active" },
    fromMembership: {
      villaId: "V_FROM",
      groupId: "G",
      qualityRank: 90,
      status: "active",
    },
    targetMembership: {
      villaId: "V_TO",
      groupId: "G",
      qualityRank: 100, // worse
      status: "active",
    },
  });
  assert.equal(out.ok, false);
  assert.equal(out.reason, "lower_quality_rank");
});

test("evaluateCandidate: rejects when target has overlapping active block", async () => {
  const { evaluateCandidate } = await import(
    "../src/features/owner-stays/relocation-rules"
  );
  const out = evaluateCandidate({
    booking: baseBooking,
    targetActiveBlocks: [
      {
        id: "blk",
        villaId: "V_TO",
        blockType: "guest_booking",
        status: "active",
        startsAt: "2026-04-28T00:00:00Z",
        endsAt: "2026-05-02T00:00:00Z",
      },
    ],
    targetVilla: { id: "V_TO", status: "active" },
    fromMembership: {
      villaId: "V_FROM",
      groupId: "G",
      qualityRank: 100,
      status: "active",
    },
    targetMembership: {
      villaId: "V_TO",
      groupId: "G",
      qualityRank: 100,
      status: "active",
    },
  });
  assert.equal(out.ok, false);
  assert.equal(out.reason, "target_villa_blocked");
});

test("evaluateCandidate: rejects self-relocation", async () => {
  const { evaluateCandidate } = await import(
    "../src/features/owner-stays/relocation-rules"
  );
  const out = evaluateCandidate({
    booking: { ...baseBooking, villaId: "V_X" },
    targetActiveBlocks: [],
    targetVilla: { id: "V_X", status: "active" },
    fromMembership: {
      villaId: "V_X",
      groupId: "G",
      qualityRank: 100,
      status: "active",
    },
    targetMembership: {
      villaId: "V_X",
      groupId: "G",
      qualityRank: 100,
      status: "active",
    },
  });
  assert.equal(out.ok, false);
  assert.equal(out.reason, "self_relocation");
});

test("impactLevelFromDelta: upgrade is 'none', equivalent is 'low'", async () => {
  const { impactLevelFromDelta } = await import(
    "../src/features/owner-stays/relocation-rules"
  );
  assert.equal(impactLevelFromDelta(-10), "none");
  assert.equal(impactLevelFromDelta(0), "low");
});

// -----------------------------------------------------------------------------
// Permission matrix
// -----------------------------------------------------------------------------
test("permission matrix exposes v9B keys + scoping", async () => {
  const mod = await import("../src/features/auth/permission-matrix");
  for (const k of [
    "owner_stay.read",
    "owner_stay.write",
    "owner_stay.approve",
    "owner_stay.relocate",
    "pricing.read",
    "pricing.write",
    "relocation.read",
    "relocation.manage",
  ]) {
    assert.ok(
      Array.isArray(mod.ROLE_CAPABILITIES[k]),
      `missing v9B capability: ${k}`,
    );
    assert.ok(
      mod.ROLE_CAPABILITIES[k].includes("super_admin"),
      `super_admin should have ${k}`,
    );
  }
  // Owners can read + write their own owner stays.
  assert.ok(mod.ROLE_CAPABILITIES["owner_stay.read"].includes("investor_owner"));
  assert.ok(mod.ROLE_CAPABILITIES["owner_stay.write"].includes("investor_owner"));
  // But owners must NOT have approve / relocate / pricing / security.
  assert.ok(
    !mod.ROLE_CAPABILITIES["owner_stay.approve"].includes("investor_owner" as never),
  );
  assert.ok(
    !mod.ROLE_CAPABILITIES["relocation.manage"].includes("investor_owner" as never),
  );
  assert.ok(
    !mod.ROLE_CAPABILITIES["pricing.write"].includes("investor_owner" as never),
  );
  // Field-only roles should not have pricing or owner-stay admin.
  for (const role of ["housekeeper", "technician", "security"] as const) {
    assert.ok(
      !mod.ROLE_CAPABILITIES["pricing.write"].includes(role as never),
      `${role} must not have pricing.write`,
    );
    assert.ok(
      !mod.ROLE_CAPABILITIES["owner_stay.approve"].includes(role as never),
      `${role} must not have owner_stay.approve`,
    );
  }
});
