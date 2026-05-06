/**
 * Stage 5.H.1 — Calendar-aware Critical Path variant.
 *
 * **Sibling helper, not a replacement.** The original
 * [computeCriticalPath](./critical-path-helpers.ts) is byte-for-byte
 * unchanged so all Stage 4.C tests continue passing.
 *
 * This variant takes the same inputs plus a `WorkingCalendar` and
 * post-processes the original CPM result so that:
 *   - duration is reported both in calendar days and working days
 *   - early/late dates are snapped to the next working day if they
 *     fall on a weekend or holiday (the operator's planned dates
 *     are still respected; we only adjust forward to a working day)
 */

import {
  computeCriticalPath,
  type CriticalPathResult,
  type DependencyInput,
  type TaskCriticalPathResult,
  type TaskInput,
} from "./critical-path-helpers";
import {
  countWorkingDays,
  isWorkingDay,
  nextWorkingDay,
  type WorkingCalendar,
} from "../../server/calendar/calendar-helpers";

export interface CalendarAwareCriticalPathResult extends CriticalPathResult {
  workingDaysDuration: number;
  calendar: WorkingCalendar;
}

/**
 * Snap a date forward to the next working day if it isn't one already.
 */
function snapForward(d: Date, calendar: WorkingCalendar): Date {
  return isWorkingDay(d, calendar) ? d : nextWorkingDay(d, calendar);
}

export function computeCriticalPathWithCalendar(
  tasks: TaskInput[],
  dependencies: DependencyInput[],
  calendar: WorkingCalendar,
): CalendarAwareCriticalPathResult {
  // Delegate the math to the original helper.
  const base = computeCriticalPath(tasks, dependencies);

  // Snap each task's early/late dates to working days. This is
  // intentionally additive — we don't recompute float, only adjust
  // surface dates so downstream UIs render against working days.
  const adjustedResults: TaskCriticalPathResult[] = base.results.map((r) => ({
    ...r,
    earlyStart: snapForward(r.earlyStart, calendar),
    earlyFinish: snapForward(r.earlyFinish, calendar),
    lateStart: snapForward(r.lateStart, calendar),
    lateFinish: snapForward(r.lateFinish, calendar),
  }));

  const workingDaysDuration = countWorkingDays(
    base.projectStartDate,
    base.projectEndDate,
    calendar,
  );

  return {
    ...base,
    results: adjustedResults,
    workingDaysDuration,
    calendar,
  };
}
