/**
 * ICAL-EXPORT-1 — pure RFC-5545 ICS builder for outbound availability feeds.
 *
 * No I/O, no `server-only` — unit-testable (tests/ical-export.test.ts). The
 * server route feeds it pre-shaped events; this module only knows how to emit
 * a syntactically-correct calendar:
 *   · CRLF line endings, lines folded at 75 octets (RFC 5545 §3.1);
 *   · TEXT escaping for backslash/semicolon/comma/newline (§3.3.11);
 *   · all-day events (VALUE=DATE) with EXCLUSIVE DTEND — a stay
 *     check-in 2026-07-10 → check-out 2026-07-14 blocks the nights of the
 *     10th-13th, matching how Airbnb/Booking.com read imported calendars;
 *   · deterministic output: DTSTAMP comes from the caller-supplied `now`,
 *     events are emitted sorted by (start, uid) so the same inputs always
 *     produce the same bytes (plays well with HTTP caching / diffing).
 *
 * PRIVACY: callers must pass generic summaries ("Reserved", "Blocked") —
 * never guest names. The builder deliberately has no notion of a guest.
 */

export interface IcsAllDayEvent {
  /** Stable unique id — e.g. `booking-<uuid>` / `block-<uuid>`. */
  uid: string;
  /** Inclusive first blocked day, YYYY-MM-DD. */
  startDate: string;
  /** EXCLUSIVE end day (first free day), YYYY-MM-DD. */
  endDateExclusive: string;
  /** Generic label only — never guest-identifying. */
  summary: string;
}

const CRLF = "\r\n";
const PRODID = "-//Arconique//Villa Availability Export//EN";
const UID_DOMAIN = "ical.arconique.com";

/** RFC 5545 §3.3.11 TEXT escaping. Order matters: backslash first. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * RFC 5545 §3.1 line folding — content lines longer than 75 OCTETS are split
 * with CRLF + single space. Folds on UTF-8 byte length, never inside a
 * multi-byte character.
 */
export function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const out: string[] = [];
  let current = "";
  let currentBytes = 0;
  // First segment budget 75; continuation segments 74 (leading space costs 1).
  let budget = 75;
  for (const ch of line) {
    const chBytes = encoder.encode(ch).length;
    if (currentBytes + chBytes > budget) {
      out.push(current);
      current = ch;
      currentBytes = chBytes;
      budget = 74;
    } else {
      current += ch;
      currentBytes += chBytes;
    }
  }
  if (current) out.push(current);
  return out.map((seg, i) => (i === 0 ? seg : ` ${seg}`)).join(CRLF);
}

/** YYYY-MM-DD → RFC 5545 DATE (basic format YYYYMMDD). Throws on bad input. */
export function toIcsDate(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) throw new Error(`Invalid ISO date for ICS: ${isoDate}`);
  return `${m[1]}${m[2]}${m[3]}`;
}

/** Date → RFC 5545 UTC DATE-TIME (basic format, e.g. 20260704T093000Z). */
export function toIcsUtcStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/** UTC calendar date (YYYY-MM-DD) of a timestamp — floor. */
export function utcDateFloor(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * UTC calendar date CEILING of a timestamp — the exclusive all-day end for a
 * timestamped block: exactly-midnight stays on its date, anything later rolls
 * to the next date (a block ending 15:00 on the 10th must block the 10th).
 */
export function utcDateCeil(d: Date): string {
  const floor = utcDateFloor(d);
  const isMidnight =
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0;
  if (isMidnight) return floor;
  const next = new Date(Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate() + 1,
  ));
  return next.toISOString().slice(0, 10);
}

/**
 * Build the full VCALENDAR document. `now` drives DTSTAMP (pass a fixed date
 * in tests). Events with a non-positive span (end <= start) are skipped —
 * they cannot block a night and some OTA parsers reject them.
 */
export function buildAvailabilityIcs(input: {
  calendarName: string;
  events: IcsAllDayEvent[];
  now: Date;
}): string {
  const stamp = toIcsUtcStamp(input.now);
  const sorted = [...input.events]
    .filter((e) => e.endDateExclusive > e.startDate)
    .sort((a, b) =>
      a.startDate === b.startDate
        ? a.uid.localeCompare(b.uid)
        : a.startDate.localeCompare(b.startDate),
    );

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(input.calendarName)}`,
  ];
  for (const e of sorted) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeIcsText(e.uid)}@${UID_DOMAIN}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${toIcsDate(e.startDate)}`,
      `DTEND;VALUE=DATE:${toIcsDate(e.endDateExclusive)}`,
      `SUMMARY:${escapeIcsText(e.summary)}`,
      "STATUS:CONFIRMED",
      "TRANSP:OPAQUE",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldIcsLine).join(CRLF) + CRLF;
}
