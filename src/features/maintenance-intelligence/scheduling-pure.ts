/**
 * Pure scheduling helpers. NO `server-only` import — testable, used by
 * the DB-aware service layer in `scheduling.ts`.
 *
 * Conventions:
 *   - All dates handled as UTC. Times are stored as `time` (HH:MM:SS).
 *   - `[startsAt, endsAt)` half-open intervals (matches V9A).
 *   - Frequencies map to a calendar-day delta:
 *       daily=1, twice_weekly=3.5 (rounded to 4), weekly=7,
 *       biweekly=14, monthly=30, quarterly=91, yearly=365,
 *       custom=intervalDays (required).
 */

export type Frequency =
  | "daily"
  | "twice_weekly"
  | "weekly"
  | "biweekly"
  | "monthly"
  | "quarterly"
  | "yearly"
  | "custom";

export type DisruptionLevel = "none" | "low" | "medium" | "high";

const FREQUENCY_DAYS: Record<Frequency, number> = {
  daily: 1,
  twice_weekly: 4,
  weekly: 7,
  biweekly: 14,
  monthly: 30,
  quarterly: 91,
  yearly: 365,
  // `custom` requires intervalDays — see resolveIntervalDays.
  custom: 0,
};

export function resolveIntervalDays(
  frequency: Frequency,
  intervalDays: number | null | undefined,
): number {
  if (frequency === "custom") {
    if (!intervalDays || intervalDays < 1) return 14; // safe default
    return intervalDays;
  }
  return FREQUENCY_DAYS[frequency] ?? 14;
}

/**
 * Compute the next due timestamp given a frequency, optional interval,
 * and the timestamp of the most recent completion.
 *
 * - If `lastCompletedAt` is null, returns `now + interval` (treats today
 *   as a fresh start).
 * - Returns a `Date` in UTC. Caller can serialise via `.toISOString()`.
 */
export function calculateNextDueAt(input: {
  frequency: Frequency;
  intervalDays?: number | null;
  lastCompletedAt?: Date | string | null;
  now?: Date;
}): Date {
  const days = resolveIntervalDays(input.frequency, input.intervalDays ?? null);
  const base =
    input.lastCompletedAt != null
      ? new Date(input.lastCompletedAt)
      : (input.now ?? new Date());
  const next = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
  return next;
}

/**
 * Pure: is `date` (YYYY-MM-DD) in the supplied weekday list?
 * `weekdays` is the JSON shape stored on the plan: numeric ISO weekday
 * (1 = Monday … 7 = Sunday) OR three-letter english string ("mon").
 */
export function dateMatchesWeekdays(
  date: string,
  weekdays: unknown,
): boolean {
  if (!Array.isArray(weekdays) || weekdays.length === 0) return false;
  const d = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return false;
  // getUTCDay: 0 = Sunday … 6 = Saturday. Convert to ISO 1..7.
  const iso = ((d.getUTCDay() + 6) % 7) + 1;
  const labels = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const label = labels[iso - 1];
  return weekdays.some(
    (w) =>
      (typeof w === "number" && w === iso) ||
      (typeof w === "string" && w.toLowerCase().slice(0, 3) === label),
  );
}

// -----------------------------------------------------------------------------
// Clustering rule
// -----------------------------------------------------------------------------

/**
 * Pure: would scheduling THIS plan (`category`) on `candidateDate` push
 * the project past the 30% threshold? `existingTasksByDate` lists tasks
 * already on the same date for the same category in the same project.
 *
 * `totalVillasInProject` is the count of villas the rule applies to.
 * Returns `true` if the candidate should be REJECTED (would cluster).
 */
export const CLUSTERING_LIMIT_PERCENT = 30;

export function wouldExceedClusteringLimit(input: {
  candidateDate: string;
  category: string;
  totalVillasInProject: number;
  existingTasksByDate: { date: string; villaId: string; category: string }[];
}): boolean {
  if (input.totalVillasInProject <= 0) return false;
  // Count distinct villas that already have a task in this category on
  // the candidate date (not counting the candidate itself).
  const villasOnDate = new Set(
    input.existingTasksByDate
      .filter(
        (t) =>
          t.date === input.candidateDate && t.category === input.category,
      )
      .map((t) => t.villaId),
  );
  // The candidate would push this villa onto the same date too.
  const total = villasOnDate.size + 1;
  const percent = (total / input.totalVillasInProject) * 100;
  return percent > CLUSTERING_LIMIT_PERCENT;
}

// -----------------------------------------------------------------------------
// Window scoring
// -----------------------------------------------------------------------------

export type BlockingType =
  | "guest_booking"
  | "owner_stay"
  | "out_of_order"
  | "internal_hold"
  | "maintenance_block";

const BLOCKING_TYPES: ReadonlyArray<string> = [
  "guest_booking",
  "owner_stay",
  "out_of_order",
  "internal_hold",
  "maintenance_block",
];

export interface CalendarBlockLike {
  blockType: string;
  status: string;
  startsAt: Date | string;
  endsAt: Date | string;
}

export interface PlanWindowConstraints {
  category: string;
  durationMinutes: number;
  canBeDoneWhileOccupied: boolean;
  guestDisruptionLevel: DisruptionLevel;
  requiresVillaEmpty: boolean;
  preferredWeekdays: unknown;
  avoidWeekdays: unknown;
  preferredTimeWindowStart: string | null; // HH:MM
  preferredTimeWindowEnd: string | null;
}

export interface WindowCandidate {
  start: Date;
  end: Date;
  date: string;
  conflicts: number;
  /** True if the candidate window falls inside an active guest_booking
   *  but the plan allows it (`canBeDoneWhileOccupied` and disruption
   *  level is none/low). Caller may surface as a warning. */
  duringStay: boolean;
}

