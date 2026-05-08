/**
 * Stage 5.H — Schedule Sophistication tests.
 *
 * Coverage:
 *   - Migration shape (0067 + 0068 + 0069 + RLS)
 *   - Schema exports
 *   - Pure helpers:
 *     - calendar-helpers: isWorkingDay, countWorkingDays, addWorkingDays, nextWorkingDay, workingDaysBetween
 *     - critical-path-calendar-helpers: calendar-aware variant + ORIGINAL CPM still byte-identical
 *     - variance-helpers: classifyVariance, computeProjectScheduleHealth, detectScheduleSlipPattern
 *     - resource-leveling-helpers: detectOverAllocations, suggestLevelingActions
 *     - productivity-helpers: computeProductivityRate, compareToBenchmark, aggregateProductivityByTrade
 *   - Cron + dispatcher + route audit (64 routes)
 *   - Sidebar SCHEDULE additions
 *   - UI page presence
 *   - Demo seed audit
 *   - Architecture doc
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  isWorkingDay,
  countWorkingDays,
  addWorkingDays,
  nextWorkingDay,
  workingDaysBetween,
  type WorkingCalendar,
} from "../src/lib/development/server/calendar/calendar-helpers";
import {
  computeCriticalPath,
  type TaskInput,
  type DependencyInput,
} from "../src/lib/development/server/schedule/critical-path-helpers";
import { computeCriticalPathWithCalendar } from "../src/lib/development/server/schedule/critical-path-calendar-helpers";
import {
  classifyVariance,
  computeProjectScheduleHealth,
  detectScheduleSlipPattern,
} from "../src/lib/development/server/schedule/variance-helpers";
import {
  detectOverAllocations,
  suggestLevelingActions,
  type ResourceAllocation,
} from "../src/lib/development/server/schedule/resource-leveling-helpers";
import {
  computeProductivityRate,
  compareToBenchmark,
  aggregateProductivityByTrade,
} from "../src/lib/development/server/productivity/productivity-helpers";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");
const exists = (rel: string) => existsSync(resolve(ROOT, rel));

const MIG_0067 = "drizzle/0067_development_os_stage_5_h_1_calendar.sql";
const MIG_0068 = "drizzle/0068_development_os_stage_5_h_2_baseline.sql";
const MIG_0069 = "drizzle/0069_development_os_stage_5_h_3_resources.sql";

const MON_FRI: WorkingCalendar = {
  workingDaysOfWeek: [1, 2, 3, 4, 5],
  workingHoursPerDay: 8,
  holidays: [],
};

const MON_SAT: WorkingCalendar = {
  workingDaysOfWeek: [1, 2, 3, 4, 5, 6],
  workingHoursPerDay: 8,
  holidays: [],
};

function utc(yyyy: number, mm: number, dd: number): Date {
  return new Date(Date.UTC(yyyy, mm - 1, dd));
}

// ===========================================================================
// 1) Migration 0067 — calendar shape
// ===========================================================================

test("migration 0067 file exists + wraps in BEGIN/COMMIT", () => {
  assert.ok(exists(MIG_0067));
  const sql = read(MIG_0067);
  assert.match(sql, /^BEGIN;/m);
  assert.match(sql, /^COMMIT;/m);
});

test("migration 0067 creates working_calendars + holiday_calendar", () => {
  const sql = read(MIG_0067);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "working_calendars"/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "holiday_calendar"/);
});

test("migration 0067 scope enum has 3 values", () => {
  const sql = read(MIG_0067);
  for (const s of ["company_wide", "project", "vendor"]) {
    assert.ok(sql.includes(`'${s}'`), `scope '${s}' missing`);
  }
});

test("migration 0067 holiday_type enum has 8 values", () => {
  const sql = read(MIG_0067);
  for (const t of [
    "national_holiday",
    "regional_holiday",
    "religious_observance",
    "company_holiday",
    "project_specific",
    "site_unavailable",
    "weather_closure",
    "other_non_working",
  ]) {
    assert.ok(sql.includes(`'${t}'`), `holiday_type '${t}' missing`);
  }
});

test("migration 0067 enforces XOR scope consistency CHECK", () => {
  const sql = read(MIG_0067);
  assert.match(sql, /scope = 'project' AND project_id IS NOT NULL AND vendor_id IS NULL/);
  assert.match(sql, /scope = 'vendor' AND vendor_id IS NOT NULL AND project_id IS NULL/);
});

test("migration 0067 partial unique index on default company-wide", () => {
  const sql = read(MIG_0067);
  assert.match(
    sql,
    /CREATE UNIQUE INDEX IF NOT EXISTS "working_calendars_default_unique"[\s\S]*?WHERE "is_default" = TRUE AND "scope" = 'company_wide'/,
  );
});

test("migration 0067 holiday_calendar UNIQUE on (calendar_id, holiday_date)", () => {
  const sql = read(MIG_0067);
  assert.match(sql, /UNIQUE \("calendar_id", "holiday_date"\)/);
});

test("migration 0067 seeds COMPANY_DEFAULT + BALI_STANDARD calendars", () => {
  const sql = read(MIG_0067);
  assert.match(sql, /'COMPANY_DEFAULT'/);
  assert.match(sql, /'BALI_STANDARD'/);
});

test("migration 0067 seeds 2026 Indonesian holidays (Independence Day, Idul Fitri)", () => {
  const sql = read(MIG_0067);
  assert.match(sql, /Independence Day/);
  assert.match(sql, /Idul Fitri/);
});

test("migration 0067 seeds Bali-specific holidays (Galungan, Nyepi)", () => {
  const sql = read(MIG_0067);
  assert.match(sql, /Galungan/);
  assert.match(sql, /Nyepi/);
});

test("migration 0067 seed is idempotent (ON CONFLICT)", () => {
  const sql = read(MIG_0067);
  assert.match(sql, /ON CONFLICT \(calendar_code\) DO NOTHING/);
  assert.match(sql, /ON CONFLICT \(calendar_id, holiday_date\) DO NOTHING/);
});

test("migration 0067 RLS internal-only policies", () => {
  const sql = read(MIG_0067);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /is_internal_user\(\)/);
});

// ===========================================================================
// 2) Migration 0068 — baseline shape
// ===========================================================================

test("migration 0068 file exists + wraps in BEGIN/COMMIT", () => {
  assert.ok(exists(MIG_0068));
  const sql = read(MIG_0068);
  assert.match(sql, /^BEGIN;/m);
  assert.match(sql, /^COMMIT;/m);
});

test("migration 0068 creates schedule_baselines + schedule_variances", () => {
  const sql = read(MIG_0068);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "schedule_baselines"/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "schedule_variances"/);
});

test("migration 0068 baseline_data is JSONB NOT NULL (immutable snapshot)", () => {
  const sql = read(MIG_0068);
  assert.match(sql, /"baseline_data" JSONB NOT NULL/);
});

test("migration 0068 partial unique index → one current baseline per project", () => {
  const sql = read(MIG_0068);
  assert.match(
    sql,
    /CREATE UNIQUE INDEX IF NOT EXISTS "schedule_baselines_current_unique"[\s\S]*?WHERE "is_current_baseline" = TRUE/,
  );
});

test("migration 0068 schedule_variances has 3 GENERATED columns", () => {
  const sql = read(MIG_0068);
  assert.match(sql, /"start_variance_days" INTEGER GENERATED ALWAYS AS[\s\S]*?STORED/);
  assert.match(sql, /"finish_variance_days" INTEGER GENERATED ALWAYS AS[\s\S]*?STORED/);
  assert.match(sql, /"duration_variance_days" INTEGER GENERATED ALWAYS AS[\s\S]*?STORED/);
});

test("migration 0068 variance_status enum has 7 values", () => {
  const sql = read(MIG_0068);
  for (const v of [
    "unchanged",
    "ahead_of_schedule",
    "on_schedule",
    "minor_delay",
    "moderate_delay",
    "major_delay",
    "critical_delay",
  ]) {
    assert.ok(sql.includes(`'${v}'`), `variance_status '${v}' missing`);
  }
});

test("migration 0068 schedule_variances UNIQUE on (baseline_id, task_id)", () => {
  const sql = read(MIG_0068);
  assert.match(sql, /UNIQUE \("baseline_id", "task_id"\)/);
});

test("migration 0068 RLS internal-only policies", () => {
  const sql = read(MIG_0068);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
});

// ===========================================================================
// 3) Migration 0069 — resources + productivity shape
// ===========================================================================

test("migration 0069 file exists + wraps in BEGIN/COMMIT", () => {
  assert.ok(exists(MIG_0069));
  const sql = read(MIG_0069);
  assert.match(sql, /^BEGIN;/m);
  assert.match(sql, /^COMMIT;/m);
});

test("migration 0069 creates 3 tables (resource_pools, task_resource_assignments, productivity_logs)", () => {
  const sql = read(MIG_0069);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "resource_pools"/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "task_resource_assignments"/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "productivity_logs"/);
});

test("migration 0069 resource_type enum has 5 values", () => {
  const sql = read(MIG_0069);
  for (const t of [
    "vendor_team",
    "internal_team",
    "individual",
    "equipment",
    "subcontractor",
  ]) {
    assert.ok(sql.includes(`'${t}'`), `resource_type '${t}' missing`);
  }
});

test("migration 0069 task_resource_assignments status enum has 5 values", () => {
  const sql = read(MIG_0069);
  for (const s of [
    "planned",
    "confirmed",
    "in_progress",
    "completed",
    "cancelled",
  ]) {
    assert.ok(sql.includes(`'${s}'`), `assignment status '${s}' missing`);
  }
});

test("migration 0069 productivity_rate is GENERATED STORED", () => {
  const sql = read(MIG_0069);
  assert.match(sql, /"productivity_rate" NUMERIC\(14,6\) GENERATED ALWAYS AS[\s\S]*?STORED/);
});

test("migration 0069 productivity data_source enum has 4 values", () => {
  const sql = read(MIG_0069);
  for (const d of [
    "site_report",
    "manual_entry",
    "attendance_log",
    "mobile_app",
  ]) {
    assert.ok(sql.includes(`'${d}'`), `data_source '${d}' missing`);
  }
});

test("migration 0069 task_resource_assignments period CHECK", () => {
  const sql = read(MIG_0069);
  assert.match(sql, /CHECK \("allocation_end" >= "allocation_start"\)/);
});

test("migration 0069 RLS internal-only policies", () => {
  const sql = read(MIG_0069);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
});

// ===========================================================================
// 4) Schema exports
// ===========================================================================

test("schema/index exports schedule-sophistication", () => {
  const idx = read("src/lib/db/schema/index.ts");
  assert.match(idx, /export \* from "\.\/schedule-sophistication"/);
});

test("schedule-sophistication schema exports all 7 tables", async () => {
  const m = await import("../src/lib/db/schema/schedule-sophistication");
  assert.ok(m.workingCalendars);
  assert.ok(m.holidayCalendar);
  assert.ok(m.scheduleBaselines);
  assert.ok(m.scheduleVariances);
  assert.ok(m.resourcePools);
  assert.ok(m.taskResourceAssignments);
  assert.ok(m.productivityLogs);
});

// ===========================================================================
// 5) calendar-helpers — isWorkingDay
// ===========================================================================

test("isWorkingDay: Monday is working in Mon-Fri", () => {
  assert.equal(isWorkingDay(utc(2026, 1, 5), MON_FRI), true); // Monday
});

test("isWorkingDay: Saturday NOT working in Mon-Fri", () => {
  assert.equal(isWorkingDay(utc(2026, 1, 10), MON_FRI), false); // Saturday
});

test("isWorkingDay: Sunday NOT working in Mon-Sat", () => {
  assert.equal(isWorkingDay(utc(2026, 1, 11), MON_SAT), false); // Sunday
});

test("isWorkingDay: Saturday IS working in Mon-Sat", () => {
  assert.equal(isWorkingDay(utc(2026, 1, 10), MON_SAT), true); // Saturday
});

test("isWorkingDay: holiday on a Monday is non-working", () => {
  const cal: WorkingCalendar = { ...MON_FRI, holidays: [utc(2026, 1, 5)] };
  assert.equal(isWorkingDay(utc(2026, 1, 5), cal), false);
});

// ===========================================================================
// 6) calendar-helpers — countWorkingDays
// ===========================================================================

test("countWorkingDays: full Mon-Fri week → 5", () => {
  assert.equal(countWorkingDays(utc(2026, 1, 5), utc(2026, 1, 11), MON_FRI), 5);
});

test("countWorkingDays: full Mon-Sat week → 6", () => {
  assert.equal(countWorkingDays(utc(2026, 1, 5), utc(2026, 1, 11), MON_SAT), 6);
});

test("countWorkingDays: with 1 holiday → 4 (Mon-Fri)", () => {
  const cal: WorkingCalendar = { ...MON_FRI, holidays: [utc(2026, 1, 7)] };
  assert.equal(countWorkingDays(utc(2026, 1, 5), utc(2026, 1, 11), cal), 4);
});

test("countWorkingDays: end < start returns 0", () => {
  assert.equal(countWorkingDays(utc(2026, 1, 11), utc(2026, 1, 5), MON_FRI), 0);
});

test("countWorkingDays: same day, working → 1", () => {
  assert.equal(countWorkingDays(utc(2026, 1, 5), utc(2026, 1, 5), MON_FRI), 1);
});

test("countWorkingDays: same day, weekend → 0", () => {
  assert.equal(countWorkingDays(utc(2026, 1, 10), utc(2026, 1, 10), MON_FRI), 0);
});

// ===========================================================================
// 7) calendar-helpers — addWorkingDays + nextWorkingDay
// ===========================================================================

test("addWorkingDays: 0 days → returns start (Mon)", () => {
  assert.equal(
    addWorkingDays(utc(2026, 1, 5), 0, MON_FRI).toISOString().slice(0, 10),
    "2026-01-05",
  );
});

test("addWorkingDays: 1 day from Monday → Monday (day 1 = start)", () => {
  assert.equal(
    addWorkingDays(utc(2026, 1, 5), 1, MON_FRI).toISOString().slice(0, 10),
    "2026-01-05",
  );
});

test("addWorkingDays: 5 days from Monday → Friday", () => {
  assert.equal(
    addWorkingDays(utc(2026, 1, 5), 5, MON_FRI).toISOString().slice(0, 10),
    "2026-01-09",
  );
});

test("addWorkingDays: 6 days from Monday in Mon-Fri → next Monday (skip Sat/Sun)", () => {
  assert.equal(
    addWorkingDays(utc(2026, 1, 5), 6, MON_FRI).toISOString().slice(0, 10),
    "2026-01-12",
  );
});

test("addWorkingDays: holiday in path is skipped", () => {
  const cal: WorkingCalendar = { ...MON_FRI, holidays: [utc(2026, 1, 7)] };
  // Mon (1), Tue (2), Wed=hol, Thu (3), Fri (4), Mon (5)
  assert.equal(
    addWorkingDays(utc(2026, 1, 5), 5, cal).toISOString().slice(0, 10),
    "2026-01-12",
  );
});

test("nextWorkingDay: from Friday → next Monday in Mon-Fri", () => {
  assert.equal(
    nextWorkingDay(utc(2026, 1, 9), MON_FRI).toISOString().slice(0, 10),
    "2026-01-12",
  );
});

test("nextWorkingDay: skips holiday", () => {
  const cal: WorkingCalendar = { ...MON_FRI, holidays: [utc(2026, 1, 6)] };
  assert.equal(
    nextWorkingDay(utc(2026, 1, 5), cal).toISOString().slice(0, 10),
    "2026-01-07",
  );
});

// ===========================================================================
// 8) calendar-helpers — workingDaysBetween
// ===========================================================================

test("workingDaysBetween: full week breakdown", () => {
  const r = workingDaysBetween(utc(2026, 1, 5), utc(2026, 1, 11), MON_FRI);
  assert.equal(r.totalDays, 7);
  assert.equal(r.workingDays, 5);
  assert.equal(r.weekendDays, 2);
  assert.equal(r.holidays, 0);
});

test("workingDaysBetween: with 1 holiday on a weekday", () => {
  const cal: WorkingCalendar = { ...MON_FRI, holidays: [utc(2026, 1, 7)] };
  const r = workingDaysBetween(utc(2026, 1, 5), utc(2026, 1, 11), cal);
  assert.equal(r.workingDays, 4);
  assert.equal(r.holidays, 1);
});

test("workingDaysBetween: end < start returns zeros", () => {
  const r = workingDaysBetween(utc(2026, 1, 11), utc(2026, 1, 5), MON_FRI);
  assert.deepEqual(r, { totalDays: 0, workingDays: 0, weekendDays: 0, holidays: 0 });
});

// ===========================================================================
// 9) ORIGINAL critical-path (regression — unchanged)
// ===========================================================================

test("regression: original computeCriticalPath is exported with same signature", () => {
  // Smoke-test single task path.
  const tasks: TaskInput[] = [
    {
      id: "T1",
      plannedStart: utc(2026, 1, 5),
      plannedFinish: utc(2026, 1, 9),
      durationDays: 5,
    },
  ];
  const r = computeCriticalPath(tasks, []);
  assert.equal(r.results.length, 1);
  assert.equal(r.results[0].isOnCriticalPath, true);
});

test("regression: original CPM exports do NOT include calendar fields", () => {
  const tasks: TaskInput[] = [
    {
      id: "T1",
      plannedStart: utc(2026, 1, 5),
      plannedFinish: utc(2026, 1, 9),
      durationDays: 5,
    },
  ];
  const r = computeCriticalPath(tasks, []);
  assert.ok(!("workingDaysDuration" in r));
  assert.ok(!("calendar" in r));
});

// ===========================================================================
// 10) Calendar-aware CPM variant
// ===========================================================================

test("CPM with calendar: returns workingDaysDuration", () => {
  const tasks: TaskInput[] = [
    {
      id: "T1",
      plannedStart: utc(2026, 1, 5),
      plannedFinish: utc(2026, 1, 11),
      durationDays: 7,
    },
  ];
  const r = computeCriticalPathWithCalendar(tasks, [], MON_FRI);
  assert.equal(r.workingDaysDuration, 5);
});

test("CPM with calendar: empty deps + same dates with Mon-Sat → 6 working days", () => {
  const tasks: TaskInput[] = [
    {
      id: "T1",
      plannedStart: utc(2026, 1, 5),
      plannedFinish: utc(2026, 1, 11),
      durationDays: 7,
    },
  ];
  const r = computeCriticalPathWithCalendar(tasks, [], MON_SAT);
  assert.equal(r.workingDaysDuration, 6);
});

test("CPM with calendar: cycles still detected (delegates to original)", () => {
  const tasks: TaskInput[] = [
    {
      id: "T1",
      plannedStart: utc(2026, 1, 5),
      plannedFinish: utc(2026, 1, 9),
      durationDays: 5,
    },
    {
      id: "T2",
      plannedStart: utc(2026, 1, 5),
      plannedFinish: utc(2026, 1, 9),
      durationDays: 5,
    },
  ];
  const deps: DependencyInput[] = [
    { predecessorId: "T1", successorId: "T2", type: "finish_to_start", lagDays: 0 },
    { predecessorId: "T2", successorId: "T1", type: "finish_to_start", lagDays: 0 },
  ];
  const r = computeCriticalPathWithCalendar(tasks, deps, MON_FRI);
  assert.ok(r.detectedCycles.length > 0);
});

// ===========================================================================
// 11) variance-helpers — classifyVariance
// ===========================================================================

test("classifyVariance: -1 day → ahead_of_schedule", () => {
  assert.equal(classifyVariance(-1).status, "ahead_of_schedule");
});

test("classifyVariance: 0 → on_schedule", () => {
  assert.equal(classifyVariance(0).status, "on_schedule");
});

test("classifyVariance: 3 → minor_delay", () => {
  assert.equal(classifyVariance(3).status, "minor_delay");
});

test("classifyVariance: 4 → moderate_delay", () => {
  assert.equal(classifyVariance(4).status, "moderate_delay");
});

test("classifyVariance: 8 → major_delay", () => {
  assert.equal(classifyVariance(8).status, "major_delay");
});

test("classifyVariance: 15 → critical_delay", () => {
  assert.equal(classifyVariance(15).status, "critical_delay");
});

test("classifyVariance: severity escalates with status", () => {
  assert.equal(classifyVariance(15).severity, "critical");
  assert.equal(classifyVariance(8).severity, "high");
  assert.equal(classifyVariance(4).severity, "medium");
});

// ===========================================================================
// 12) variance-helpers — computeProjectScheduleHealth
// ===========================================================================

test("project health: empty → on_track + SPI 1", () => {
  const r = computeProjectScheduleHealth({ totalTasks: 0, taskVariances: [] });
  assert.equal(r.overallHealth, "on_track");
  assert.equal(r.schedulePerformanceIndex, 1);
});

test("project health: critical-path slip 15+ → severely_delayed", () => {
  const r = computeProjectScheduleHealth({
    totalTasks: 5,
    taskVariances: [
      { isCriticalPath: true, finishVarianceDays: 20, status: "critical_delay" },
      { isCriticalPath: false, finishVarianceDays: 0, status: "on_schedule" },
    ],
  });
  assert.equal(r.overallHealth, "severely_delayed");
  assert.equal(r.criticalPathSlippage, 20);
});

test("project health: moderate critical slip → at_risk", () => {
  const r = computeProjectScheduleHealth({
    totalTasks: 5,
    taskVariances: [
      { isCriticalPath: true, finishVarianceDays: 10, status: "major_delay" },
    ],
  });
  assert.equal(r.overallHealth, "at_risk");
});

test("project health: 30%+ delayed → minor_concerns", () => {
  const r = computeProjectScheduleHealth({
    totalTasks: 10,
    taskVariances: [
      { isCriticalPath: false, finishVarianceDays: 1, status: "minor_delay" },
      { isCriticalPath: false, finishVarianceDays: 1, status: "minor_delay" },
      { isCriticalPath: false, finishVarianceDays: 1, status: "minor_delay" },
      { isCriticalPath: false, finishVarianceDays: 1, status: "minor_delay" },
    ],
  });
  assert.equal(r.overallHealth, "minor_concerns");
});

test("project health: SPI clamped to [0, 1.5]", () => {
  const r = computeProjectScheduleHealth({
    totalTasks: 1,
    taskVariances: [
      { isCriticalPath: true, finishVarianceDays: 100, status: "critical_delay" },
    ],
  });
  assert.ok(r.schedulePerformanceIndex >= 0);
  assert.ok(r.schedulePerformanceIndex <= 1.5);
});

test("project health: averageDelayDays correct", () => {
  const r = computeProjectScheduleHealth({
    totalTasks: 3,
    taskVariances: [
      { isCriticalPath: true, finishVarianceDays: 4, status: "moderate_delay" },
      { isCriticalPath: false, finishVarianceDays: 8, status: "major_delay" },
      { isCriticalPath: false, finishVarianceDays: 0, status: "on_schedule" },
    ],
  });
  assert.equal(r.averageDelayDays, 6);
});

// ===========================================================================
// 13) variance-helpers — detectScheduleSlipPattern
// ===========================================================================

test("slip pattern: empty → stable + 0 forecast", () => {
  const r = detectScheduleSlipPattern([]);
  assert.equal(r.trendDirection, "stable");
  assert.equal(r.forecastFinishDelay, 0);
});

test("slip pattern: improving (decreasing slippage)", () => {
  const r = detectScheduleSlipPattern([
    { computedAt: utc(2026, 1, 5), criticalPathSlippage: 20 },
    { computedAt: utc(2026, 1, 19), criticalPathSlippage: 5 },
  ]);
  assert.equal(r.trendDirection, "improving");
});

test("slip pattern: worsening (increasing slippage)", () => {
  const r = detectScheduleSlipPattern([
    { computedAt: utc(2026, 1, 5), criticalPathSlippage: 0 },
    { computedAt: utc(2026, 1, 19), criticalPathSlippage: 14 },
  ]);
  assert.equal(r.trendDirection, "worsening");
});

test("slip pattern: stable (small changes)", () => {
  const r = detectScheduleSlipPattern([
    { computedAt: utc(2026, 1, 5), criticalPathSlippage: 5 },
    { computedAt: utc(2026, 1, 12), criticalPathSlippage: 5 },
  ]);
  assert.equal(r.trendDirection, "stable");
});

// ===========================================================================
// 14) resource-leveling-helpers — detectOverAllocations
// ===========================================================================

test("detectOverAllocations: empty resources → empty result", () => {
  const r = detectOverAllocations([], { start: utc(2026, 1, 5), end: utc(2026, 1, 12) });
  assert.equal(r.overAllocatedResources.length, 0);
  assert.equal(r.totalConflictDays, 0);
});

test("detectOverAllocations: within capacity → no conflict", () => {
  const allocations: ResourceAllocation[] = [
    {
      resourceId: "R1",
      totalDailyCapacity: 8,
      taskAllocations: [
        {
          taskId: "T1",
          isCriticalPath: false,
          allocatedPerDay: 4,
          startDate: utc(2026, 1, 5),
          endDate: utc(2026, 1, 9),
        },
        {
          taskId: "T2",
          isCriticalPath: false,
          allocatedPerDay: 4,
          startDate: utc(2026, 1, 5),
          endDate: utc(2026, 1, 9),
        },
      ],
    },
  ];
  const r = detectOverAllocations(allocations, {
    start: utc(2026, 1, 5),
    end: utc(2026, 1, 12),
  });
  assert.equal(r.overAllocatedResources.length, 0);
});

test("detectOverAllocations: 9h on 8h capacity → conflict day(s) flagged", () => {
  const allocations: ResourceAllocation[] = [
    {
      resourceId: "R1",
      totalDailyCapacity: 8,
      taskAllocations: [
        {
          taskId: "T1",
          isCriticalPath: true,
          allocatedPerDay: 5,
          startDate: utc(2026, 1, 5),
          endDate: utc(2026, 1, 7),
        },
        {
          taskId: "T2",
          isCriticalPath: false,
          allocatedPerDay: 4,
          startDate: utc(2026, 1, 5),
          endDate: utc(2026, 1, 7),
        },
      ],
    },
  ];
  const r = detectOverAllocations(allocations, {
    start: utc(2026, 1, 5),
    end: utc(2026, 1, 7),
  });
  assert.equal(r.overAllocatedResources.length, 1);
  assert.equal(r.totalConflictDays, 3);
  assert.equal(r.overAllocatedResources[0].overAllocatedDays[0].conflicts.length, 2);
});

test("detectOverAllocations: end < start → zero conflicts", () => {
  const r = detectOverAllocations(
    [
      {
        resourceId: "R",
        totalDailyCapacity: 1,
        taskAllocations: [
          {
            taskId: "T",
            isCriticalPath: false,
            allocatedPerDay: 100,
            startDate: utc(2026, 1, 5),
            endDate: utc(2026, 1, 5),
          },
        ],
      },
    ],
    { start: utc(2026, 1, 10), end: utc(2026, 1, 5) },
  );
  assert.equal(r.totalConflictDays, 0);
});

// ===========================================================================
// 15) resource-leveling-helpers — suggestLevelingActions
// ===========================================================================

test("suggestLevelingActions: empty conflicts → empty", () => {
  const r = suggestLevelingActions({ conflicts: [], preserveCriticalPath: true });
  assert.equal(r.length, 0);
});

test("suggestLevelingActions: prefers delaying non-critical with float", () => {
  const r = suggestLevelingActions({
    conflicts: [
      {
        date: utc(2026, 1, 5),
        conflictingTasks: [
          { taskId: "TC", isCriticalPath: true, floatDays: 0 },
          { taskId: "TN", isCriticalPath: false, floatDays: 5 },
        ],
      },
    ],
    preserveCriticalPath: true,
  });
  assert.equal(r[0].action, "delay_task");
  assert.equal(r[0].taskId, "TN");
  assert.equal(r[0].impactOnCriticalPath, "none");
});

test("suggestLevelingActions: reassigns when no float on non-critical", () => {
  const r = suggestLevelingActions({
    conflicts: [
      {
        date: utc(2026, 1, 5),
        conflictingTasks: [
          { taskId: "TC", isCriticalPath: true, floatDays: 0 },
          { taskId: "TN", isCriticalPath: false, floatDays: 0 },
        ],
      },
    ],
    preserveCriticalPath: true,
  });
  assert.equal(r[0].action, "reassign_resource");
  assert.equal(r[0].impactOnCriticalPath, "none");
});

test("suggestLevelingActions: all critical + preserveCriticalPath → add_resource", () => {
  const r = suggestLevelingActions({
    conflicts: [
      {
        date: utc(2026, 1, 5),
        conflictingTasks: [
          { taskId: "T1", isCriticalPath: true, floatDays: 0 },
          { taskId: "T2", isCriticalPath: true, floatDays: 0 },
        ],
      },
    ],
    preserveCriticalPath: true,
  });
  assert.equal(r[0].action, "add_resource");
  assert.equal(r[0].impactOnCriticalPath, "none");
});

test("suggestLevelingActions: all critical + NOT preserve → delay_task with shift impact", () => {
  const r = suggestLevelingActions({
    conflicts: [
      {
        date: utc(2026, 1, 5),
        conflictingTasks: [
          { taskId: "T1", isCriticalPath: true, floatDays: 0 },
          { taskId: "T2", isCriticalPath: true, floatDays: 0 },
        ],
      },
    ],
    preserveCriticalPath: false,
  });
  assert.equal(r[0].action, "delay_task");
  assert.equal(r[0].impactOnCriticalPath, "shift");
});

test("suggestLevelingActions: skips conflicts with < 2 tasks", () => {
  const r = suggestLevelingActions({
    conflicts: [
      {
        date: utc(2026, 1, 5),
        conflictingTasks: [{ taskId: "T1", isCriticalPath: false, floatDays: 0 }],
      },
    ],
    preserveCriticalPath: true,
  });
  assert.equal(r.length, 0);
});

// ===========================================================================
// 16) productivity-helpers
// ===========================================================================

test("computeProductivityRate: 8h, 4 m3 → 0.5 m3/h", () => {
  const r = computeProductivityRate({
    actualHours: 8,
    quantityCompleted: 4,
    unit: "m3",
  });
  assert.equal(r.rate, 0.5);
  assert.equal(r.unit, "m3");
});

test("computeProductivityRate: 0 actual hours → rate 0", () => {
  const r = computeProductivityRate({
    actualHours: 0,
    quantityCompleted: 4,
    unit: "m3",
  });
  assert.equal(r.rate, 0);
});

test("computeProductivityRate: throws on non-finite", () => {
  assert.throws(() =>
    computeProductivityRate({
      actualHours: NaN,
      quantityCompleted: 4,
      unit: "m3",
    }),
  );
});

test("compareToBenchmark: 5%+ above → above_benchmark", () => {
  const r = compareToBenchmark({
    actualRate: 1.1,
    benchmarkRate: 1,
    trade: "concrete",
  });
  assert.equal(r.performance, "above_benchmark");
});

test("compareToBenchmark: within ±5% → on_benchmark", () => {
  const r = compareToBenchmark({
    actualRate: 1.02,
    benchmarkRate: 1,
    trade: "concrete",
  });
  assert.equal(r.performance, "on_benchmark");
});

test("compareToBenchmark: -10% → below_benchmark", () => {
  const r = compareToBenchmark({
    actualRate: 0.9,
    benchmarkRate: 1,
    trade: "concrete",
  });
  assert.equal(r.performance, "below_benchmark");
});

test("compareToBenchmark: -30% → critically_below", () => {
  const r = compareToBenchmark({
    actualRate: 0.7,
    benchmarkRate: 1,
    trade: "concrete",
  });
  assert.equal(r.performance, "critically_below");
});

test("compareToBenchmark: zero benchmark → on_benchmark", () => {
  const r = compareToBenchmark({
    actualRate: 1,
    benchmarkRate: 0,
    trade: "concrete",
  });
  assert.equal(r.performance, "on_benchmark");
});

test("aggregateProductivityByTrade: sums hours + quantity per trade", () => {
  const r = aggregateProductivityByTrade([
    { trade: "concrete", actualHours: 8, quantityCompleted: 4, unit: "m3" },
    { trade: "concrete", actualHours: 4, quantityCompleted: 2, unit: "m3" },
    { trade: "tiling", actualHours: 6, quantityCompleted: 30, unit: "m2" },
  ]);
  const concrete = r.find((t) => t.trade === "concrete")!;
  const tiling = r.find((t) => t.trade === "tiling")!;
  assert.equal(concrete.totalHours, 12);
  assert.equal(concrete.totalQuantity, 6);
  assert.equal(concrete.averageRate, 0.5);
  assert.equal(tiling.averageRate, 5);
});

test("aggregateProductivityByTrade: sorts by total hours desc", () => {
  const r = aggregateProductivityByTrade([
    { trade: "small", actualHours: 1, quantityCompleted: 1, unit: "u" },
    { trade: "big", actualHours: 100, quantityCompleted: 50, unit: "u" },
  ]);
  assert.equal(r[0].trade, "big");
});

test("aggregateProductivityByTrade: ignores non-finite entries", () => {
  const r = aggregateProductivityByTrade([
    { trade: "x", actualHours: NaN, quantityCompleted: 1, unit: "u" },
    { trade: "y", actualHours: 1, quantityCompleted: 1, unit: "u" },
  ]);
  assert.equal(r.find((t) => t.trade === "x"), undefined);
  assert.ok(r.find((t) => t.trade === "y"));
});

// ===========================================================================
// 17) Cron + dispatcher + route audit
// ===========================================================================

test("cron index re-exports 3 new Stage 5.H runners", () => {
  const idx = read("src/lib/development/server/cron/index.ts");
  assert.match(idx, /runDevOsBaselineVarianceRecompute/);
  assert.match(idx, /runDevOsResourceConflictDetector/);
  assert.match(idx, /runDevOsProductivityAggregation/);
});

test("cron index DEV_OS_JOB_KEYS includes 3 new keys", () => {
  const idx = read("src/lib/development/server/cron/index.ts");
  for (const k of [
    "dev_os_baseline_variance_recompute",
    "dev_os_resource_conflict_detector",
    "dev_os_productivity_aggregation",
  ]) {
    assert.ok(idx.includes(`"${k}"`), `key '${k}' missing`);
  }
});

test("dispatcher KNOWN_JOBS includes 3 new keys", () => {
  const src = read("src/features/jobs/actions.ts");
  for (const k of [
    "dev_os_baseline_variance_recompute",
    "dev_os_resource_conflict_detector",
    "dev_os_productivity_aggregation",
  ]) {
    assert.ok(src.includes(`"${k}"`), `KNOWN_JOBS missing '${k}'`);
  }
});

test("dispatcher executeJob switch covers 3 new keys", () => {
  const src = read("src/features/jobs/actions.ts");
  assert.match(src, /case "dev_os_baseline_variance_recompute":/);
  assert.match(src, /case "dev_os_resource_conflict_detector":/);
  assert.match(src, /case "dev_os_productivity_aggregation":/);
});

test("3 new HTTP cron route files exist", () => {
  for (const slug of [
    "dev-os-baseline-variance-recompute",
    "dev-os-resource-conflict-detector",
    "dev-os-productivity-aggregation",
  ]) {
    assert.ok(
      exists(`src/app/api/cron/${slug}/route.ts`),
      `route file missing for ${slug}`,
    );
  }
});

test("VERCEL-CRON-CHECKLIST documents 3 new routes", () => {
  const md = read("docs/VERCEL-CRON-CHECKLIST.md");
  assert.match(md, /\/api\/cron\/dev-os-baseline-variance-recompute/);
  assert.match(md, /\/api\/cron\/dev-os-resource-conflict-detector/);
  assert.match(md, /\/api\/cron\/dev-os-productivity-aggregation/);
});

// ===========================================================================
// 18) Server module presence
// ===========================================================================

test("calendar-helpers is pure (no server-only)", () => {
  const src = read("src/lib/development/server/calendar/calendar-helpers.ts");
  assert.doesNotMatch(src, /^(import "server-only"|"use server")/m);
});

test("variance-helpers is pure (no server-only)", () => {
  const src = read("src/lib/development/server/schedule/variance-helpers.ts");
  assert.doesNotMatch(src, /^(import "server-only"|"use server")/m);
});

test("resource-leveling-helpers is pure (no server-only)", () => {
  const src = read("src/lib/development/server/schedule/resource-leveling-helpers.ts");
  assert.doesNotMatch(src, /^(import "server-only"|"use server")/m);
});

test("productivity-helpers is pure (no server-only)", () => {
  const src = read("src/lib/development/server/productivity/productivity-helpers.ts");
  assert.doesNotMatch(src, /^(import "server-only"|"use server")/m);
});

test("calendar-aware CPM variant is pure (delegates to original)", () => {
  const src = read(
    "src/lib/development/server/schedule/critical-path-calendar-helpers.ts",
  );
  assert.doesNotMatch(src, /^(import "server-only"|"use server")/m);
  assert.match(src, /import \{[\s\S]*computeCriticalPath[\s\S]*\}/);
});

test("baseline-actions wraps creation in transaction", () => {
  const src = read("src/lib/development/server/schedule/baseline-actions.ts");
  assert.match(src, /\.transaction\(/);
});

// ===========================================================================
// 19) Sidebar + UI page presence
// ===========================================================================

test("sidebar nav has Calendars + Resources + Productivity entries", () => {
  const src = read("src/lib/development/navigation.ts");
  assert.match(src, /\/schedule\/calendars/);
  assert.match(src, /\/schedule\/resources/);
  assert.match(src, /\/productivity/);
});

test("sidebar surfaces Stage 5.H schedule routes (badges removed in Stage 10.B-CLEANUP)", () => {
  // Stage 10.B-CLEANUP intentionally stripped per-link `badge: "5.H"`
  // props from navigation.ts. Verify the new schedule-stack routes are
  // still present in the nav tree by URL match.
  const src = read("src/lib/development/navigation.ts");
  for (const route of [
    "schedule/calendars",
    "schedule/resources",
    "productivity",
  ]) {
    assert.ok(src.includes(route), `expected nav entry for ${route}`);
  }
});

test("calendars list + detail + new pages exist", () => {
  for (const path of ["page.tsx", "[code]/page.tsx", "new/page.tsx"]) {
    assert.ok(
      exists(`src/app/(development-app)/development-os/schedule/calendars/${path}`),
      `calendars/${path} missing`,
    );
  }
});

test("resources list + detail + new pages exist", () => {
  for (const path of ["page.tsx", "[code]/page.tsx", "new/page.tsx"]) {
    assert.ok(
      exists(`src/app/(development-app)/development-os/schedule/resources/${path}`),
      `resources/${path} missing`,
    );
  }
});

test("productivity list + log entry pages exist", () => {
  for (const path of ["page.tsx", "log/page.tsx"]) {
    assert.ok(
      exists(`src/app/(development-app)/development-os/productivity/${path}`),
      `productivity/${path} missing`,
    );
  }
});

// ===========================================================================
// 20) Demo seed audit
// ===========================================================================

test("seed script declares Stage 5.H section header", () => {
  const seed = read("scripts/seed-dev-os.mjs");
  assert.match(seed, /Stage 5\.H seeding/);
});

test("seed script seeds baselines + resource pools + productivity logs", () => {
  const seed = read("scripts/seed-dev-os.mjs");
  assert.match(seed, /INSERT INTO schedule_baselines/);
  assert.match(seed, /INSERT INTO resource_pools/);
  assert.match(seed, /INSERT INTO productivity_logs/);
});

test("seed script idempotent — exists-check pattern present in 5.H section", () => {
  const seed = read("scripts/seed-dev-os.mjs");
  assert.match(seed, /Stage 5\.H seeding[\s\S]*?if \(exists\[0\]\)/);
});

// ===========================================================================
// 21) Architecture documentation
// ===========================================================================

test("architecture doc references Stage 5.H", () => {
  const md = read("docs/development-os-architecture.md");
  assert.match(md, /Stage 5\.H/);
});

test("architecture doc Stage 5.F accepted", () => {
  const md = read("docs/development-os-architecture.md");
  assert.match(md, /Stage 5\.F[\s\S]*?\[(?:ACTIVE|ACCEPTED) 5\.F\]/);
});

test("architecture doc Stage 5.G marked SKIPPED", () => {
  const md = read("docs/development-os-architecture.md");
  assert.match(md, /Stage 5\.G[\s\S]*?SKIPPED/);
});

test("architecture doc Stage 5.H active", () => {
  const md = read("docs/development-os-architecture.md");
  assert.match(md, /Stage 5\.H[\s\S]*?\[(?:ACTIVE|ACCEPTED) 5\.H\]/);
});

test("architecture doc explains original CPM helper unchanged", () => {
  const md = read("docs/development-os-architecture.md");
  assert.match(md, /unchanged/i);
  assert.match(md, /computeCriticalPath/);
});

test("architecture doc names leveling-suggestions-only invariant", () => {
  const md = read("docs/development-os-architecture.md");
  assert.match(md, /Suggestions only|HITL/i);
});
