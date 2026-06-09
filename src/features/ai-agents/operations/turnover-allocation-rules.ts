/**
 * Pure turnover-allocation rules (no DB, no server-only) — unit-testable.
 *
 * The server agent (turnover-allocator.ts) reads today's unassigned
 * turnovers + the cleaner roster + each cleaner's current workload, then
 * delegates the who-gets-what decision to allocateTurnovers() here.
 *
 * Deterministic by design: given the same inputs, the same assignments
 * fall out every run, so a 90s cron is idempotent and explainable.
 *
 * Strategy: least-loaded with a stable tie-break.
 *   · Each cleaner starts at their existing workload (turnovers already
 *     assigned to them today).
 *   · Turnovers are processed in a stable order (earliest deadline first,
 *     then id) so the same villa always lands on the same cleaner.
 *   · Each turnover goes to the cleaner with the fewest assignments so
 *     far; ties break on the cleaner's stable sort key (load, then id).
 *     With equal starting loads this degrades to plain round-robin.
 */

export interface AllocCleaner {
  /** app_users.id */
  id: string;
  name: string;
  /** Turnovers already assigned to this cleaner today (>= 0). */
  currentLoad: number;
}

export interface AllocTurnover {
  id: string;
  /** ISO timestamp/date used only to order ties; optional. */
  deadline?: string | null;
}

export interface AllocationDecision {
  turnoverId: string;
  cleanerId: string;
  rationale: string;
}

export interface AllocationResult {
  assigned: AllocationDecision[];
  unassignable: { turnoverId: string; reason: string }[];
}

interface Bucket {
  id: string;
  name: string;
  load: number;
}

/**
 * Assign each unassigned turnover to the least-loaded cleaner.
 *
 * Pure + deterministic. Mutates no inputs. When there are no cleaners,
 * every turnover comes back as unassignable with a clear reason.
 */
export function allocateTurnovers(
  turnovers: AllocTurnover[],
  cleaners: AllocCleaner[],
): AllocationResult {
  if (cleaners.length === 0) {
    return {
      assigned: [],
      unassignable: turnovers.map((t) => ({
        turnoverId: t.id,
        reason: "No cleaners on the roster.",
      })),
    };
  }

  // Working buckets, seeded with each cleaner's existing load. Sorted so
  // the least-loaded (then lowest id) is always first.
  const buckets: Bucket[] = cleaners
    .map((c) => ({ id: c.id, name: c.name, load: Math.max(0, c.currentLoad) }))
    .sort(byLoadThenId);

  // Stable processing order: earliest deadline first, then id.
  const queue = [...turnovers].sort(byDeadlineThenId);

  const assigned: AllocationDecision[] = [];
  for (const t of queue) {
    // Pick the least-loaded bucket (buckets stays sorted below).
    const pick = buckets[0];
    pick.load += 1;
    assigned.push({
      turnoverId: t.id,
      cleanerId: pick.id,
      rationale: `Least-loaded: assigned to ${pick.name} (${pick.load} turnover${pick.load === 1 ? "" : "s"} today).`,
    });
    // Re-sort: a small N (cleaners per villa cluster) makes this cheap and
    // keeps the tie-break fully deterministic.
    buckets.sort(byLoadThenId);
  }

  return { assigned, unassignable: [] };
}

function byLoadThenId(a: Bucket, b: Bucket): number {
  if (a.load !== b.load) return a.load - b.load;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function byDeadlineThenId(a: AllocTurnover, b: AllocTurnover): number {
  const da = a.deadline ?? "";
  const db = b.deadline ?? "";
  if (da !== db) {
    // Empty deadlines sort last (no check-in pressure).
    if (da === "") return 1;
    if (db === "") return -1;
    return da < db ? -1 : 1;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
