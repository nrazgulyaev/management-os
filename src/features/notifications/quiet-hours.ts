/**
 * Pure quiet-hours helpers. Extracted so tests can import without
 * `server-only`. Time format is "HH:MM" 24h. Both ends inclusive at the
 * minute boundary; the window may wrap midnight (start > end).
 *
 * v8B — windows are evaluated in the recipient's timezone (IANA id).
 * Invalid timezones fall back to `Asia/Makassar`.
 */

export interface QuietHours {
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
}

const FALLBACK_TZ = "Asia/Makassar";

function toMinutes(hhmm: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Resolve a (possibly invalid) IANA timezone id to a usable one. Pure —
 * no side effects beyond `Intl.DateTimeFormat` instantiation, which
 * throws on unknown ids.
 */
export function resolveTimezone(tz: string | null | undefined): string {
  if (!tz) return FALLBACK_TZ;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return FALLBACK_TZ;
  }
}

interface ZonedHM {
  hours: number;
  minutes: number;
  /** Year/month/day in the resolved timezone. */
  year: number;
  month: number;
  day: number;
}

/**
 * Pull hour / minute / day from `now` in the given timezone. Uses
 * `Intl.DateTimeFormat` instead of dragging in date-fns-tz so we stay
 * dep-free.
 */
export function zonedClock(now: Date, timezone: string): ZonedHM {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: resolveTimezone(timezone),
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  // `Intl` reports `24` instead of `00` for some timezones at midnight.
  const rawHour = Number(get("hour"));
  const hours = rawHour === 24 ? 0 : rawHour;
  return {
    hours,
    minutes: Number(get("minute")),
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
  };
}

export function isWithinQuietHours(
  pref: QuietHours,
  now: Date = new Date(),
  timezone: string = FALLBACK_TZ,
): boolean {
  if (!pref.quietHoursStart || !pref.quietHoursEnd) return false;
  const startMin = toMinutes(pref.quietHoursStart);
  const endMin = toMinutes(pref.quietHoursEnd);
  if (startMin === null || endMin === null) return false;

  const z = zonedClock(now, timezone);
  const nowMin = z.hours * 60 + z.minutes;

  if (startMin === endMin) return false; // zero-length window
  if (startMin < endMin) {
    // same-day window: start <= now < end
    return nowMin >= startMin && nowMin < endMin;
  }
  // wrap-midnight window: now >= start OR now < end
  return nowMin >= startMin || nowMin < endMin;
}

/**
 * Compute the next time the window ends in the recipient's timezone,
 * so we can postpone delivery to `next_attempt_at`. Returns null when
 * no quiet hours are configured. The returned `Date` is an absolute
 * UTC instant — Postgres stores it as `timestamptz` and renders back
 * in any zone.
 */
export function nextQuietHoursEnd(
  pref: QuietHours,
  now: Date = new Date(),
  timezone: string = FALLBACK_TZ,
): Date | null {
  if (!pref.quietHoursStart || !pref.quietHoursEnd) return null;
  const endMin = toMinutes(pref.quietHoursEnd);
  if (endMin === null) return null;

  const tz = resolveTimezone(timezone);
  const z = zonedClock(now, tz);
  const endHour = Math.floor(endMin / 60);
  const endMinute = endMin % 60;

  // Build a candidate "today at endHour:endMinute" in the recipient's TZ
  // by composing an ISO-like string and asking JS for the matching UTC.
  const candidate = zonedDateToUtc(z.year, z.month, z.day, endHour, endMinute, tz);
  if (candidate.getTime() > now.getTime()) return candidate;
  // Otherwise the window closes tomorrow.
  const tomorrowDay = z.day + 1;
  return zonedDateToUtc(z.year, z.month, tomorrowDay, endHour, endMinute, tz);
}

/**
 * Translate "year/month/day hour/minute in tz X" → UTC `Date`. Uses a
 * known-good fixed-point: format the candidate in the tz, measure the
 * offset, apply.
 */
function zonedDateToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string,
): Date {
  // Start with a UTC guess at the requested wall-clock time, then
  // correct by however much that wall-clock is offset from UTC in tz.
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute);
  const guessDate = new Date(utcGuess);
  const tzClock = zonedClock(guessDate, timezone);
  // Compute the timezone offset in minutes implied by the guess.
  const tzMinutes =
    tzClock.hours * 60 + tzClock.minutes - (hour * 60 + minute);
  // Adjust: subtract the offset from the guess to land on the actual UTC
  // instant where the wall clock reads `hour:minute` in `timezone`.
  return new Date(utcGuess - tzMinutes * 60_000);
}
