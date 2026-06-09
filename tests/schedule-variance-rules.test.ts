import { test } from "node:test";
import assert from "node:assert/strict";

import {
  detectScheduleVariance,
  AMBER_SLIP_DAYS,
  RED_SLIP_DAYS,
  type ScheduleMilestoneRow,
  type ScheduleDependencyEdge,
} from "../src/features/ai-agents/projects/schedule-variance-rules";

const PROJECT = "proj-1";
const ASOF = new Date("2026-06-08T12:00:00Z");

function ms(
  id: string,
  targetDate: string,
  over: Partial<ScheduleMilestoneRow> = {},
): ScheduleMilestoneRow {
  return {
    id,
    projectId: PROJECT,
    name: `Milestone ${id}`,
    targetDate,
    actualDate: null,
    status: "in_progress",
    ...over,
  };
}

test("overdue milestone: <7d slip is below threshold and not flagged", () => {
  // asOf 2026-06-08, target 2026-06-03 = 5 days slip.
  const res = detectScheduleVariance([ms("a", "2026-06-03")], [], ASOF);
  assert.equal(res.scanned, 1);
  assert.equal(res.flags.length, 0);
});

test("overdue milestone: 7-20d slip is amber, >=21d is red", () => {
  const res = detectScheduleVariance(
    [
      ms("amber", "2026-05-30"), // 9 days
      ms("red", "2026-05-10"), // 29 days
    ],
    [],
    ASOF,
  );
  assert.equal(res.flags.length, 2);
  // Sorted red-first.
  assert.equal(res.flags[0].milestoneId, "red");
  assert.equal(res.flags[0].severity, "red");
  assert.equal(res.flags[0].kind, "overdue_milestone");
  assert.equal(res.flags[1].milestoneId, "amber");
  assert.equal(res.flags[1].severity, "amber");
});

test("done milestones never flag, even when target is long past", () => {
  const res = detectScheduleVariance(
    [
      ms("done-status", "2026-01-01", { status: "done" }),
      ms("done-actual", "2026-01-01", { actualDate: "2026-01-05" }),
    ],
    [],
    ASOF,
  );
  assert.equal(res.scanned, 2);
  assert.equal(res.flags.length, 0);
});

test("amber boundary is exactly AMBER_SLIP_DAYS, below is silent", () => {
  // Build targets exactly AMBER_SLIP_DAYS and AMBER_SLIP_DAYS-1 days before asOf.
  const day = 86_400_000;
  const atThreshold = new Date(ASOF.getTime() - AMBER_SLIP_DAYS * day)
    .toISOString()
    .slice(0, 10);
  const belowThreshold = new Date(ASOF.getTime() - (AMBER_SLIP_DAYS - 1) * day)
    .toISOString()
    .slice(0, 10);
  const res = detectScheduleVariance(
    [ms("at", atThreshold), ms("below", belowThreshold)],
    [],
    ASOF,
  );
  assert.equal(res.flags.length, 1);
  assert.equal(res.flags[0].milestoneId, "at");
  assert.equal(res.flags[0].slipDays, AMBER_SLIP_DAYS);
});

test("dependency slip: open late fs-predecessor pushes a future successor", () => {
  // Predecessor target 2026-05-10 (29d overdue, still open) with an fs edge to
  // a successor whose target 2026-06-20 is in the future and NOT itself overdue.
  // The predecessor's effective finish (max of its target and asOf = 2026-06-08)
  // is still before the successor target, so NO slip is provable yet.
  const milestones: ScheduleMilestoneRow[] = [
    ms("pred", "2026-05-10"),
    ms("succ", "2026-06-20"),
  ];
  const deps: ScheduleDependencyEdge[] = [
    { fromMilestoneId: "pred", toMilestoneId: "succ", kind: "fs" },
  ];
  const res = detectScheduleVariance(milestones, deps, ASOF);
  // pred itself is overdue (red), succ has no provable slip.
  assert.equal(res.flags.filter((f) => f.kind === "dependency_slip").length, 0);
  assert.equal(res.flags.filter((f) => f.milestoneId === "pred").length, 1);
});

test("dependency slip below threshold is conservative (no flag)", () => {
  // Predecessor target 2026-06-25 (future, not overdue) -> effective finish
  // 2026-06-25, which overruns the successor target 2026-06-20 by only 5 days.
  // 5d < AMBER_SLIP_DAYS, so the chain slip is below threshold and silent.
  const milestones: ScheduleMilestoneRow[] = [
    ms("pred", "2026-06-25"),
    ms("succ", "2026-06-20"),
  ];
  const deps: ScheduleDependencyEdge[] = [
    { fromMilestoneId: "pred", toMilestoneId: "succ", kind: "fs" },
  ];
  const res = detectScheduleVariance(milestones, deps, ASOF);
  assert.equal(res.flags.filter((f) => f.kind === "dependency_slip").length, 0);
});

test("dependency slip only fires once the chain crosses the amber threshold", () => {
  // pred target far enough in the future that the projected successor slip
  // clears AMBER_SLIP_DAYS.
  const milestones: ScheduleMilestoneRow[] = [
    ms("pred", "2026-07-05"), // effective finish 2026-07-05
    ms("succ", "2026-06-20"), // 15 days of eaten float
  ];
  const deps: ScheduleDependencyEdge[] = [
    { fromMilestoneId: "pred", toMilestoneId: "succ", kind: "fs" },
  ];
  const res = detectScheduleVariance(milestones, deps, ASOF);
  const slip = res.flags.find((f) => f.kind === "dependency_slip");
  assert.ok(slip, "expected a dependency_slip flag");
  assert.equal(slip.milestoneId, "succ");
  assert.equal(slip.slipDays, 15);
  assert.equal(slip.severity, "amber");
});

test("non-fs dependency kinds do not propagate slip in v1", () => {
  const milestones: ScheduleMilestoneRow[] = [
    ms("pred", "2026-07-05"),
    ms("succ", "2026-06-20"),
  ];
  for (const kind of ["ss", "ff", "sf"] as const) {
    const res = detectScheduleVariance(
      milestones,
      [{ fromMilestoneId: "pred", toMilestoneId: "succ", kind }],
      ASOF,
    );
    assert.equal(
      res.flags.filter((f) => f.kind === "dependency_slip").length,
      0,
      `${kind} should not propagate`,
    );
  }
});

test("thresholds are sane and ordered", () => {
  assert.ok(AMBER_SLIP_DAYS > 0);
  assert.ok(RED_SLIP_DAYS > AMBER_SLIP_DAYS);
});
