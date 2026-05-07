/**
 * Stage 6.P5.B — Google Calendar provider.
 *
 * Wraps `GoogleCalendarClient` behind the `GoogleCalendarProvider`
 * interface. Operates on the user's primary calendar by default;
 * the service layer can pass another calendar id.
 */

import {
  GoogleCalendarClient,
  type GoogleCalendarClientOptions,
} from "./client";
import {
  buildEventInsertBody,
  mapCalendarEvent,
  type CalendarEventRecord,
} from "./parsers";
import type {
  GoogleCalendarCredentials,
  GoogleConnectionTestResult,
} from "../types";

export interface GoogleCalendarProviderInterface {
  readonly service: "google_calendar";
  listEvents(input: {
    calendarId?: string;
    timeMin?: Date;
    timeMax?: Date;
    maxResults?: number;
  }): Promise<CalendarEventRecord[]>;
  createEvent(input: {
    calendarId?: string;
    summary: string;
    description?: string;
    startAt: Date;
    endAt: Date;
    attendees?: string[];
    timeZone?: string;
  }): Promise<CalendarEventRecord | null>;
  updateEvent(input: {
    calendarId?: string;
    eventId: string;
    body: Record<string, unknown>;
  }): Promise<CalendarEventRecord | null>;
  deleteEvent(input: {
    calendarId?: string;
    eventId: string;
  }): Promise<{ deleted: boolean }>;
  freeBusy(input: {
    timeMin: Date;
    timeMax: Date;
    calendarIds?: string[];
  }): Promise<Array<{ calendarId: string; busy: Array<{ start: Date; end: Date }> }>>;
  testConnection(): Promise<GoogleConnectionTestResult>;
}

export class GoogleCalendarProvider
  implements GoogleCalendarProviderInterface
{
  readonly service = "google_calendar" as const;
  private readonly client: GoogleCalendarClient;
  private readonly creds: GoogleCalendarCredentials;

  constructor(
    credentials: GoogleCalendarCredentials,
    opts: GoogleCalendarClientOptions = {},
  ) {
    this.creds = credentials;
    this.client = new GoogleCalendarClient(
      {
        accessToken: credentials.accessToken,
        refreshToken: credentials.refreshToken,
        expiresAt: credentials.expiresAt,
      },
      opts,
    );
  }

  async listEvents(input: {
    calendarId?: string;
    timeMin?: Date;
    timeMax?: Date;
    maxResults?: number;
  }): Promise<CalendarEventRecord[]> {
    const result = await this.client.listEvents(input);
    if (result.status < 200 || result.status >= 300) return [];
    let parsed: { items?: Array<Record<string, unknown>> };
    try {
      parsed = JSON.parse(result.body) as {
        items?: Array<Record<string, unknown>>;
      };
    } catch {
      return [];
    }
    return (parsed.items ?? [])
      .map(mapCalendarEvent)
      .filter((r): r is CalendarEventRecord => r !== null);
  }

  async createEvent(input: {
    calendarId?: string;
    summary: string;
    description?: string;
    startAt: Date;
    endAt: Date;
    attendees?: string[];
    timeZone?: string;
  }): Promise<CalendarEventRecord | null> {
    const body = buildEventInsertBody(input);
    const result = await this.client.insertEvent({
      calendarId: input.calendarId,
      body,
    });
    if (result.status < 200 || result.status >= 300) return null;
    try {
      return mapCalendarEvent(
        JSON.parse(result.body) as Record<string, unknown>,
      );
    } catch {
      return null;
    }
  }

  async updateEvent(input: {
    calendarId?: string;
    eventId: string;
    body: Record<string, unknown>;
  }): Promise<CalendarEventRecord | null> {
    const result = await this.client.updateEvent(input);
    if (result.status < 200 || result.status >= 300) return null;
    try {
      return mapCalendarEvent(
        JSON.parse(result.body) as Record<string, unknown>,
      );
    } catch {
      return null;
    }
  }

  async deleteEvent(input: {
    calendarId?: string;
    eventId: string;
  }): Promise<{ deleted: boolean }> {
    const result = await this.client.deleteEvent(input);
    return { deleted: result.status >= 200 && result.status < 300 };
  }

  async freeBusy(input: {
    timeMin: Date;
    timeMax: Date;
    calendarIds?: string[];
  }): Promise<
    Array<{ calendarId: string; busy: Array<{ start: Date; end: Date }> }>
  > {
    const result = await this.client.freeBusy({
      timeMin: input.timeMin,
      timeMax: input.timeMax,
      calendarIds: input.calendarIds ?? ["primary"],
    });
    if (result.status < 200 || result.status >= 300) return [];
    let parsed: { calendars?: Record<string, { busy?: Array<{ start?: string; end?: string }> }> };
    try {
      parsed = JSON.parse(result.body) as typeof parsed;
    } catch {
      return [];
    }
    const out: Array<{
      calendarId: string;
      busy: Array<{ start: Date; end: Date }>;
    }> = [];
    for (const [cid, payload] of Object.entries(parsed.calendars ?? {})) {
      const busy = (payload.busy ?? [])
        .map((b) => {
          const s = b.start ? new Date(b.start) : null;
          const e = b.end ? new Date(b.end) : null;
          if (!s || !e || Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()))
            return null;
          return { start: s, end: e };
        })
        .filter((b): b is { start: Date; end: Date } => b !== null);
      out.push({ calendarId: cid, busy });
    }
    return out;
  }

  async testConnection(): Promise<GoogleConnectionTestResult> {
    try {
      const result = await this.client.getPrimaryCalendar();
      const ok = result.status >= 200 && result.status < 300;
      return {
        connected: ok,
        service: "google_calendar",
        accountEmail: this.creds.accountEmail,
        scopes: this.creds.scopes,
        ...(ok ? {} : { error: `HTTP ${result.status}` }),
      };
    } catch (err) {
      return {
        connected: false,
        service: "google_calendar",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
