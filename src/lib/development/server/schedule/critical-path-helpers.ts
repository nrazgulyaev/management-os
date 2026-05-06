/**
 * Stage 4.C.2 — Pure Critical Path Method (CPM) helpers.
 *
 * No I/O, no `import "server-only"`. Runtime testable.
 *
 * Algorithm:
 *   1. Detect cycles (Kahn's algorithm). Refuse to compute on cyclic graphs.
 *   2. Topological sort tasks for forward pass.
 *   3. Forward pass: compute early_start / early_finish from project start.
 *   4. Backward pass: compute late_finish / late_start from project end.
 *   5. Float = late_start - early_start. Tasks with float ≤ 0 are critical.
 *
 * Dependency types supported (predecessor P → successor S):
 *   finish_to_start (FS) — S.early_start ≥ P.early_finish + lag (default)
 *   start_to_start  (SS) — S.early_start ≥ P.early_start  + lag
 *   finish_to_finish(FF) — S.early_finish ≥ P.early_finish + lag
 *   start_to_finish (SF) — S.early_finish ≥ P.early_start  + lag (rare)
 *
 * Scope explicitly limited: no resource leveling, no calendar/holiday
 * handling (every day is a working day), no baseline comparison.
 */

export type DependencyType =
  | "finish_to_start"
  | "start_to_start"
  | "finish_to_finish"
  | "start_to_finish";

export interface TaskInput {
  id: string;
  plannedStart: Date;
  plannedFinish: Date;
  durationDays: number;
}

export interface DependencyInput {
  predecessorId: string;
  successorId: string;
  type: DependencyType;
  lagDays: number;
}

export interface TaskCriticalPathResult {
  taskId: string;
  earlyStart: Date;
  earlyFinish: Date;
  lateStart: Date;
  lateFinish: Date;
  totalFloatDays: number;
  isOnCriticalPath: boolean;
}

export interface CriticalPathResult {
  results: TaskCriticalPathResult[];
  projectStartDate: Date;
  projectEndDate: Date;
  criticalPathDuration: number;
  detectedCycles: string[][];
}

const MS_PER_DAY = 86_400_000;

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * MS_PER_DAY);
}

function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

function maxDate(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b;
}

function minDate(a: Date, b: Date): Date {
  return a.getTime() <= b.getTime() ? a : b;
}

/**
 * Detect cycles in dependency graph using Kahn's algorithm.
 * Returns the set of node IDs that participate in any cycle.
 * Empty array means the graph is a DAG.
 */
export function detectCycles(
  taskIds: string[],
  dependencies: DependencyInput[],
): string[][] {
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const id of taskIds) {
    inDegree.set(id, 0);
    adj.set(id, []);
  }
  for (const dep of dependencies) {
    if (
      !inDegree.has(dep.predecessorId) ||
      !inDegree.has(dep.successorId)
    ) {
      continue;
    }
    inDegree.set(dep.successorId, (inDegree.get(dep.successorId) ?? 0) + 1);
    adj.get(dep.predecessorId)!.push(dep.successorId);
  }
  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }
  let visited = 0;
  while (queue.length > 0) {
    const id = queue.shift()!;
    visited++;
    for (const next of adj.get(id) ?? []) {
      const d = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, d);
      if (d === 0) queue.push(next);
    }
  }
  if (visited === taskIds.length) return [];
  // Some node has cycles — return the unvisited node IDs as the cycle set.
  const cycleNodes: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg > 0) cycleNodes.push(id);
  }
  return [cycleNodes];
}

/**
 * Topological sort for forward pass. Returns task IDs in order
 * predecessors-first. Throws if a cycle is present (callers should
 * `detectCycles` first to surface a clean error).
 */
export function topologicalSort(
  taskIds: string[],
  dependencies: DependencyInput[],
): string[] {
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const id of taskIds) {
    inDegree.set(id, 0);
    adj.set(id, []);
  }
  for (const dep of dependencies) {
    if (!inDegree.has(dep.predecessorId) || !inDegree.has(dep.successorId)) {
      continue;
    }
    inDegree.set(dep.successorId, (inDegree.get(dep.successorId) ?? 0) + 1);
    adj.get(dep.predecessorId)!.push(dep.successorId);
  }
  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }
  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of adj.get(id) ?? []) {
      const d = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, d);
      if (d === 0) queue.push(next);
    }
  }
  if (order.length !== taskIds.length) {
    throw new Error(
      "topologicalSort: graph contains a cycle — call detectCycles first",
    );
  }
  return order;
}

/**
 * Compute critical path. Returns per-task early/late dates, total float,
 * and is_on_critical_path. Refuses to run on cyclic graphs.
 */
