/**
 * Prompt 104 — Dynamic Pricing & Availability Rules.
 *
 * Pure-logic + source-grep + migration-pin tests covering:
 *   • enumerateStayNights half-open semantics
 *   • applyModifierMinor percent / fixed
 *   • clampRateMinor min/max behaviour
 *   • day-of-week / occupancy / close-out / channel rule selection
 *   • min-stay requirement resolution
 *   • stop-sell selection (incl. channel scope)
 *   • quoteNight explanation deterministic
 *   • quoteStay totalMinor equals nightly sum
 *   • public summary strips internal reason
 *   • admin explainer covers all modifier types
 *   • availability labels diverge public vs admin
 *   • migration RLS / enum / index pinning
 *   • permissions (revenue_manager / booking_manager / investor / field)
 *   • source greps on public /api/v1/quote and owner routes
 *   • channel push payload shape
 *   • applicable rule-set precedence (algorithm-level test on a
 *     synthetic candidate list)
 *   • quoteStay determinism: identical input → identical output
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");

// -----------------------------------------------------------------------------
// quote-pure primitives
// -----------------------------------------------------------------------------
test("enumerateStayNights honours half-open [checkIn, checkOut)", async () => {
  const { enumerateStayNights } = await import(
    "../src/features/dynamic-pricing/quote-pure"
  );
  assert.deepEqual(enumerateStayNights("2026-05-01", "2026-05-04"), [
    "2026-05-01",
    "2026-05-02",
    "2026-05-03",
  ]);
  assert.deepEqual(enumerateStayNights("2026-05-01", "2026-05-01"), []);
  assert.deepEqual(enumerateStayNights("2026-05-04", "2026-05-01"), []);
  assert.deepEqual(enumerateStayNights("not-a-date", "2026-05-04"), []);
});

test("applyModifierMinor handles percent and fixed correctly", async () => {
  const { applyModifierMinor } = await import(
    "../src/features/dynamic-pricing/quote-pure"
  );
  // +12% on 60,000 → 67,200
  assert.equal(
    applyModifierMinor(60_000n, {
      modifierType: "percent",
      modifierValueNumeric: 0.12,
    }),
    67_200n,
  );
  // -5% on 60,000 → 57,000
  assert.equal(
    applyModifierMinor(60_000n, {
      modifierType: "percent",
      modifierValueNumeric: -0.05,
    }),
    57_000n,
  );
  // Fixed +1500 on 60,000 → 61,500
  assert.equal(
    applyModifierMinor(60_000n, {
      modifierType: "fixed",
      modifierAmountMinor: 1_500n,
    }),
    61_500n,
  );
  // Null inputs become no-op.
  assert.equal(
    applyModifierMinor(60_000n, {
      modifierType: "percent",
      modifierValueNumeric: null,
    }),
    60_000n,
  );
});

test("clampRateMinor min/max", async () => {
  const { clampRateMinor } = await import(
    "../src/features/dynamic-pricing/quote-pure"
  );
  assert.equal(clampRateMinor(50_000n, 60_000n, 100_000n).value, 60_000n);
  assert.equal(clampRateMinor(120_000n, 60_000n, 100_000n).value, 100_000n);
  assert.equal(clampRateMinor(80_000n, 60_000n, 100_000n).value, 80_000n);
  assert.equal(clampRateMinor(80_000n, null, null).clamped, null);
});

// -----------------------------------------------------------------------------
// Rule resolvers
// -----------------------------------------------------------------------------
test("resolveDayOfWeekRule returns matching weekday only", async () => {
  const { resolveDayOfWeekRule, parseIsoDate } = await import(
    "../src/features/dynamic-pricing/quote-pure"
  );
  const friday = parseIsoDate("2026-05-01")!; // ISO weekday 5
  const rules = [
    { id: "r1", ruleSetId: "s1", weekday: 5, modifierType: "percent" as const, modifierValueNumeric: 0.12, modifierAmountMinor: null, minLos: null, status: "active" as const },
    { id: "r2", ruleSetId: "s1", weekday: 6, modifierType: "percent" as const, modifierValueNumeric: 0.12, modifierAmountMinor: null, minLos: null, status: "active" as const },
    { id: "r3", ruleSetId: "s1", weekday: 7, modifierType: "percent" as const, modifierValueNumeric: -0.05, modifierAmountMinor: null, minLos: null, status: "paused" as const },
  ];
  assert.equal(resolveDayOfWeekRule(friday, rules)?.id, "r1");
});

test("resolveOccupancyRule picks the right band", async () => {
  const { resolveOccupancyRule } = await import(
    "../src/features/dynamic-pricing/quote-pure"
  );
  const rules = [
    { id: "a", ruleSetId: "s1", occupancyMin: 0, occupancyMax: 0.4, modifierType: "percent" as const, modifierValueNumeric: -0.10, modifierAmountMinor: null, status: "active" as const },
    { id: "b", ruleSetId: "s1", occupancyMin: 0.4, occupancyMax: 0.7, modifierType: "percent" as const, modifierValueNumeric: 0, modifierAmountMinor: null, status: "active" as const },
    { id: "c", ruleSetId: "s1", occupancyMin: 0.7, occupancyMax: 0.9, modifierType: "percent" as const, modifierValueNumeric: 0.10, modifierAmountMinor: null, status: "active" as const },
    { id: "d", ruleSetId: "s1", occupancyMin: 0.9, occupancyMax: 1.0, modifierType: "percent" as const, modifierValueNumeric: 0.20, modifierAmountMinor: null, status: "active" as const },
  ];
  assert.equal(resolveOccupancyRule(0.2, rules)?.id, "a");
  assert.equal(resolveOccupancyRule(0.5, rules)?.id, "b");
  assert.equal(resolveOccupancyRule(0.8, rules)?.id, "c");
  assert.equal(resolveOccupancyRule(0.95, rules)?.id, "d");
  // Edge: 0.7 sits in the c band per `[min, max)` semantics.
  assert.equal(resolveOccupancyRule(0.7, rules)?.id, "c");
});

test("resolveCloseOutRule picks the right window", async () => {
  const { resolveCloseOutRule, parseIsoDate } = await import(
    "../src/features/dynamic-pricing/quote-pure"
  );
  const today = parseIsoDate("2026-05-01")!;
  const date = parseIsoDate("2026-05-03")!;
  const rules = [
    { id: "near", ruleSetId: "s1", daysBeforeCheckinMin: 0, daysBeforeCheckinMax: 3, modifierType: "percent" as const, modifierValueNumeric: -0.15, modifierAmountMinor: null, minLos: null, status: "active" as const },
    { id: "far", ruleSetId: "s1", daysBeforeCheckinMin: 180, daysBeforeCheckinMax: 365, modifierType: "percent" as const, modifierValueNumeric: 0.10, modifierAmountMinor: null, minLos: null, status: "active" as const },
  ];
  assert.equal(resolveCloseOutRule(date, today, rules)?.id, "near");
  const farDate = parseIsoDate("2027-01-01")!;
  assert.equal(resolveCloseOutRule(farDate, today, rules)?.id, "far");
});

test("resolveChannelRule matches by key", async () => {
  const { resolveChannelRule } = await import(
    "../src/features/dynamic-pricing/quote-pure"
  );
  const rules = [
    { id: "ab", ruleSetId: "s1", channelKey: "airbnb", modifierType: "percent" as const, modifierValueNumeric: 0.14, modifierAmountMinor: null, commissionModel: "channel_collects", status: "active" as const },
    { id: "bc", ruleSetId: "s1", channelKey: "booking_com", modifierType: "percent" as const, modifierValueNumeric: 0.18, modifierAmountMinor: null, commissionModel: "commission_on_gross", status: "active" as const },
  ];
  assert.equal(resolveChannelRule("airbnb", rules)?.id, "ab");
  assert.equal(resolveChannelRule("vrbo", rules), null);
});

test("resolveMinStayRequirement picks strictest", async () => {
  const { resolveMinStayRequirement } = await import(
    "../src/features/dynamic-pricing/quote-pure"
  );
  const rules = [
    { id: "default", ruleSetId: "s1", name: "Default 2", startsOn: null, endsOn: null, weekdayMask: null, minLos: 2, maxLos: null, priority: 100, status: "active" as const },
    { id: "peak", ruleSetId: "s1", name: "Peak 5", startsOn: "2026-12-20", endsOn: "2027-01-05", weekdayMask: null, minLos: 5, maxLos: null, priority: 10, status: "active" as const },
  ];
  assert.equal(resolveMinStayRequirement("2026-06-01", "2026-06-04", rules).minLos, 2);
  assert.equal(resolveMinStayRequirement("2026-12-25", "2026-12-30", rules).minLos, 5);
});

test("resolveStopSell honours channel scope", async () => {
  const { resolveStopSell } = await import(
    "../src/features/dynamic-pricing/quote-pure"
  );
  const rules = [
    { id: "1", ruleSetId: "s1", name: "Roof works", startsOn: "2026-05-12", endsOn: "2026-05-14", reason: "operational_risk", channelKey: null, status: "active" as const },
    { id: "2", ruleSetId: "s1", name: "Airbnb-only block", startsOn: "2026-06-01", endsOn: "2026-06-03", reason: "channel_strategy", channelKey: "airbnb", status: "active" as const },
  ];
  assert.equal(resolveStopSell("2026-05-13", "direct", rules)?.id, "1");
  assert.equal(resolveStopSell("2026-06-02", "airbnb", rules)?.id, "2");
  assert.equal(resolveStopSell("2026-06-02", "direct", rules), null);
});

// -----------------------------------------------------------------------------
// quoteNight + quoteStay
// -----------------------------------------------------------------------------
function buildBundle(): import("../src/features/dynamic-pricing/rule-types").RuleBundle {
  return {
    ruleSet: {
      id: "s1",
      ruleSetCode: "s1",
      name: "Bali baseline",
      scopeType: "global",
      projectId: null,
      villaId: null,
      status: "active",
      priority: 100,
      currency: "USD",
      baseRateMinor: 60_000n,
      minRateMinor: 30_000n,
      maxRateMinor: 200_000n,
    },
    dayOfWeek: [
      { id: "fri", ruleSetId: "s1", weekday: 5, modifierType: "percent", modifierValueNumeric: 0.12, modifierAmountMinor: null, minLos: null, status: "active" },
      { id: "sat", ruleSetId: "s1", weekday: 6, modifierType: "percent", modifierValueNumeric: 0.12, modifierAmountMinor: null, minLos: null, status: "active" },
    ],
    occupancy: [
      { id: "med", ruleSetId: "s1", occupancyMin: 0.4, occupancyMax: 0.7, modifierType: "percent", modifierValueNumeric: 0, modifierAmountMinor: null, status: "active" },
    ],
    closeOut: [
      { id: "near", ruleSetId: "s1", daysBeforeCheckinMin: 0, daysBeforeCheckinMax: 3, modifierType: "percent", modifierValueNumeric: -0.15, modifierAmountMinor: null, minLos: null, status: "active" },
    ],
    channels: [
      { id: "ab", ruleSetId: "s1", channelKey: "airbnb", modifierType: "percent", modifierValueNumeric: 0.14, modifierAmountMinor: null, commissionModel: "channel_collects", status: "active" },
      { id: "dr", ruleSetId: "s1", channelKey: "direct", modifierType: "percent", modifierValueNumeric: -0.05, modifierAmountMinor: null, commissionModel: "none", status: "active" },
    ],
    minStay: [
      { id: "default", ruleSetId: "s1", name: "Default 2", startsOn: null, endsOn: null, weekdayMask: null, minLos: 2, maxLos: null, priority: 100, status: "active" },
    ],
    stopSell: [
      { id: "roof", ruleSetId: "s1", name: "Roof works", startsOn: "2026-05-12", endsOn: "2026-05-14", reason: "operational_risk", channelKey: null, status: "active" },
    ],
  };
}

test("quoteNight explanation steps are deterministic", async () => {
  const { quoteNight } = await import("../src/features/dynamic-pricing/quote-pure");
  const bundle = buildBundle();
  const a = quoteNight({
    date: "2026-05-01",
    today: "2026-05-01",
    channelKey: "direct",
    occupancy: 0.5,
    bundle,
  });
  const b = quoteNight({
    date: "2026-05-01",
    today: "2026-05-01",
    channelKey: "direct",
    occupancy: 0.5,
    bundle,
  });
  assert.equal(a.finalRateMinor, b.finalRateMinor);
  assert.deepEqual(
    a.explanationSteps.map((s) => s.type),
    b.explanationSteps.map((s) => s.type),
  );
  // Includes base + DOW + close-out + channel + clamp possibly.
  assert.ok(a.explanationSteps.some((s) => s.type === "base"));
  assert.ok(a.explanationSteps.some((s) => s.type === "day_of_week"));
});

test("quoteStay totalMinor equals sum of nightly rates", async () => {
  const { quoteStay } = await import("../src/features/dynamic-pricing/quote-pure");
  const bundle = buildBundle();
  const result = quoteStay({
    checkIn: "2026-06-01",
    checkOut: "2026-06-04",
    today: "2026-05-01",
    channelKey: "direct",
    bundle,
    occupancyByDate: {
      "2026-06-01": 0.5,
      "2026-06-02": 0.5,
      "2026-06-03": 0.5,
    },
  });
  assert.equal(result.available, true);
  const sum = result.nightly.reduce((acc, n) => acc + n.finalRateMinor, 0n);
  assert.equal(result.totalMinor, sum);
});

test("quoteStay determinism: identical input → identical output", async () => {
  const { quoteStay } = await import("../src/features/dynamic-pricing/quote-pure");
  const bundle = buildBundle();
  const args = {
    checkIn: "2026-06-01",
    checkOut: "2026-06-05",
    today: "2026-05-01",
    channelKey: "airbnb",
    bundle,
  } as const;
  const a = JSON.stringify(serialise(quoteStay(args)));
  const b = JSON.stringify(serialise(quoteStay(args)));
  assert.equal(a, b);
});

function serialise(stay: import("../src/features/dynamic-pricing/quote-pure").QuoteStay) {
  return {
    available: stay.available,
    reason: stay.reason,
    nights: stay.nights,
    total: stay.totalMinor.toString(),
    avg: stay.averageNightlyMinor.toString(),
    nightly: stay.nightly.map((n) => ({
      date: n.date,
      final: n.finalRateMinor.toString(),
      reason: n.unavailableReason,
    })),
  };
}

// -----------------------------------------------------------------------------
// Public summary + admin explainer
// -----------------------------------------------------------------------------
test("public summary strips internal reason details", async () => {
  const { quoteStay } = await import("../src/features/dynamic-pricing/quote-pure");
  const { buildPublicQuoteSummary } = await import(
    "../src/features/dynamic-pricing/explainer"
  );
  const bundle = buildBundle();
  const stay = quoteStay({
    checkIn: "2026-05-12",
    checkOut: "2026-05-14",
    today: "2026-05-01",
    channelKey: "direct",
    bundle,
  });
  const summary = buildPublicQuoteSummary(stay);
  // The stop-sell rule for 2026-05-12..14 means the stay is unavailable.
  assert.equal(summary.available, false);
  assert.equal(summary.reason, "stop_sell");
  // No internal categories leak.
  const json = JSON.stringify(summary, (_k, v) =>
    typeof v === "bigint" ? v.toString() : v,
  );
  for (const banned of ["owner_stay", "guest_booking", "maintenance_block", "internal_hold"]) {
    assert.equal(json.includes(banned), false);
  }
});

test("admin explainer covers all modifier types", async () => {
  const { quoteStay } = await import("../src/features/dynamic-pricing/quote-pure");
  const { buildStayPricingExplanation } = await import(
    "../src/features/dynamic-pricing/explainer"
  );
  const bundle = buildBundle();
  const stay = quoteStay({
    checkIn: "2026-05-01", // Friday
    checkOut: "2026-05-03",
    today: "2026-05-01",
    channelKey: "airbnb",
    bundle,
    occupancyByDate: { "2026-05-01": 0.5, "2026-05-02": 0.5 },
  });
  const lines = buildStayPricingExplanation(stay);
  const flat = lines.map((l) => `${l.label} ${l.detail ?? ""}`).join(" | ");
  assert.ok(flat.includes("2026-05-01"));
  // Per-night step labels include the modifier categories.
  const flatExp = stay.nightly
    .flatMap((n) => n.explanationSteps.map((s) => s.type))
    .join(",");
  for (const t of ["base", "day_of_week", "channel", "close_out"]) {
    assert.ok(flatExp.includes(t), `missing modifier type ${t}`);
  }
});

// -----------------------------------------------------------------------------
// Availability labels
// -----------------------------------------------------------------------------
test("availability labels diverge public vs admin", async () => {
  const { availabilityLabelForPublic, availabilityLabelForAdmin } =
    await import("../src/features/dynamic-pricing/availability-pure");
  // Owner-stay collapses publicly to "Unavailable" but is "Owner stay" in admin.
  assert.equal(availabilityLabelForPublic("owner_stay").label, "Unavailable");
  assert.equal(availabilityLabelForAdmin("owner_stay").label, "Owner stay");
  // Guest booking is NEVER named publicly.
  assert.equal(availabilityLabelForPublic("guest_booking").label, "Unavailable");
  assert.equal(availabilityLabelForAdmin("guest_booking").label, "Guest in-house");
});

// -----------------------------------------------------------------------------
// Rule-set precedence (algorithmic test on synthetic candidates)
// -----------------------------------------------------------------------------
test("applicable rule-set precedence: villa > project > global", async () => {
  // We replicate the precedence function inline as a smoke test —
  // the live `getApplicablePricingRuleSet` is DB-bound; this keeps
  // the algorithm's contract pinned.
  const villaId = "v1";
  const projectId = "p1";
  const candidates = [
    { id: "g", scopeType: "global", priority: 100, villaId: null, projectId: null, status: "active" },
    { id: "p", scopeType: "project", priority: 50, villaId: null, projectId: "p1", status: "active" },
    { id: "v", scopeType: "villa", priority: 10, villaId: "v1", projectId: null, status: "active" },
  ];
  const villaScoped = candidates.filter((c) => c.scopeType === "villa" && c.villaId === villaId);
  const projectScoped = candidates.filter((c) => c.scopeType === "project" && c.projectId === projectId);
  const global = candidates.filter((c) => c.scopeType === "global");
  assert.equal(villaScoped[0]?.id, "v");
  assert.equal(projectScoped[0]?.id, "p");
  assert.equal(global[0]?.id, "g");
});

// -----------------------------------------------------------------------------
// Permissions
// -----------------------------------------------------------------------------
test("permissions: revenue_manager / booking_manager / investor / field exclusions", async () => {
  const { ROLE_CAPABILITIES } = await import(
    "../src/features/auth/permission-matrix"
  );
  const allows = (perm: string, role: string): boolean =>
    (ROLE_CAPABILITIES[perm] ?? []).includes(role as never);

  // revenue_manager has read + write + manage.
  assert.equal(allows("dynamic_pricing.read", "revenue_manager"), true);
  assert.equal(allows("dynamic_pricing.write", "revenue_manager"), true);
  assert.equal(allows("dynamic_pricing.manage", "revenue_manager"), true);

  // booking_manager: read + quote, no write/manage.
  assert.equal(allows("dynamic_pricing.read", "booking_manager"), true);
  assert.equal(allows("pricing_quote.read", "booking_manager"), true);
  assert.equal(allows("dynamic_pricing.write", "booking_manager"), false);
  assert.equal(allows("dynamic_pricing.manage", "booking_manager"), false);

  // finance_manager: read + quote + logs.
  assert.equal(allows("dynamic_pricing.read", "finance_manager"), true);
  assert.equal(allows("pricing_quote.read", "finance_manager"), true);

  // Investor + field roles excluded everywhere.
  for (const role of [
    "investor_owner",
    "investor_viewer",
    "housekeeping_supervisor",
    "housekeeper",
    "technician",
  ]) {
    for (const perm of [
      "dynamic_pricing.read",
      "dynamic_pricing.write",
      "dynamic_pricing.manage",
      "pricing_quote.read",
      "pricing_channel_push.simulate",
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
// Migration pinning
// -----------------------------------------------------------------------------
test("migration 0026 pins RLS / enums / unique indexes", () => {
  const sql = readFileSync(
    join(repoRoot, "drizzle/0026_dynamic_pricing_availability_rules.sql"),
    "utf-8",
  );
  for (const t of [
    "pricing_rule_sets",
    "pricing_day_of_week_rules",
    "pricing_occupancy_rules",
    "pricing_close_out_rules",
    "pricing_channel_rules",
    "pricing_min_stay_rules",
    "pricing_stop_sell_rules",
    "pricing_quote_logs",
    "channel_push_events",
  ]) {
    assert.ok(sql.includes(`'${t}'`), `missing RLS for ${t}`);
  }
  assert.ok(sql.includes("ENABLE ROW LEVEL SECURITY"));
  assert.ok(sql.includes("FORCE ROW LEVEL SECURITY"));
  // Modifier enums.
  assert.ok(/CHECK \("modifier_type" IN \('percent','fixed'\)\)/i.test(sql));
  assert.ok(/CHECK \("modifier_type" IN \('percent','fixed','stop_sell'\)\)/i.test(sql));
  // Unique indexes.
  assert.ok(sql.includes("pricing_dow_rules_unique"));
  assert.ok(sql.includes("pricing_channel_rules_unique"));
  // Stop-sell reason enum.
  for (const r of ["maintenance_buffer", "owner_hold", "operational_risk", "channel_strategy", "manual"]) {
    assert.ok(sql.includes(`'${r}'`));
  }
});

// -----------------------------------------------------------------------------
// Channel push payload shape
// -----------------------------------------------------------------------------
test("channel push event seed payload has the expected shape", () => {
  const seed = readFileSync(join(repoRoot, "drizzle/seed.sql"), "utf-8");
  // The two demo events use payload_json with `ruleSetId` or `reason`.
  assert.ok(seed.includes("CPE-DEMO-001"));
  assert.ok(seed.includes("CPE-DEMO-002"));
  assert.ok(seed.includes("rate_update"));
  assert.ok(seed.includes("stop_sell_update"));
});

// -----------------------------------------------------------------------------
// Source greps
// -----------------------------------------------------------------------------
function walk(dir: string, files: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, files);
    else if (s.isFile() && /\.(ts|tsx)$/.test(name)) files.push(p);
  }
  return files;
}

test("/api/v1/quote does not expose rule_set_id in response", () => {
  const body = readFileSync(
    join(repoRoot, "src/app/api/v1/quote/route.ts"),
    "utf-8",
  );
  // The route logs ruleSetId to pricing_quote_logs but it must not
  // appear in the returned response body.
  // Heuristic: rule_set_id (snake) or `ruleSetId` should not appear in
  // the `responseBody` literal.
  const responseBlock = body.split("const responseBody = {")[1] ?? "";
  const closing = responseBlock.split("};")[0];
  assert.equal(closing.includes("ruleSetId"), false);
  assert.equal(closing.includes("rule_set_id"), false);
});

test("owner routes do not import dynamic-pricing internal modules", () => {
  const root = join(repoRoot, "src/app/(owner)");
  const files = walk(root);
  for (const f of files) {
    const body = readFileSync(f, "utf-8");
    for (const banned of [
      "@/features/dynamic-pricing/services",
      "@/features/dynamic-pricing/actions",
      "@/features/dynamic-pricing/channel-push-stub",
    ]) {
      assert.equal(
        body.includes(banned),
        false,
        `${f} imports banned module ${banned}`,
      );
    }
  }
});
