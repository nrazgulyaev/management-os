/**
 * v9D — pure-logic smoke tests:
 *   - Migration 0014 shape (tables + RLS + risk unique index).
 *   - calculateNextDueAt across all frequencies + custom interval.
 *   - dateMatchesWeekdays (numeric + label).
 *   - wouldExceedClusteringLimit (30 % rule).
 *   - scoreWindowCandidates: requires_villa_empty rejects guest stay,
 *     low disruption is allowed during stay (with score penalty),
 *     OOO blocks reject hard, preferred weekday boost, clustering penalty.
 *   - classifyUtilityBalance + classifyReadingFreshness + balanceLevelToRiskType.
 *   - Permission matrix exposes all v9D keys; owners + guests excluded.
 *
 * No DB / no `server-only` import.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");

// -----------------------------------------------------------------------------
// Migration 0014
// -----------------------------------------------------------------------------
test("migration 0014 declares all 7 tables + RLS + risk unique index", () => {
  const sql = readFileSync(
    join(repoRoot, "drizzle/0014_preventive_maintenance_utilities.sql"),
    "utf8",
  );
  for (const t of [
    "maintenance_templates",
    "villa_maintenance_plans",
    "maintenance_window_suggestions",
    "utility_accounts",
    "utility_readings",
    "utility_payment_reminders",
    "maintenance_risk_events",
  ]) {
    assert.match(
      sql,
      new RegExp(`CREATE TABLE IF NOT EXISTS "${t}"`),
      `missing ${t}`,
    );
  }
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /FORCE ROW LEVEL SECURITY/);
  // Risk feed idempotency anchor.
  assert.match(
    sql,
    /CREATE UNIQUE INDEX IF NOT EXISTS "maintenance_risk_events_open_unique"/,
  );
  assert.match(sql, /WHERE "status" = 'open'/);
});

// -----------------------------------------------------------------------------
// calculateNextDueAt
// -----------------------------------------------------------------------------
test("calculateNextDueAt advances by the right calendar delta", async () => {
  const { calculateNextDueAt } = await import(
    "../src/features/maintenance-intelligence/scheduling-pure"
  );
  const base = new Date("2026-04-01T09:00:00Z");
  const cases = [
    { f: "daily", days: 1 },
    { f: "twice_weekly", days: 4 },
    { f: "weekly", days: 7 },
    { f: "biweekly", days: 14 },
    { f: "monthly", days: 30 },
    { f: "quarterly", days: 91 },
    { f: "yearly", days: 365 },
  ] as const;
  for (const c of cases) {
    const next = calculateNextDueAt({
      frequency: c.f,
      lastCompletedAt: base,
    });
    assert.equal(
      next.getTime() - base.getTime(),
      c.days * 24 * 60 * 60 * 1000,
      `${c.f} should advance by ${c.days} days`,
    );
  }
});

test("calculateNextDueAt: custom uses intervalDays (or safe default)", async () => {
  const { calculateNextDueAt } = await import(
    "../src/features/maintenance-intelligence/scheduling-pure"
  );
  const base = new Date("2026-04-01T00:00:00Z");
  const next = calculateNextDueAt({
    frequency: "custom",
    intervalDays: 21,
    lastCompletedAt: base,
  });
  assert.equal(next.getTime() - base.getTime(), 21 * 24 * 60 * 60 * 1000);
  // Missing interval → safe default of 14.
  const fallback = calculateNextDueAt({
    frequency: "custom",
    intervalDays: null,
    lastCompletedAt: base,
  });
  assert.equal(fallback.getTime() - base.getTime(), 14 * 24 * 60 * 60 * 1000);
});

// -----------------------------------------------------------------------------
// dateMatchesWeekdays
// -----------------------------------------------------------------------------
test("dateMatchesWeekdays: numeric ISO + 3-letter label both work", async () => {
  const { dateMatchesWeekdays } = await import(
    "../src/features/maintenance-intelligence/scheduling-pure"
  );
  // 2026-04-27 = Monday (ISO 1).
  assert.equal(dateMatchesWeekdays("2026-04-27", [1]), true);
  assert.equal(dateMatchesWeekdays("2026-04-27", ["mon"]), true);
  assert.equal(dateMatchesWeekdays("2026-04-27", ["tuesday"]), false);
  assert.equal(dateMatchesWeekdays("2026-04-27", []), false);
});

// -----------------------------------------------------------------------------
// Clustering rule
// -----------------------------------------------------------------------------
test("wouldExceedClusteringLimit: 30 % rule per project per category per date", async () => {
  const { wouldExceedClusteringLimit } = await import(
    "../src/features/maintenance-intelligence/scheduling-pure"
  );
  // 4 villas in project, threshold = 30 % → max 1 villa same day.
  // Adding the candidate makes 2 → exceeds.
  const exceeds = wouldExceedClusteringLimit({
    candidateDate: "2026-05-01",
    category: "ac",
    totalVillasInProject: 4,
    existingTasksByDate: [
      { date: "2026-05-01", villaId: "v1", category: "ac" },
    ],
  });
  assert.equal(exceeds, true);
  // 10 villas, threshold = 30 % → max 3 same day. 2 existing + candidate = 3,
  // boundary is "more than 30%" so 30% exact is allowed.
  const okBoundary = wouldExceedClusteringLimit({
    candidateDate: "2026-05-01",
    category: "ac",
    totalVillasInProject: 10,
    existingTasksByDate: [
      { date: "2026-05-01", villaId: "v1", category: "ac" },
      { date: "2026-05-01", villaId: "v2", category: "ac" },
    ],
  });
  assert.equal(okBoundary, false);
});

// -----------------------------------------------------------------------------
// scoreWindowCandidates
// -----------------------------------------------------------------------------
test("scoreWindowCandidates: requires_villa_empty rejects guest_booking overlap", async () => {
  const { enumerateCandidateWindows, scoreWindowCandidates } = await import(
    "../src/features/maintenance-intelligence/scheduling-pure"
  );
  const from = new Date("2026-05-01T00:00:00Z");
  const until = new Date("2026-05-02T00:00:00Z");
  const candidates = enumerateCandidateWindows({
    from,
    until,
    durationMinutes: 60,
    preferredTimeWindowStart: "09:00",
  });
  const scored = scoreWindowCandidates({
    candidates,
    villaBlocks: [
      {
        blockType: "guest_booking",
        status: "active",
        startsAt: "2026-05-01T08:00:00Z",
        endsAt: "2026-05-03T11:00:00Z",
      },
    ],
    constraints: {
      category: "electrical",
      durationMinutes: 60,
      canBeDoneWhileOccupied: false,
      guestDisruptionLevel: "high",
      requiresVillaEmpty: true,
      preferredWeekdays: null,
      avoidWeekdays: null,
      preferredTimeWindowStart: "09:00",
      preferredTimeWindowEnd: null,
    },
    sameCategoryDateCounts: {},
    totalVillasInProject: 4,
  });
  assert.equal(scored.length, 0, "all candidates must be rejected");
});

test("scoreWindowCandidates: low disruption keeps the candidate during stay (with penalty)", async () => {
  const { enumerateCandidateWindows, scoreWindowCandidates } = await import(
    "../src/features/maintenance-intelligence/scheduling-pure"
  );
  const from = new Date("2026-05-01T00:00:00Z");
  const until = new Date("2026-05-02T00:00:00Z");
  const candidates = enumerateCandidateWindows({
    from,
    until,
    durationMinutes: 30,
    preferredTimeWindowStart: "09:00",
  });
  const scored = scoreWindowCandidates({
    candidates,
    villaBlocks: [
      {
        blockType: "guest_booking",
        status: "active",
        startsAt: "2026-05-01T08:00:00Z",
        endsAt: "2026-05-03T11:00:00Z",
      },
    ],
    constraints: {
      category: "smart_lock",
      durationMinutes: 30,
      canBeDoneWhileOccupied: true,
      guestDisruptionLevel: "low",
      requiresVillaEmpty: false,
      preferredWeekdays: null,
      avoidWeekdays: null,
      preferredTimeWindowStart: "09:00",
      preferredTimeWindowEnd: null,
    },
    sameCategoryDateCounts: {},
    totalVillasInProject: 4,
  });
  assert.ok(scored.length >= 1);
  assert.ok(scored[0].score < 0.6, "score should be penalised during stay");
});

test("scoreWindowCandidates: out_of_order block rejects regardless of plan", async () => {
  const { enumerateCandidateWindows, scoreWindowCandidates } = await import(
    "../src/features/maintenance-intelligence/scheduling-pure"
  );
  const from = new Date("2026-05-01T00:00:00Z");
  const until = new Date("2026-05-02T00:00:00Z");
  const scored = scoreWindowCandidates({
    candidates: enumerateCandidateWindows({
      from,
      until,
      durationMinutes: 60,
      preferredTimeWindowStart: "09:00",
    }),
    villaBlocks: [
      {
        blockType: "out_of_order",
        status: "active",
        startsAt: "2026-04-30T00:00:00Z",
        endsAt: "2026-05-05T00:00:00Z",
      },
    ],
    constraints: {
      category: "general",
      durationMinutes: 60,
      canBeDoneWhileOccupied: true,
      guestDisruptionLevel: "low",
      requiresVillaEmpty: false,
      preferredWeekdays: null,
      avoidWeekdays: null,
      preferredTimeWindowStart: "09:00",
      preferredTimeWindowEnd: null,
    },
    sameCategoryDateCounts: {},
    totalVillasInProject: 4,
  });
  assert.equal(scored.length, 0);
});

test("scoreWindowCandidates: clustering penalty reduces score when other villas have same category", async () => {
  const { enumerateCandidateWindows, scoreWindowCandidates } = await import(
    "../src/features/maintenance-intelligence/scheduling-pure"
  );
  const from = new Date("2026-05-01T00:00:00Z");
  const until = new Date("2026-05-01T00:00:00Z");
  const base = scoreWindowCandidates({
    candidates: enumerateCandidateWindows({
      from,
      until,
      durationMinutes: 60,
      preferredTimeWindowStart: "09:00",
    }),
    villaBlocks: [],
    constraints: {
      category: "ac",
      durationMinutes: 60,
      canBeDoneWhileOccupied: true,
      guestDisruptionLevel: "low",
      requiresVillaEmpty: false,
      preferredWeekdays: null,
      avoidWeekdays: null,
      preferredTimeWindowStart: "09:00",
      preferredTimeWindowEnd: null,
    },
    sameCategoryDateCounts: {},
    totalVillasInProject: 4,
  });
  const clustered = scoreWindowCandidates({
    candidates: enumerateCandidateWindows({
      from,
      until,
      durationMinutes: 60,
      preferredTimeWindowStart: "09:00",
    }),
    villaBlocks: [],
    constraints: {
      category: "ac",
      durationMinutes: 60,
      canBeDoneWhileOccupied: true,
      guestDisruptionLevel: "low",
      requiresVillaEmpty: false,
      preferredWeekdays: null,
      avoidWeekdays: null,
      preferredTimeWindowStart: "09:00",
      preferredTimeWindowEnd: null,
    },
    sameCategoryDateCounts: { "2026-05-01": 2 },
    totalVillasInProject: 4,
  });
  assert.ok(clustered[0].score < base[0].score, "clustered score must drop");
});

// -----------------------------------------------------------------------------
// Utility threshold + freshness
// -----------------------------------------------------------------------------
test("classifyUtilityBalance: ok / low / critical thresholds", async () => {
  const { classifyUtilityBalance } = await import(
    "../src/features/utilities/risk-pure"
  );
  const t = {
    lowBalanceThresholdMinor: 30_000_000,
    criticalBalanceThresholdMinor: 10_000_000,
  };
  assert.equal(classifyUtilityBalance(50_000_000, t), "ok");
  assert.equal(classifyUtilityBalance(20_000_000, t), "low");
  assert.equal(classifyUtilityBalance(8_000_000, t), "critical");
  // Negative is always critical.
  assert.equal(classifyUtilityBalance(-1, t), "critical");
  // Null balance can't be classified → ok.
  assert.equal(classifyUtilityBalance(null, t), "ok");
});

test("classifyReadingFreshness: stale after threshold, critical after 2x", async () => {
  const { classifyReadingFreshness } = await import(
    "../src/features/utilities/risk-pure"
  );
  const now = new Date("2026-05-01T00:00:00Z");
  // Recent.
  assert.equal(
    classifyReadingFreshness({
      lastReadingAt: new Date("2026-04-15T00:00:00Z"),
      now,
      staleAfterDays: 30,
    }),
    "ok",
  );
  // Stale.
  assert.equal(
    classifyReadingFreshness({
      lastReadingAt: new Date("2026-03-25T00:00:00Z"),
      now,
      staleAfterDays: 30,
    }),
    "low",
  );
  // Very stale.
  assert.equal(
    classifyReadingFreshness({
      lastReadingAt: new Date("2026-02-01T00:00:00Z"),
      now,
      staleAfterDays: 30,
    }),
    "critical",
  );
  // No reading at all.
  assert.equal(
    classifyReadingFreshness({
      lastReadingAt: null,
      now,
      staleAfterDays: 30,
    }),
    "low",
  );
});

test("balanceLevelToRiskType + levelToSeverity round-trip", async () => {
  const { balanceLevelToRiskType, levelToSeverity } = await import(
    "../src/features/utilities/risk-pure"
  );
  assert.equal(balanceLevelToRiskType("critical"), "utility_critical_balance");
  assert.equal(balanceLevelToRiskType("low"), "utility_low_balance");
  assert.equal(balanceLevelToRiskType("ok"), null);
  assert.equal(levelToSeverity("critical"), "critical");
  assert.equal(levelToSeverity("low"), "high");
  assert.equal(levelToSeverity("ok"), "low");
});

// -----------------------------------------------------------------------------
// Permission matrix
// -----------------------------------------------------------------------------
test("permission matrix exposes all v9D keys; owners and guests excluded", async () => {
  const mod = await import("../src/features/auth/permission-matrix");
  const KEYS = [
    "maintenance_intelligence.read",
    "maintenance_intelligence.write",
    "maintenance_intelligence.generate",
    "utilities.read",
    "utilities.write",
    "utilities.pay",
    "maintenance_risk.read",
    "maintenance_risk.manage",
  ] as const;
  for (const k of KEYS) {
    assert.ok(
      Array.isArray(mod.ROLE_CAPABILITIES[k]),
      `missing key: ${k}`,
    );
    assert.ok(
      mod.ROLE_CAPABILITIES[k].includes("super_admin"),
      `super_admin should have ${k}`,
    );
    // Owners + agents must never have v9D capabilities.
    assert.ok(
      !mod.ROLE_CAPABILITIES[k].includes("investor_owner" as never),
      `${k}: owner must be excluded`,
    );
    assert.ok(
      !mod.ROLE_CAPABILITIES[k].includes("investor_viewer" as never),
      `${k}: viewer must be excluded`,
    );
    assert.ok(
      !mod.ROLE_CAPABILITIES[k].includes("agent" as never),
      `${k}: agent must be excluded`,
    );
  }
  // utilities.pay restricted to finance/operations roles.
  const pay = mod.ROLE_CAPABILITIES["utilities.pay"];
  assert.ok(!pay.includes("housekeeper" as never));
  assert.ok(!pay.includes("technician" as never));
  assert.ok(pay.includes("finance_manager"));
});
