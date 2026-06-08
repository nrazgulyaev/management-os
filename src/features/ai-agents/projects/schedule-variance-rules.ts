/**
 * Pure schedule-variance rules (no DB, no server-only) — unit-testable.
 *
 * The server detector (schedule-variance-detector.ts) reads the persisted
 * `milestones` + `milestone_dependencies` rows and delegates to
 * detectScheduleVariance() here. The milestones page reuses the same
 * function to render its read-only "Schedule variance" band.
 *
 * Deterministic by design: schedule flags must be reproducible and
 * explainable. No clock reads inside — the caller passes `asOf`.
 *
 * Two rule families (conservative thresholds):
 *
 *   overdue_milestone   target date is on/before `asOf` and the milestone
 *                       is not `done` (no actual completion). slipDays =
 *                       whole days past target. amber 7–20d, red ≥21d.
 *                       <7d slip is below threshold and not flagged.
 *
 *   dependency_slip     a finish-to-start (`fs`) predecessor is itself
 *                       overdue/at-risk, pushing a not-yet-done successor.
 *                       The successor is flagged when the predecessor's
 *                       *effective finish* (later of its own target and
 *                       `asOf` while it stays open) lands on/after the
 *                       successor's target — i.e. the chain has already
 *                       eaten the successor's float. Severity mirrors the
 *                       predecessor's own slip bucket.
 *
 * Only `fs` (finish-to-start) edges propagate slip in v1 — the other CPM
 * kinds (ss/ff/sf) need start/finish pairs we don't model yet. Documented
 * follow-up; flagged conservatively (never invent a slip we can't prove).
 */

/** Conservative day thresholds shared by both rule families. */
export const AMBER_SLIP_DAYS = 7;
export const RED_SLIP_DAYS = 21;

export type ScheduleVarianceSeverity = "amber" | "red";

export type ScheduleVarianceKind = "overdue_milestone" | "dependency_slip";

/** Minimal milestone shape the rules need (DB-agnostic). */
export interface ScheduleMilestoneRow {
  id: string;
  projectId: string;
  name: string;
  /** ISO `YYYY-MM-DD` (drizzle `date` returns a string). */
  targetDate: string;
  /** ISO date or null/undefined while open. */
  actualDate?: string | null;
  /** planned | in_progress | done | at_risk | slipped. */
  status: string;
}

/** Finish-to-start etc. edge: `from` must finish before `to` starts (fs). */
export interface ScheduleDependencyEdge {
  fromMilestoneId: string;
  toMilestoneId: string;
  /** fs | ss | ff | sf. */
  kind: string;
}

export interface ScheduleVarianceRuleFlag {
  kind: ScheduleVarianceKind;
  severity: ScheduleVarianceSeverity;
  projectId: string;
  milestoneId: string;
  milestoneName: string;
  /** Whole days the milestone (or its driving predecessor) is past target. */
  slipDays: number;
  /** Free-form, explainable context (predecessor ref for chain slips). */
  detail: Record<string, unknown>;
}

export interface ScheduleVarianceResult {
  flags: ScheduleVarianceRuleFlag[];
  /** Total milestones inspected. */
  scanned: number;
}

/** A milestone is "settled" once it has completed — no longer a slip risk. */
function isDone(m: ScheduleMilestoneRow): boolean {
  return m.status === "done" || !!m.actualDate;
}

/** Parse an ISO date to UTC midnight ms; NaN-safe callers check the result. */
function toUtcMs(iso: string): number {
  // Append a UTC time so we compare calendar days, not local offsets.
  return Date.parse(`${iso}T00:00:00Z`);
}

/** Whole days `later` is after `earlier` (>=0; never negative). */
function dayDiff(laterMs: number, earlierMs: number): number {
  if (laterMs <= earlierMs) return 0;
  return Math.floor((laterMs - earlierMs) / 86_400_000);
}

function severityFor(slipDays: number): ScheduleVarianceSeverity | null {
  if (slipDays >= RED_SLIP_DAYS) return "red";
  if (slipDays >= AMBER_SLIP_DAYS) return "amber";
  return null;
}

/**
 * Given a project's milestones + dependency edges and an `asOf` date,
 * return the deterministic schedule-variance flags.
 *
 * Pure: same inputs always yield the same flags (sorted for stability).
 * Conservative: only flags slip we can prove from the data on hand.
 */