export interface ScoredWindow {
  start: string;
  end: string;
  date: string;
  score: number;
  reason: string;
  conflictCount: number;
}

function intervalsOverlap(
  aStart: Date | string,
  aEnd: Date | string,
  bStart: Date | string,
  bEnd: Date | string,
): boolean {
  const a0 = +new Date(aStart);
  const a1 = +new Date(aEnd);
  const b0 = +new Date(bStart);
  const b1 = +new Date(bEnd);
  return a0 < b1 && b0 < a1;
}

function isBlocking(blockType: string, status: string): boolean {
  return status === "active" && BLOCKING_TYPES.includes(blockType);
}

/**
 * Pure: enumerate candidate windows over `[from, until]`. We propose one
 * window per day at either the preferred start time or 09:00 UTC default,
 * with the configured duration.
 */
export function enumerateCandidateWindows(input: {
  from: Date;
  until: Date;
  durationMinutes: number;
  preferredTimeWindowStart: string | null;
}): WindowCandidate[] {
  const out: WindowCandidate[] = [];
  const startTime = input.preferredTimeWindowStart ?? "09:00";
  const [hStr, mStr] = startTime.split(":");
  const hh = Number(hStr) || 9;
  const mm = Number(mStr) || 0;
  const dayMs = 24 * 60 * 60 * 1000;
  const fromMidnight = new Date(input.from);
  fromMidnight.setUTCHours(0, 0, 0, 0);
  const untilMidnight = new Date(input.until);
  untilMidnight.setUTCHours(0, 0, 0, 0);
  for (
    let cursor = fromMidnight.getTime();
    cursor <= untilMidnight.getTime();
    cursor += dayMs
  ) {
    const start = new Date(cursor);
    start.setUTCHours(hh, mm, 0, 0);
    const end = new Date(start.getTime() + input.durationMinutes * 60_000);
    out.push({
      start,
      end,
      date: new Date(cursor).toISOString().slice(0, 10),
      conflicts: 0,
      duringStay: false,
    });
  }
  return out;
}

/**
 * Pure: filter + score candidate windows against the villa's calendar
 * blocks and the plan's constraints. Higher score is better; range
 * `[0, 1]`.
 */
export function scoreWindowCandidates(input: {
  candidates: WindowCandidate[];
  villaBlocks: CalendarBlockLike[];
  constraints: PlanWindowConstraints;
  /** Per-date counts of in-project, same-category active tasks already
   *  scheduled. Used to penalise clustering. */
  sameCategoryDateCounts: Record<string, number>;
  totalVillasInProject: number;
}): ScoredWindow[] {
  const out: ScoredWindow[] = [];
  for (const c of input.candidates) {
    // Hard filters
    let blockedByOOO = false;
    let blockedByGuestStay = false;
    let blockedByMaintenance = false;
    let conflictCount = 0;
    for (const b of input.villaBlocks) {
      if (!isBlocking(b.blockType, b.status)) continue;
      if (!intervalsOverlap(b.startsAt, b.endsAt, c.start, c.end)) continue;
      conflictCount++;
      if (b.blockType === "guest_booking") blockedByGuestStay = true;
      else if (
        b.blockType === "out_of_order" ||
        b.blockType === "internal_hold"
      )
        blockedByOOO = true;
      else if (b.blockType === "maintenance_block") blockedByMaintenance = true;
    }

    // Reject windows that violate hard constraints.
    if (blockedByOOO) continue;
    if (blockedByMaintenance) continue;
    if (input.constraints.requiresVillaEmpty && blockedByGuestStay) continue;
    if (
      blockedByGuestStay &&
      (!input.constraints.canBeDoneWhileOccupied ||
        input.constraints.guestDisruptionLevel === "medium" ||
        input.constraints.guestDisruptionLevel === "high")
    ) {
      continue;
    }

    // Avoid weekday filter
    if (
      Array.isArray(input.constraints.avoidWeekdays) &&
      input.constraints.avoidWeekdays.length > 0 &&
      dateMatchesWeekdays(c.date, input.constraints.avoidWeekdays)
    ) {
      continue;
    }

    // Score
    let score = 0.6; // base
    const reasons: string[] = [];

    // Preferred weekday bonus
    if (
      Array.isArray(input.constraints.preferredWeekdays) &&
      input.constraints.preferredWeekdays.length > 0 &&
      dateMatchesWeekdays(c.date, input.constraints.preferredWeekdays)
    ) {
      score += 0.15;
      reasons.push("preferred weekday");
    }

    // No conflicts at all → full bonus
    if (conflictCount === 0) {
      score += 0.2;
      reasons.push("villa free");
    }

    // Cluster penalty: another villa in the project already has the
    // same category scheduled on this date. Cap at -0.3.
    const sameDayCount = input.sameCategoryDateCounts[c.date] ?? 0;
    if (sameDayCount > 0 && input.totalVillasInProject > 0) {
      const ratio = sameDayCount / input.totalVillasInProject;
      const penalty = Math.min(0.3, ratio);
      score -= penalty;
      reasons.push(
        `${sameDayCount} other villa(s) same category on this date`,
      );
    }

    // During stay (allowed but flagged) → small penalty.
    if (blockedByGuestStay) {
      score -= 0.1;
      reasons.push("during guest stay (low disruption)");
    }

    score = Math.max(0, Math.min(1, score));
    out.push({
      start: c.start.toISOString(),
      end: c.end.toISOString(),
      date: c.date,
      score: Number(score.toFixed(3)),
      reason: reasons.join("; ") || "ok",
      conflictCount,
    });
  }
  // Sort descending by score, then ascending by date.
  out.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.date.localeCompare(b.date);
  });
  return out;
}
