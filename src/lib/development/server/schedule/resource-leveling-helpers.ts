/**
 * Stage 5.H.3 — Pure resource leveling helpers.
 *
 * No I/O, no `import "server-only"`. Runtime testable.
 *
 * **Suggestions only — never auto-execute.** All actions returned by
 * `suggestLevelingActions` require operator review before any task
 * is shifted or reassigned.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ResourceTaskAllocation {
  taskId: string;
  isCriticalPath: boolean;
  allocatedPerDay: number;
  startDate: Date;
  endDate: Date;
}

export interface ResourceAllocation {
  resourceId: string;
  totalDailyCapacity: number;
  taskAllocations: ResourceTaskAllocation[];
}

export interface OverAllocatedDay {
  date: Date;
  allocated: number;
  capacity: number;
  conflicts: Array<{ taskId: string; isCriticalPath: boolean }>;
}

export interface OverAllocatedResource {
  resourceId: string;
  overAllocatedDays: OverAllocatedDay[];
}

export interface DetectOverAllocationsOutput {
  overAllocatedResources: OverAllocatedResource[];
  totalConflictDays: number;
}

function toUtcMidnight(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}

export function detectOverAllocations(
  resources: ResourceAllocation[],
  evaluationPeriod: { start: Date; end: Date },
): DetectOverAllocationsOutput {
  const periodStart = toUtcMidnight(evaluationPeriod.start);
  const periodEnd = toUtcMidnight(evaluationPeriod.end);
  if (periodEnd.getTime() < periodStart.getTime()) {
    return { overAllocatedResources: [], totalConflictDays: 0 };
  }

  const result: OverAllocatedResource[] = [];
  let totalConflictDays = 0;

  for (const res of resources) {
    const overDays: OverAllocatedDay[] = [];
    for (
      let cursor = periodStart.getTime();
      cursor <= periodEnd.getTime();
      cursor += DAY_MS
    ) {
      const day = new Date(cursor);
      const dayMid = day.getTime();
      const overlapping = res.taskAllocations.filter((a) => {
        const aStart = toUtcMidnight(a.startDate).getTime();
        const aEnd = toUtcMidnight(a.endDate).getTime();
        return dayMid >= aStart && dayMid <= aEnd;
      });
      const allocated = overlapping.reduce((s, a) => s + a.allocatedPerDay, 0);
      if (allocated > res.totalDailyCapacity) {
        overDays.push({
          date: day,
          allocated,
          capacity: res.totalDailyCapacity,
          conflicts: overlapping.map((a) => ({
            taskId: a.taskId,
            isCriticalPath: a.isCriticalPath,
          })),
        });
        totalConflictDays++;
      }
    }
    if (overDays.length > 0) {
      result.push({ resourceId: res.resourceId, overAllocatedDays: overDays });
    }
  }

  return { overAllocatedResources: result, totalConflictDays };
}

// ---------------------------------------------------------------------------
// Suggest leveling actions
// ---------------------------------------------------------------------------

export type LevelingActionType =
  | "delay_task"
  | "reassign_resource"
  | "split_task"
  | "add_resource"
  | "no_action_required";

export interface ConflictTask {
  taskId: string;
  isCriticalPath: boolean;
  floatDays: number;
}

export interface ConflictDay {
  date: Date;
  conflictingTasks: ConflictTask[];
}

export interface LevelingSuggestion {
  action: LevelingActionType;
  taskId: string;
  suggestedDelay?: number;
  rationale: string;
  impactOnCriticalPath: "none" | "increase" | "shift";
}

/**
 * Heuristic suggestion engine. Given conflicts, picks the cheapest
 * (lowest critical-path impact) action per conflict.
 */
export function suggestLevelingActions(input: {
  conflicts: ConflictDay[];
  preserveCriticalPath: boolean;
}): LevelingSuggestion[] {
  const out: LevelingSuggestion[] = [];
  for (const c of input.conflicts) {
    if (c.conflictingTasks.length < 2) continue;
    // Prefer to delay non-critical tasks with float available.
    const nonCriticalWithFloat = c.conflictingTasks
      .filter((t) => !t.isCriticalPath && t.floatDays > 0)
      .sort((a, b) => b.floatDays - a.floatDays);
    if (nonCriticalWithFloat.length > 0) {
      const t = nonCriticalWithFloat[0];
      out.push({
        action: "delay_task",
        taskId: t.taskId,
        suggestedDelay: 1,
        rationale: `Task has ${t.floatDays} day(s) of float; delaying 1 day absorbs the conflict without impacting critical path.`,
        impactOnCriticalPath: "none",
      });
      continue;
    }
    // No float on non-critical → suggest reassign for non-critical task.
    const nonCritical = c.conflictingTasks.filter((t) => !t.isCriticalPath);
    if (nonCritical.length > 0) {
      const t = nonCritical[0];
      out.push({
        action: "reassign_resource",
        taskId: t.taskId,
        rationale:
          "Non-critical task has no float — reassign to alternate resource if available.",
        impactOnCriticalPath: "none",
      });
      continue;
    }
    // All critical — depending on preserveCriticalPath flag.
    if (input.preserveCriticalPath) {
      const t = c.conflictingTasks[0];
      out.push({
        action: "add_resource",
        taskId: t.taskId,
        rationale:
          "All conflicting tasks are on critical path — add capacity rather than shift.",
        impactOnCriticalPath: "none",
      });
    } else {
      const t = c.conflictingTasks[0];
      out.push({
        action: "delay_task",
        taskId: t.taskId,
        suggestedDelay: 1,
        rationale:
          "Critical-path task delayed to clear conflict; project end-date will shift.",
        impactOnCriticalPath: "shift",
      });
    }
  }
  return out;
}
