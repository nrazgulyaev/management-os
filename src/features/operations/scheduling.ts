/**
 * Preventive-schedule date math. Pure helpers — easy to unit test, safe to
 * import from server actions and tests alike.
 *
 * Dates are handled in YYYY-MM-DD form to match the underlying `date`
 * column. We intentionally treat dates as calendar days, not timestamps,
 * so DST and timezone offsets don't drift the cadence.
 */

export type Frequency =
  | "daily"
  | "weekly"
  | "biweekly"
  | "monthly"
  | "quarterly"
  | "yearly"
  | "custom";

export interface ScheduleAdvanceInput {
  frequency: Frequency;
  /** Required for `custom`; ignored otherwise. */
  intervalDays?: number | null;
  /** Anchor date — usually `today`. */
  from: string;
}

function parseYmd(s: string): { y: number; m: number; d: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) throw new Error(`scheduling: invalid date "${s}", expected YYYY-MM-DD`);
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function toYmd(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function addDays(s: string, days: number): string {
  const { y, m, d } = parseYmd(s);
  // Use UTC to avoid timezone drift; we only need calendar-day math.
  const t = Date.UTC(y, m - 1, d) + days * 86_400_000;
  const r = new Date(t);
  return toYmd(r.getUTCFullYear(), r.getUTCMonth() + 1, r.getUTCDate());
}

function addMonths(s: string, months: number): string {
  const { y, m, d } = parseYmd(s);
  const total = (y * 12 + (m - 1) + months);
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  // Clamp day to last valid day of the resulting month.
  const lastDay = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  const nd = Math.min(d, lastDay);
  return toYmd(ny, nm, nd);
}

export function computeNextDueOn(input: ScheduleAdvanceInput): string {
  switch (input.frequency) {
    case "daily":
      return addDays(input.from, 1);
    case "weekly":
      return addDays(input.from, 7);
    case "biweekly":
      return addDays(input.from, 14);
    case "monthly":
      return addMonths(input.from, 1);
    case "quarterly":
      return addMonths(input.from, 3);
    case "yearly":
      return addMonths(input.from, 12);
    case "custom": {
      if (!input.intervalDays || input.intervalDays <= 0) {
        throw new Error("scheduling: custom frequency requires positive intervalDays");
      }
      return addDays(input.from, input.intervalDays);
    }
  }
}

/** "Today" in calendar-day form, in the server's timezone. */
export function todayYmd(now: Date = new Date()): string {
  return toYmd(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function isDueOnOrBefore(nextDueOn: string, ref: string): boolean {
  return nextDueOn <= ref;
}

// -----------------------------------------------------------------------------
// Status transition guards — central table consumed by services + tests.
// -----------------------------------------------------------------------------

export const TASK_TRANSITIONS: Record<string, string[]> = {
  open: ["scheduled", "in_progress", "cancelled"],
  scheduled: ["in_progress", "cancelled"],
  in_progress: ["blocked", "needs_review", "completed", "cancelled"],
  blocked: ["in_progress", "cancelled"],
  needs_review: ["completed", "approved", "in_progress", "cancelled"],
  completed: ["approved", "needs_review"],
  approved: [],
  cancelled: [],
};

export const MAINTENANCE_TRANSITIONS: Record<string, string[]> = {
  open: ["triaged", "scheduled", "in_progress", "cancelled"],
  triaged: ["scheduled", "in_progress", "waiting_parts", "cancelled"],
  scheduled: ["in_progress", "cancelled"],
  in_progress: ["waiting_parts", "resolved", "cancelled"],
  waiting_parts: ["in_progress", "cancelled"],
  resolved: ["closed"],
  closed: [],
  cancelled: [],
};

export const SERVICE_REQUEST_TRANSITIONS: Record<string, string[]> = {
  new: ["accepted", "cancelled"],
  accepted: ["scheduled", "in_progress", "cancelled"],
  scheduled: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

// Damage report lifecycle. The enum (schema.ts damageStatusEnum) is
//   open → under_review → {approved → {charged | waived | repaired} | repaired}
// → closed, with `archived` reachable from anywhere via the archive action
// (not modelled here — archive is a soft-delete handled separately). Resolve
// is the operator's path from `open`/`under_review` to a terminal outcome
// (`charged`/`waived`/`repaired`/`closed`) while recording the actual cost.
export const DAMAGE_REPORT_TRANSITIONS: Record<string, string[]> = {
  open: ["under_review", "approved", "repaired", "waived", "closed"],
  under_review: ["approved", "charged", "waived", "repaired", "closed"],
  approved: ["charged", "waived", "repaired", "closed"],
  charged: ["closed"],
  waived: ["closed"],
  repaired: ["charged", "waived", "closed"],
  closed: [],
};

export function canTransition(
  table: Record<string, string[]>,
  from: string,
  to: string,
): boolean {
  if (from === to) return true; // idempotent
  return (table[from] ?? []).includes(to);
}
