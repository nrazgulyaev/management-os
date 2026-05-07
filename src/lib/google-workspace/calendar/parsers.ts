/**
 * Stage 6.P5.B — Google Calendar parsers.
 *
 * Pure mappers between the Calendar v3 wire shape and a normalized
 * `CalendarEventRecord` the rest of the platform consumes.
 */

export interface CalendarEventRecord {
  externalEventId: string;
  summary: string;
  description?: string;
  startAt: Date;
  endAt: Date;
  /** "confirmed" | "tentative" | "cancelled" */
  status: string;
  organizerEmail?: string;
  attendees: Array<{ email: string; responseStatus?: string }>;
  htmlLink?: string;
  rawPayload: Record<string, unknown>;
}

/**
 * Pull `start.dateTime` (timestamped events) or `start.date`
 * (all-day) and resolve to a Date.
 */
export function pickEventStart(
  event: Record<string, unknown>,
): Date | undefined {
  const start = event["start"] as Record<string, unknown> | undefined;
  if (!start) return undefined;
  const dt = start["dateTime"] ?? start["date"];
  if (typeof dt !== "string") return undefined;
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return undefined;
  return d;
}

export function pickEventEnd(
  event: Record<string, unknown>,
): Date | undefined {
  const end = event["end"] as Record<string, unknown> | undefined;
  if (!end) return undefined;
  const dt = end["dateTime"] ?? end["date"];
  if (typeof dt !== "string") return undefined;
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return undefined;
  return d;
}

export function mapCalendarEvent(
  row: Record<string, unknown>,
): CalendarEventRecord | null {
  const id = typeof row["id"] === "string" ? row["id"] : undefined;
  const summary =
    typeof row["summary"] === "string" ? row["summary"] : undefined;
  const startAt = pickEventStart(row);
  const endAt = pickEventEnd(row);
  if (!id || !startAt || !endAt) return null;

  const organizer = row["organizer"] as Record<string, unknown> | undefined;
  const organizerEmail =
    typeof organizer?.["email"] === "string"
      ? (organizer["email"] as string)
      : undefined;

  const rawAttendees = Array.isArray(row["attendees"])
    ? (row["attendees"] as Array<Record<string, unknown>>)
    : [];
  const attendees = rawAttendees
    .map((a) => ({
      email: typeof a["email"] === "string" ? (a["email"] as string) : "",
      responseStatus:
        typeof a["responseStatus"] === "string"
          ? (a["responseStatus"] as string)
          : undefined,
    }))
    .filter((a) => a.email.length > 0);

  return {
    externalEventId: id,
    summary: summary ?? "(no title)",
    description:
      typeof row["description"] === "string"
        ? (row["description"] as string)
        : undefined,
    startAt,
    endAt,
    status:
      typeof row["status"] === "string" ? (row["status"] as string) : "confirmed",
    organizerEmail,
    attendees,
    htmlLink:
      typeof row["htmlLink"] === "string"
        ? (row["htmlLink"] as string)
        : undefined,
    rawPayload: row,
  };
}

/**
 * Build the v3 insert body from a normalized record. Reverse mapping —
 * exists so the service layer's `createEvent` can pass platform-shape
 * data without learning the wire format.
 */
export function buildEventInsertBody(input: {
  summary: string;
  description?: string;
  startAt: Date;
  endAt: Date;
  attendees?: string[];
  timeZone?: string;
}): Record<string, unknown> {
  return {
    summary: input.summary,
    description: input.description,
    start: {
      dateTime: input.startAt.toISOString(),
      ...(input.timeZone ? { timeZone: input.timeZone } : {}),
    },
    end: {
      dateTime: input.endAt.toISOString(),
      ...(input.timeZone ? { timeZone: input.timeZone } : {}),
    },
    ...(input.attendees && input.attendees.length > 0
      ? { attendees: input.attendees.map((email) => ({ email })) }
      : {}),
  };
}
