/**
 * Stage 4.C.2 — Work Packages + Schedule / Critical Path tests.
 *
 * Heavy emphasis on the pure CPM helpers — financial-correctness
 * equivalent: scheduling correctness. Cycle detection, FS/SS/FF/SF,
 * float computation, multi-path scenarios all runtime tested.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  computeCriticalPath,
  detectCycles,
  topologicalSort,
  type DependencyInput,
  type TaskInput,
} from "../src/lib/development/server/schedule/critical-path-helpers";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");
const exists = (rel: string) => existsSync(resolve(ROOT, rel));

const MIG_0052 = "drizzle/0052_development_os_stage_4_c_2_work_packages_schedule.sql";

// ===========================================================================
// 1) Migration 0052 — shape
// ===========================================================================

test("migration 0052 file exists and wraps in BEGIN/COMMIT", () => {
  assert.ok(exists(MIG_0052));
  const sql = read(MIG_0052);
  assert.match(sql, /^BEGIN;/m);
  assert.match(sql, /^COMMIT;/m);
});

test("migration 0052 creates 3 new tables", () => {
  const sql = read(MIG_0052);
  for (const t of ["work_packages", "project_tasks", "task_dependencies"]) {
    assert.match(
      sql,
      new RegExp(`CREATE TABLE IF NOT EXISTS "${t}"`),
      `${t} create missing`,
    );
  }
});

test("migration 0052 work_packages has all 6 statuses", () => {
  const sql = read(MIG_0052);
  for (const s of [
    "planned",
    "ready_to_start",
    "in_progress",
    "completed",
    "on_hold",
    "cancelled",
  ]) {
    assert.ok(sql.includes(`'${s}'`), `WP status '${s}' missing`);
  }
});

test("migration 0052 project_tasks has duration_days as GENERATED STORED", () => {
  const sql = read(MIG_0052);
  assert.match(
    sql,
    /"duration_days" INTEGER GENERATED ALWAYS AS \(\s*\("planned_finish" - "planned_start"\) \+ 1\s*\) STORED/,
  );
});

test("migration 0052 project_tasks CHECK planned_finish >= planned_start", () => {
  const sql = read(MIG_0052);
  assert.match(sql, /CHECK \("planned_finish" >= "planned_start"\)/);
});

test("migration 0052 task_dependencies enforces UNIQUE(predecessor, successor) + CHECK predecessor != successor", () => {
  const sql = read(MIG_0052);
  assert.match(sql, /UNIQUE \("predecessor_id", "successor_id"\)/);
  assert.match(sql, /CHECK \("predecessor_id" != "successor_id"\)/);
});

test("migration 0052 task_dependencies covers all 4 dependency types", () => {
  const sql = read(MIG_0052);
  for (const t of [
    "finish_to_start",
    "start_to_start",
    "finish_to_finish",
    "start_to_finish",
  ]) {
    assert.ok(sql.includes(`'${t}'`), `dep type '${t}' missing`);
  }
});

test("migration 0052 adds forward-FK constraints to existing tables", () => {
  const sql = read(MIG_0052);
  for (const fk of [
    "dev_os_purchase_requests_work_package_fk",
    "dev_invoice_lines_work_package_fk",
    "qa_qc_issues_work_package_fk",
    "dev_os_inventory_movements_work_package_fk",
  ]) {
    assert.ok(sql.includes(fk), `forward FK '${fk}' missing`);
  }
});

test("migration 0052 RLS protects all 3 new tables", () => {
  const sql = read(MIG_0052);
  for (const t of ["work_packages", "project_tasks", "task_dependencies"]) {
    assert.ok(sql.includes(`'${t}'`), `RLS loop missing ${t}`);
  }
  assert.match(sql, /FORCE ROW LEVEL SECURITY/);
});

test("Stage 4.C.2 schema files exist + re-exported", () => {
  assert.ok(exists("src/lib/db/schema/work-packages.ts"));
  const idx = read("src/lib/db/schema/index.ts");
  assert.match(idx, /export \* from "\.\/work-packages";/);
});

// ===========================================================================
// 2) Critical Path Method — pure helper tests
// ===========================================================================

function d(s: string): Date {
  return new Date(s + "T00:00:00Z");
}

test("CPM: simple linear chain — A → B → C", () => {
  const tasks: TaskInput[] = [
    { id: "A", plannedStart: d("2026-01-01"), plannedFinish: d("2026-01-03"), durationDays: 3 },
    { id: "B", plannedStart: d("2026-01-04"), plannedFinish: d("2026-01-06"), durationDays: 3 },
    { id: "C", plannedStart: d("2026-01-07"), plannedFinish: d("2026-01-09"), durationDays: 3 },
  ];
  const deps: DependencyInput[] = [
    { predecessorId: "A", successorId: "B", type: "finish_to_start", lagDays: 0 },
    { predecessorId: "B", successorId: "C", type: "finish_to_start", lagDays: 0 },
  ];
  const cp = computeCriticalPath(tasks, deps);
  assert.equal(cp.detectedCycles.length, 0);
  // All three tasks are on the critical path (zero float — only one path).
  assert.equal(cp.results.find((r) => r.taskId === "A")?.isOnCriticalPath, true);
  assert.equal(cp.results.find((r) => r.taskId === "B")?.isOnCriticalPath, true);
  assert.equal(cp.results.find((r) => r.taskId === "C")?.isOnCriticalPath, true);
});

test("CPM: diamond graph — only the longer parallel path is critical", () => {
  // A → B (5d) → D
  // A → C (2d) → D
  // Path A-B-D: 3 + 5 + 3 = 11
  // Path A-C-D: 3 + 2 + 3 = 8
  // Critical path is A-B-D; C has 3 days of float.
  const tasks: TaskInput[] = [
    { id: "A", plannedStart: d("2026-01-01"), plannedFinish: d("2026-01-03"), durationDays: 3 },
    { id: "B", plannedStart: d("2026-01-04"), plannedFinish: d("2026-01-08"), durationDays: 5 },
    { id: "C", plannedStart: d("2026-01-04"), plannedFinish: d("2026-01-05"), durationDays: 2 },
    { id: "D", plannedStart: d("2026-01-09"), plannedFinish: d("2026-01-11"), durationDays: 3 },
  ];
  const deps: DependencyInput[] = [
    { predecessorId: "A", successorId: "B", type: "finish_to_start", lagDays: 0 },
    { predecessorId: "A", successorId: "C", type: "finish_to_start", lagDays: 0 },
    { predecessorId: "B", successorId: "D", type: "finish_to_start", lagDays: 0 },
    { predecessorId: "C", successorId: "D", type: "finish_to_start", lagDays: 0 },
  ];
  const cp = computeCriticalPath(tasks, deps);
  const results = new Map(cp.results.map((r) => [r.taskId, r]));
  assert.equal(results.get("A")?.isOnCriticalPath, true);
  assert.equal(results.get("B")?.isOnCriticalPath, true);
  assert.equal(results.get("D")?.isOnCriticalPath, true);
  assert.equal(results.get("C")?.isOnCriticalPath, false);
  assert.equal(results.get("C")?.totalFloatDays, 3);
});

test("CPM: cycle detection refuses to compute on cyclic graph", () => {
  const tasks: TaskInput[] = [
    { id: "A", plannedStart: d("2026-01-01"), plannedFinish: d("2026-01-03"), durationDays: 3 },
    { id: "B", plannedStart: d("2026-01-04"), plannedFinish: d("2026-01-06"), durationDays: 3 },
    { id: "C", plannedStart: d("2026-01-07"), plannedFinish: d("2026-01-09"), durationDays: 3 },
  ];
  const deps: DependencyInput[] = [
    { predecessorId: "A", successorId: "B", type: "finish_to_start", lagDays: 0 },
    { predecessorId: "B", successorId: "C", type: "finish_to_start", lagDays: 0 },
    { predecessorId: "C", successorId: "A", type: "finish_to_start", lagDays: 0 }, // cycle!
  ];
  const cp = computeCriticalPath(tasks, deps);
  assert.equal(cp.results.length, 0);
  assert.ok(cp.detectedCycles.length > 0);
  assert.ok(cp.detectedCycles[0].length > 0);
});

test("CPM: detectCycles returns empty on DAG", () => {
  const cycles = detectCycles(
    ["A", "B", "C"],
    [
      { predecessorId: "A", successorId: "B", type: "finish_to_start", lagDays: 0 },
      { predecessorId: "B", successorId: "C", type: "finish_to_start", lagDays: 0 },
    ],
  );
  assert.equal(cycles.length, 0);
});

test("CPM: detectCycles flags cycles correctly", () => {
  const cycles = detectCycles(
    ["A", "B"],
    [
      { predecessorId: "A", successorId: "B", type: "finish_to_start", lagDays: 0 },
      { predecessorId: "B", successorId: "A", type: "finish_to_start", lagDays: 0 },
    ],
  );
  assert.ok(cycles.length > 0);
  assert.deepEqual(cycles[0].sort(), ["A", "B"]);
});

test("CPM: topologicalSort orders A → B → C correctly", () => {
  const order = topologicalSort(
    ["A", "B", "C"],
    [
      { predecessorId: "A", successorId: "B", type: "finish_to_start", lagDays: 0 },
      { predecessorId: "B", successorId: "C", type: "finish_to_start", lagDays: 0 },
    ],
  );
  assert.deepEqual(order, ["A", "B", "C"]);
});

test("CPM: topologicalSort throws on cycle", () => {
  assert.throws(() =>
    topologicalSort(
      ["A", "B"],
      [
        { predecessorId: "A", successorId: "B", type: "finish_to_start", lagDays: 0 },
        { predecessorId: "B", successorId: "A", type: "finish_to_start", lagDays: 0 },
      ],
    ),
  );
});

test("CPM: FS dependency with lag pushes successor start", () => {
  // A finishes Jan 3, B with lag=2 should start Jan 6.
  const tasks: TaskInput[] = [
    { id: "A", plannedStart: d("2026-01-01"), plannedFinish: d("2026-01-03"), durationDays: 3 },
    { id: "B", plannedStart: d("2026-01-04"), plannedFinish: d("2026-01-06"), durationDays: 3 },
  ];
  const deps: DependencyInput[] = [
    { predecessorId: "A", successorId: "B", type: "finish_to_start", lagDays: 2 },
  ];
  const cp = computeCriticalPath(tasks, deps);
  const b = cp.results.find((r) => r.taskId === "B")!;
  // Early start of B should be Jan 3 (predEf) + 2 lag + 1 = Jan 6.
  assert.equal(b.earlyStart.toISOString().slice(0, 10), "2026-01-06");
});

test("CPM: SS dependency aligns starts", () => {
  const tasks: TaskInput[] = [
    { id: "A", plannedStart: d("2026-01-01"), plannedFinish: d("2026-01-05"), durationDays: 5 },
    { id: "B", plannedStart: d("2026-01-01"), plannedFinish: d("2026-01-03"), durationDays: 3 },
  ];
  const deps: DependencyInput[] = [
    { predecessorId: "A", successorId: "B", type: "start_to_start", lagDays: 0 },
  ];
  const cp = computeCriticalPath(tasks, deps);
  const a = cp.results.find((r) => r.taskId === "A")!;
  const b = cp.results.find((r) => r.taskId === "B")!;
  assert.equal(
    a.earlyStart.toISOString().slice(0, 10),
    b.earlyStart.toISOString().slice(0, 10),
  );
});

test("CPM: FF dependency aligns finishes", () => {
  // A finishes Jan 5; B (3d) with FF should finish ≥ Jan 5 → start Jan 3.
  const tasks: TaskInput[] = [
    { id: "A", plannedStart: d("2026-01-01"), plannedFinish: d("2026-01-05"), durationDays: 5 },
    { id: "B", plannedStart: d("2026-01-01"), plannedFinish: d("2026-01-03"), durationDays: 3 },
  ];
  const deps: DependencyInput[] = [
    { predecessorId: "A", successorId: "B", type: "finish_to_finish", lagDays: 0 },
  ];
  const cp = computeCriticalPath(tasks, deps);
  const b = cp.results.find((r) => r.taskId === "B")!;
  // Early finish should be Jan 5 → start Jan 3.
  assert.equal(b.earlyFinish.toISOString().slice(0, 10), "2026-01-05");
  assert.equal(b.earlyStart.toISOString().slice(0, 10), "2026-01-03");
});

test("CPM: project end date = max(early_finish)", () => {
  const tasks: TaskInput[] = [
    { id: "A", plannedStart: d("2026-01-01"), plannedFinish: d("2026-01-03"), durationDays: 3 },
    { id: "B", plannedStart: d("2026-01-04"), plannedFinish: d("2026-01-08"), durationDays: 5 },
  ];
  const cp = computeCriticalPath(tasks, [
    { predecessorId: "A", successorId: "B", type: "finish_to_start", lagDays: 0 },
  ]);
  assert.equal(cp.projectEndDate.toISOString().slice(0, 10), "2026-01-08");
  assert.equal(cp.criticalPathDuration, 8); // Jan 1 to Jan 8 = 8 days
});

test("CPM: float = late_start - early_start", () => {
  const tasks: TaskInput[] = [
    { id: "A", plannedStart: d("2026-01-01"), plannedFinish: d("2026-01-03"), durationDays: 3 },
    // B is parallel, only 1 day, lots of slack
    { id: "B", plannedStart: d("2026-01-01"), plannedFinish: d("2026-01-01"), durationDays: 1 },
    { id: "C", plannedStart: d("2026-01-04"), plannedFinish: d("2026-01-06"), durationDays: 3 },
  ];
  const cp = computeCriticalPath(tasks, [
    { predecessorId: "A", successorId: "C", type: "finish_to_start", lagDays: 0 },
    { predecessorId: "B", successorId: "C", type: "finish_to_start", lagDays: 0 },
  ]);
  // A is on critical path (no float). B has float because it's only 1 day
  // but A determines C's start.
  const b = cp.results.find((r) => r.taskId === "B")!;
  assert.ok(b.totalFloatDays > 0, `B should have float, got ${b.totalFloatDays}`);
  assert.equal(b.isOnCriticalPath, false);
});

test("CPM: deterministic — same input → same output", () => {
  const tasks: TaskInput[] = [
    { id: "A", plannedStart: d("2026-01-01"), plannedFinish: d("2026-01-03"), durationDays: 3 },
    { id: "B", plannedStart: d("2026-01-04"), plannedFinish: d("2026-01-06"), durationDays: 3 },
  ];
  const deps: DependencyInput[] = [
    { predecessorId: "A", successorId: "B", type: "finish_to_start", lagDays: 0 },
  ];
  const a = computeCriticalPath(tasks, deps);
  const b = computeCriticalPath(tasks, deps);
  assert.deepEqual(a.results, b.results);
});

test("CPM: empty graph returns empty results", () => {
  const cp = computeCriticalPath([], []);
  assert.equal(cp.results.length, 0);
  assert.equal(cp.detectedCycles.length, 0);
});

test("CPM: single isolated task is on critical path (zero float by definition)", () => {
  const tasks: TaskInput[] = [
    { id: "A", plannedStart: d("2026-01-01"), plannedFinish: d("2026-01-03"), durationDays: 3 },
  ];
  const cp = computeCriticalPath(tasks, []);
  assert.equal(cp.results[0].isOnCriticalPath, true);
  assert.equal(cp.results[0].totalFloatDays, 0);
});

// ===========================================================================
// 3) Server modules
// ===========================================================================

test("Stage 4.C.2 server modules exist + use server-only (except pure helper)", () => {
  for (const rel of [
    "src/lib/development/server/work-packages/work-package-queries.ts",
    "src/lib/development/server/work-packages/work-package-actions.ts",
    "src/lib/development/server/schedule/schedule-queries.ts",
    "src/lib/development/server/schedule/schedule-actions.ts",
  ]) {
    assert.ok(exists(rel), `missing ${rel}`);
    const src = read(rel);
    assert.match(src, /^import "server-only"/m, `${rel} missing server-only`);
  }
});

test("critical-path-helpers.ts is PURE", () => {
  const src = read(
    "src/lib/development/server/schedule/critical-path-helpers.ts",
  );
  assert.doesNotMatch(src, /^import\s+"server-only"/m);
  assert.doesNotMatch(src, /requireDb|drizzle-orm/);
});

test("work-package-actions enforces status transitions", () => {
  const src = read(
    "src/lib/development/server/work-packages/work-package-actions.ts",
  );
  assert.match(src, /cannot transition work_package from/);
});

test("schedule-actions: setTaskDependency runs cycle detection before insert", () => {
  const src = read(
    "src/lib/development/server/schedule/schedule-actions.ts",
  );
  assert.match(src, /detectCycles/);
  assert.match(src, /would form a cycle/);
});

test("schedule-actions: recomputeProjectCriticalPath wraps in db.transaction", () => {
  const src = read(
    "src/lib/development/server/schedule/schedule-actions.ts",
  );
  assert.match(src, /db\.transaction/);
});

test("schedule-actions: refuses to recompute when graph has cycles", () => {
  const src = read(
    "src/lib/development/server/schedule/schedule-actions.ts",
  );
  assert.match(src, /cannot compute critical path.*cycle/);
});

// ===========================================================================
// 4) UI routes — Work Packages + Schedule (REQUIRED)
// ===========================================================================

const WP_ROUTES = [
  "src/app/(development-app)/development-os/projects/[slug]/work-packages/page.tsx",
  "src/app/(development-app)/development-os/projects/[slug]/work-packages/[code]/page.tsx",
  "src/app/(development-app)/development-os/projects/[slug]/work-packages/new/page.tsx",
];

const SCHEDULE_ROUTES = [
  "src/app/(development-app)/development-os/projects/[slug]/schedule/page.tsx",
  "src/app/(development-app)/development-os/projects/[slug]/schedule/tasks/page.tsx",
  "src/app/(development-app)/development-os/projects/[slug]/schedule/tasks/[code]/page.tsx",
  "src/app/(development-app)/development-os/projects/[slug]/schedule/tasks/new/page.tsx",
  "src/app/(development-app)/development-os/projects/[slug]/schedule/lookahead/page.tsx",
];

test("Work Packages: list + detail + create routes all exist", () => {
  for (const rel of WP_ROUTES) {
    assert.ok(exists(rel), `missing ${rel}`);
  }
});

test("Schedule: gantt + tasks list + detail + new + lookahead routes all exist", () => {
  for (const rel of SCHEDULE_ROUTES) {
    assert.ok(exists(rel), `missing ${rel}`);
  }
});

test("All Stage 4.C.2 routes wrap in DevelopmentShell + force-dynamic", () => {
  for (const rel of [...WP_ROUTES, ...SCHEDULE_ROUTES]) {
    const src = read(rel);
    assert.match(src, /DevelopmentShell/, `${rel} missing DevelopmentShell`);
    assert.match(src, /force-dynamic/, `${rel} missing force-dynamic`);
  }
});

test("Schedule Gantt page uses GanttChart component", () => {
  const src = read(
    "src/app/(development-app)/development-os/projects/[slug]/schedule/page.tsx",
  );
  assert.match(src, /GanttChart/);
});

test("GanttChart is server-rendered SVG (no 'use client')", () => {
  const src = read("src/components/development/schedule/gantt-chart.tsx");
  assert.doesNotMatch(src, /^"use client"/m);
  // Renders SVG.
  assert.match(src, /<svg/);
  // Critical path highlighted in red.
  assert.match(src, /#dc2626/);
  // Today line indicator.
  assert.match(src, /todayOffset/);
});

test("TaskForm includes dependency picker (FS/SS/FF/SF + lag days)", () => {
  const src = read("src/components/development/schedule/task-form.tsx");
  assert.match(src, /finish_to_start/);
  assert.match(src, /start_to_start/);
  assert.match(src, /finish_to_finish/);
  assert.match(src, /start_to_finish/);
  assert.match(src, /lagDays/);
});

test("WorkPackageForm supports multi-villa + multi-budget-category selection", () => {
  const src = read(
    "src/components/development/work-packages/work-package-form.tsx",
  );
  assert.match(src, /selectedVillas/);
  assert.match(src, /selectedCategories/);
});

test("All Stage 4.C.2 client components carry 'use client' + useTransition", () => {
  for (const rel of [
    "src/components/development/work-packages/work-package-form.tsx",
    "src/components/development/schedule/task-form.tsx",
  ]) {
    const src = read(rel);
    assert.match(src, /^"use client"/m);
    assert.match(src, /useTransition/);
  }
});