export function computeCriticalPath(
  tasks: TaskInput[],
  dependencies: DependencyInput[],
): CriticalPathResult {
  const taskIds = tasks.map((t) => t.id);
  const cycles = detectCycles(taskIds, dependencies);
  if (cycles.length > 0) {
    return {
      results: [],
      projectStartDate: new Date(0),
      projectEndDate: new Date(0),
      criticalPathDuration: 0,
      detectedCycles: cycles,
    };
  }

  const taskById = new Map<string, TaskInput>();
  for (const t of tasks) taskById.set(t.id, t);

  const predecessorsOf = new Map<string, DependencyInput[]>();
  const successorsOf = new Map<string, DependencyInput[]>();
  for (const id of taskIds) {
    predecessorsOf.set(id, []);
    successorsOf.set(id, []);
  }
  for (const dep of dependencies) {
    if (taskById.has(dep.predecessorId) && taskById.has(dep.successorId)) {
      predecessorsOf.get(dep.successorId)!.push(dep);
      successorsOf.get(dep.predecessorId)!.push(dep);
    }
  }

  // Project start = earliest planned start across all tasks (we anchor
  // the forward pass to this — the operator's planned dates are already
  // realistic but CPM derives critical-path-shifted early/late from here).
  let projectStart = tasks[0]?.plannedStart ?? new Date();
  for (const t of tasks) projectStart = minDate(projectStart, t.plannedStart);

  // Forward pass.
  const order = topologicalSort(taskIds, dependencies);
  const earlyStart = new Map<string, Date>();
  const earlyFinish = new Map<string, Date>();
  for (const id of order) {
    const task = taskById.get(id)!;
    let es = task.plannedStart; // anchor on planned start by default
    for (const dep of predecessorsOf.get(id) ?? []) {
      const pred = taskById.get(dep.predecessorId);
      if (!pred) continue;
      const predEs = earlyStart.get(pred.id) ?? pred.plannedStart;
      const predEf = earlyFinish.get(pred.id) ?? pred.plannedFinish;
      let constraint: Date;
      switch (dep.type) {
        case "finish_to_start":
          constraint = addDays(predEf, dep.lagDays + 1); // FS: predEf + lag, then start next day
          break;
        case "start_to_start":
          constraint = addDays(predEs, dep.lagDays);
          break;
        case "finish_to_finish":
          // S.ef ≥ P.ef + lag → S.es = constraint - duration + 1
          constraint = addDays(
            addDays(predEf, dep.lagDays),
            -task.durationDays + 1,
          );
          break;
        case "start_to_finish":
          // S.ef ≥ P.es + lag → S.es = constraint - duration + 1
          constraint = addDays(
            addDays(predEs, dep.lagDays),
            -task.durationDays + 1,
          );
          break;
      }
      es = maxDate(es, constraint);
    }
    const ef = addDays(es, task.durationDays - 1);
    earlyStart.set(id, es);
    earlyFinish.set(id, ef);
  }

  // Project end = max early_finish across all tasks.
  let projectEnd = projectStart;
  for (const id of taskIds) {
    const ef = earlyFinish.get(id);
    if (ef) projectEnd = maxDate(projectEnd, ef);
  }

  // Backward pass.
  const lateFinish = new Map<string, Date>();
  const lateStart = new Map<string, Date>();
  for (const id of [...order].reverse()) {
    const task = taskById.get(id)!;
    let lf = projectEnd; // anchor: project end
    const successors = successorsOf.get(id) ?? [];
    if (successors.length > 0) {
      lf = successors.reduce((acc, dep) => {
        const succ = taskById.get(dep.successorId);
        if (!succ) return acc;
        const succLs = lateStart.get(succ.id) ?? succ.plannedStart;
        const succLf = lateFinish.get(succ.id) ?? succ.plannedFinish;
        let constraint: Date;
        switch (dep.type) {
          case "finish_to_start":
            // P.lf ≤ S.ls - lag - 1
            constraint = addDays(succLs, -dep.lagDays - 1);
            break;
          case "start_to_start":
            // P.ls ≤ S.ls - lag → P.lf = constraint + duration - 1
            constraint = addDays(
              addDays(succLs, -dep.lagDays),
              task.durationDays - 1,
            );
            break;
          case "finish_to_finish":
            constraint = addDays(succLf, -dep.lagDays);
            break;
          case "start_to_finish":
            // P.ls ≤ S.lf - lag → P.lf = (S.lf - lag) + duration - 1
            constraint = addDays(
              addDays(succLf, -dep.lagDays),
              task.durationDays - 1,
            );
            break;
        }
        return minDate(acc, constraint);
      }, lf);
    }
    const ls = addDays(lf, -(task.durationDays - 1));
    lateFinish.set(id, lf);
    lateStart.set(id, ls);
  }

  // Compose results + flag critical (float ≤ 0).
  const results: TaskCriticalPathResult[] = [];
  for (const task of tasks) {
    const es = earlyStart.get(task.id) ?? task.plannedStart;
    const ef = earlyFinish.get(task.id) ?? task.plannedFinish;
    const ls = lateStart.get(task.id) ?? task.plannedStart;
    const lf = lateFinish.get(task.id) ?? task.plannedFinish;
    const float = diffDays(es, ls);
    results.push({
      taskId: task.id,
      earlyStart: es,
      earlyFinish: ef,
      lateStart: ls,
      lateFinish: lf,
      totalFloatDays: float,
      isOnCriticalPath: float <= 0,
    });
  }

  return {
    results,
    projectStartDate: projectStart,
    projectEndDate: projectEnd,
    criticalPathDuration: diffDays(projectStart, projectEnd) + 1,
    detectedCycles: [],
  };
}
