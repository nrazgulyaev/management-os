/**
 * Minimal iCalendar (RFC 5545) parser.
 *
 * Pure — no `server-only` import, no DB, no fetch. Easy to unit-test and
 * cheap to run server-side. Handles the subset that channel calendars
 * (Airbnb / Booking.com / Vrbo) actually emit:
 *   - VEVENT blocks
 *   - UID, SUMMARY, DESCRIPTION, LOCATION
 *   - DTSTART / DTEND in DATE (all-day) and DATE-TIME forms
 *   - DTSTART;VALUE=DATE and DTSTART;TZID=... parameter forms
 *   - Line unfolding (continuation lines start with a space or tab)
 *   - Common backslash escapes (\\n, \\,, \\;, \\\\)
 *
 * Anything we can't parse is reported via `IcsParseResult.errors` so the
 * caller can surface it to the operator without losing the rest of the feed.
 */

export interface IcsRawEvent {
  uid: string;
  summary?: string;
  description?: string;
  location?: string;
  /** YYYY-MM-DD */
  dtStart: string;
  /** YYYY-MM-DD — when the source provides DATE-TIME, we keep the calendar
   *  date in the server's timezone-agnostic form. iCal DTEND on DATE
   *  values is exclusive; we keep it as-is here and treat it as "checkout
   *  date" downstream. */
  dtEnd: string;
  isAllDay: boolean;
  /** All raw key/value pairs we observed for this event. */
  raw: Record<string, string>;
}

export interface IcsParseResult {
  events: IcsRawEvent[];
  errors: { reason: string; near?: string }[];
}

export function parseIcsCalendar(text: string): IcsParseResult {
  const out: IcsParseResult = { events: [], errors: [] };
  if (!text || typeof text !== "string") {
    out.errors.push({ reason: "empty or non-string ICS payload" });
    return out;
  }

  const lines = unfoldLines(text);
  let inEvent = false;
  let current: Record<string, string> = {};

  for (const line of lines) {
    const upper = line.toUpperCase();
    if (upper === "BEGIN:VEVENT") {
      inEvent = true;
      current = {};
      continue;
    }
    if (upper === "END:VEVENT") {
      inEvent = false;
      try {
        const ev = normaliseIcsEvent(current);
        if (ev) out.events.push(ev);
      } catch (e) {
        out.errors.push({
          reason: e instanceof Error ? e.message : "normalise failed",
          near: current.UID ?? current.SUMMARY,
        });
      }
      continue;
    }
    if (!inEvent) continue;

    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const left = line.slice(0, colon);
    const right = unescapeText(line.slice(colon + 1));

    // Strip parameters (everything after the first ;).
    const semi = left.indexOf(";");
    const baseKey = (semi === -1 ? left : left.slice(0, semi)).toUpperCase();
    const params = semi === -1 ? "" : left.slice(semi + 1);

    // Stash the raw pair and parameter shapes; downstream consumers may
    // need to know e.g. whether DTSTART was tagged VALUE=DATE.
    current[baseKey] = right;
    if (params) current[`${baseKey}_PARAMS`] = params.toUpperCase();
  }

  return out;
}

export function normaliseIcsEvent(raw: Record<string, string>): IcsRawEvent | null {
  const uid = raw.UID?.trim();
  if (!uid) throw new Error("VEVENT missing UID");

  const dtStartRaw = raw.DTSTART;
  const dtEndRaw = raw.DTEND;
  if (!dtStartRaw) throw new Error("VEVENT missing DTSTART");
  if (!dtEndRaw) throw new Error("VEVENT missing DTEND");

  const startInfo = parseIcsDate(dtStartRaw, raw.DTSTART_PARAMS);
  const endInfo = parseIcsDate(dtEndRaw, raw.DTEND_PARAMS);

  return {
    uid,
    summary: raw.SUMMARY?.trim() || undefined,
    description: raw.DESCRIPTION?.trim() || undefined,
    location: raw.LOCATION?.trim() || undefined,
    dtStart: startInfo.date,
    dtEnd: endInfo.date,
    isAllDay: startInfo.isAllDay && endInfo.isAllDay,
    raw,
  };
}

interface IcsDateInfo {
  date: string; // YYYY-MM-DD
  isAllDay: boolean;
}

function parseIcsDate(value: string, params: string | undefined): IcsDateInfo {
  const trimmed = value.trim();
  // DATE-TIME: 20260425T133000Z  or  20260425T133000
  const dt = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/.exec(trimmed);
  if (dt) {
    return { date: `${dt[1]}-${dt[2]}-${dt[3]}`, isAllDay: false };
  }
  // DATE: 20260425
  const d = /^(\d{4})(\d{2})(\d{2})$/.exec(trimmed);
  if (d) {
    const isAllDay =
      params === undefined || /VALUE=DATE/.test(params) || true;
    return { date: `${d[1]}-${d[2]}-${d[3]}`, isAllDay };
  }
  throw new Error(`unsupported ICS date format: ${trimmed}`);
}

function unfoldLines(text: string): string[] {
  // RFC 5545 line-folding: a single continuation line starts with a SPACE
  // or HTAB and is appended to the previous line minus the leading whitespace.
  const physicalLines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of physicalLines) {
    if (line.length === 0) continue;
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length > 0) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

function unescapeText(s: string): string {
  return s
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

/**
 * Two date ranges (YYYY-MM-DD strings, checkout = exclusive end) overlap
 * when neither sits entirely before nor entirely after the other.
 *
 *   A: a1 → a2 (checkout)
 *   B: b1 → b2
 *   overlap ⇔ a1 < b2 AND b1 < a2
 */
export function dateRangesOverlap(
  a1: string,
  a2: string,
  b1: string,
  b2: string,
): boolean {
  return a1 < b2 && b1 < a2;
}

/**
 * Validate a feed URL: only http/https. We deliberately accept any host
 * and let the caller decide on host allowlisting later.
 */
export function isValidFeedUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