export function detectScheduleVariance(
  milestones: ScheduleMilestoneRow[],
  dependencies: ScheduleDependencyEdge[],
  asOf: Date,
): ScheduleVarianceResult {
  const asOfMs = toUtcMs(asOf.toISOString().slice(0, 10));
  const byId = new Map(milestones.map((m) => [m.id, m]));
  const flags: ScheduleVarianceRuleFlag[] = [];

  // Rule 1 — overdue milestones (own target past, not yet done).
  // Cache each open milestone's own slip so Rule 2 can reuse it.
  const ownSlip = new Map<string, number>();
  for (const m of milestones) {
    if (isDone(m)) continue;
    const targetMs = toUtcMs(m.targetDate);
    if (Number.isNaN(targetMs)) continue;
    const slip = dayDiff(asOfMs, targetMs);
    ownSlip.set(m.id, slip);

    const severity = severityFor(slip);
    if (!severity) continue;
    flags.push({
      kind: "overdue_milestone",
      severity,
      projectId: m.projectId,
      milestoneId: m.id,
      milestoneName: m.name,
      slipDays: slip,
      detail: {
        targetDate: m.targetDate,
        status: m.status,
      },
    });
  }

  // Rule 2 — dependency slip. A late/open `fs` predecessor whose effective
  // finish has already overrun a not-yet-done successor's target eats the
  // successor's float, so flag the successor. We skip pairs already caught
  // by Rule 1 on the successor itself (avoid double-flagging the same row
  // for the same root cause; the overdue flag is the stronger signal).
  const overdueIds = new Set(
    flags.filter((f) => f.kind === "overdue_milestone").map((f) => f.milestoneId),
  );

  for (const edge of dependencies) {
    if (edge.kind !== "fs") continue; // only finish-to-start propagates in v1
    const pred = byId.get(edge.fromMilestoneId);
    const succ = byId.get(edge.toMilestoneId);
    if (!pred || !succ) continue;
    if (isDone(pred)) continue; // a finished predecessor can't push anyone
    if (isDone(succ)) continue; // successor already landed
    if (overdueIds.has(succ.id)) continue; // already flagged stronger

    const predTargetMs = toUtcMs(pred.targetDate);
    const succTargetMs = toUtcMs(succ.targetDate);
    if (Number.isNaN(predTargetMs) || Number.isNaN(succTargetMs)) continue;

    // Effective finish of an open predecessor: it cannot finish before its
    // own target, and if `asOf` is already past that target it cannot have
    // finished before now either.
    const predEffectiveFinishMs = Math.max(predTargetMs, asOfMs);

    // The chain only threatens the successor once the predecessor's
    // effective finish reaches the successor's start. With an `fs` edge the
    // successor cannot start before the predecessor finishes, so if the
    // predecessor finishes on/after the successor's own target the
    // successor's target is unreachable — that's the slip.
    if (predEffectiveFinishMs < succTargetMs) continue;

    const predSlip = ownSlip.get(pred.id) ?? dayDiff(asOfMs, predTargetMs);
    const projectedSuccSlip = dayDiff(predEffectiveFinishMs, succTargetMs);
    // Drive severity off how late the chain is, using the larger of the
    // predecessor's own slip and the successor's projected slip.
    const severity = severityFor(Math.max(predSlip, projectedSuccSlip));
    if (!severity) continue;

    flags.push({
      kind: "dependency_slip",
      severity,
      projectId: succ.projectId,
      milestoneId: succ.id,
      milestoneName: succ.name,
      slipDays: projectedSuccSlip,
      detail: {
        targetDate: succ.targetDate,
        predecessorId: pred.id,
        predecessorName: pred.name,
        predecessorTargetDate: pred.targetDate,
        predecessorSlipDays: predSlip,
        edgeKind: edge.kind,
      },
    });
  }

  // Stable, deterministic order: red before amber, then by slip desc, then
  // by milestone id so two runs over the same data never differ.
  flags.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "red" ? -1 : 1;
    if (a.slipDays !== b.slipDays) return b.slipDays - a.slipDays;
    if (a.milestoneId !== b.milestoneId) {
      return a.milestoneId < b.milestoneId ? -1 : 1;
    }
    return a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0;
  });

  return { flags, scanned: milestones.length };
}
