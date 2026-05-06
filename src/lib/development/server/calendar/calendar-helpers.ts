/**
 * Stage 5.H.1 — Pure calendar helpers.
 *
 * No I/O, no `import "server-only"`. Runtime testable.
 *
 * `WorkingCalendar` describes which days of the week are working days
 * (0=Sun, 1=Mon, …, 6=Sat) and a list of holiday Dates that are
 * non-working regardless of weekday.
 */

export interface WorkingCalendar {
  workingDaysOfWeek: number[];
  workingHoursPerDay: number;
  holidays: Date[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function toUtcMidnight(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}

function isHoliday(date: Date, holidays: Date[]): boolean {
  const target = toUtcMidnight(date).getTime();
  return holidays.some((h) => toUtcMidnight(h).getTime() === target);
}

export function isWorkingDay(date: Date, calendar: WorkingCalendar): boolean {
  const dow = date.getUTCDay();
  if (!calendar.workingDaysOfWeek.includes(dow)) return false;
  if (isHoliday(date, calendar.holidays)) return false;
  return true;
}

/**
 * Inclusive of both `startDate` and `endDate`. Returns 0 if endDate < startDate.
 */
export function countWorkingDays(
  startDate: Date,
  endDate: Date,
  calendar: WorkingCalendar,
): number {
  const start = toUtcMidnight(startDate);
  const end = toUtcMidnight(endDate);
  if (end.getTime() < start.getTime()) return 0;
  let count = 0;
  for (
    let cursor = start.getTime();
    cursor <= end.getTime();
    cursor += DAY_MS
  ) {
    const d = new Date(cursor);
    if (isWorkingDay(d, calendar)) count++;
  }
  return count;
}

/**
 * Add N working days to a start date. If startDate is itself a working
 * day it counts as day 1. `addWorkingDays(start, 0)` returns start.
 */
export function addWorkingDays(
  startDate: Date,
  workingDaysToAdd: number,
  calendar: WorkingCalendar,
): Date {
  const cursor = toUtcMidnight(startDate);
  if (workingDaysToAdd <= 0) return cursor;
  let added = 0;
  let result = new Date(cursor.getTime());
  // Skip start if it's not a working day — first working day = day 1.
  if (isWorkingDay(result, calendar)) added = 1;
  while (added < workingDaysToAdd) {
    result = new Date(result.getTime() + DAY_MS);
    if (isWorkingDay(result, calendar)) added++;
  }
  return result;
}

export function nextWorkingDay(
  date: Date,
  calendar: WorkingCalendar,
): Date {
  let cursor = new Date(toUtcMidnight(date).getTime() + DAY_MS);
  while (!isWorkingDay(cursor, calendar)) {
    cursor = new Date(cursor.getTime() + DAY_MS);
  }
  return cursor;
}

export interface WorkingDaysBreakdown {
  totalDays: number;
  workingDays: number;
  weekendDays: number;
  holidays: number;
}

export function workingDaysBetween(
  startDate: Date,
  endDate: Date,
  calendar: WorkingCalendar,
): WorkingDaysBreakdown {
  const start = toUtcMidnight(startDate);
  const end = toUtcMidnight(endDate);
  if (end.getTime() < start.getTime()) {
    return { totalDays: 0, workingDays: 0, weekendDays: 0, holidays: 0 };
  }
  let total = 0;
  let working = 0;
  let weekend = 0;
  let hol = 0;
  for (
    let cursor = start.getTime();
    cursor <= end.getTime();
    cursor += DAY_MS
  ) {
    total++;
    const d = new Date(cursor);
    const dow = d.getUTCDay();
    const isWeekDay = calendar.workingDaysOfWeek.includes(dow);
    const isHol = isHoliday(d, calendar.holidays);
    if (!isWeekDay) weekend++;
    if (isHol) hol++;
    if (isWeekDay && !isHol) working++;
  }
  return {
    totalDays: total,
    workingDays: working,
    weekendDays: weekend,
    holidays: hol,
  };
}
