import "server-only";

import { and, asc, desc, eq, ne, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  bookingConflicts,
  channelCalendarEvents,
  channelCalendarFeeds,
} from "@/lib/db/schema/integrations";
import { bookingChannels, bookings } from "@/lib/db/schema/bookings";
import { villas, projects } from "@/lib/db/schema/projects";
import { appUsers } from "@/lib/db/schema/identity";
import type { WithSource } from "@/features/types";

export interface CalendarFeedRow {
  id: string;
  feedName: string;
  feedUrl: string;
  feedType: string;
  status: string;
  villaId: string;
  villaCode: string | null;
  projectId: string | null;
  projectName: string | null;
  bookingChannelId: string | null;
  channelName: string | null;
  lastSyncedAt: string | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  syncIntervalMinutes: number;
  createdByName: string | null;
  createdAt: string;
  eventCount: number;
}

export interface CalendarEventRow {
  id: string;
  feedId: string;
  feedName: string | null;
  villaCode: string | null;
  externalUid: string;
  externalSummary: string | null;
  checkIn: string;
  checkOut: string;
  status: string;
  conflictStatus: string;
  conflictNotes: string | null;
  bookingId: string | null;
  bookingCode: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  updatedAt: string;
}

export interface BookingConflictRow {
  id: string;
  villaId: string;
  villaCode: string | null;
  bookingId: string | null;
  bookingCode: string | null;
  calendarEventId: string | null;
  externalUid: string | null;
  conflictType: string;
  severity: string;
  description: string;
  status: string;
  resolvedByName: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

// -----------------------------------------------------------------------------
// Feeds
// -----------------------------------------------------------------------------

export async function listCalendarFeeds(): Promise<WithSource<CalendarFeedRow>[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select({
      f: channelCalendarFeeds,
      villaCode: villas.unitCode,
      projectName: projects.name,
      channelName: bookingChannels.name,
      createdByName: appUsers.fullName,
      eventCount: sql<number>`(SELECT count(*) FROM channel_calendar_events e WHERE e.feed_id = ${channelCalendarFeeds.id})`.as(
        "event_count",
      ),
    })
    .from(channelCalendarFeeds)
    .leftJoin(villas, eq(villas.id, channelCalendarFeeds.villaId))
    .leftJoin(projects, eq(projects.id, channelCalendarFeeds.projectId))
    .leftJoin(bookingChannels, eq(bookingChannels.id, channelCalendarFeeds.bookingChannelId))
    .leftJoin(appUsers, eq(appUsers.id, channelCalendarFeeds.createdBy))
    .orderBy(asc(channelCalendarFeeds.feedName));

  return rows.map((r) => ({
    source: "db" as const,
    id: r.f.id,
    feedName: r.f.feedName,
    feedUrl: r.f.feedUrl,
    feedType: r.f.feedType,
    status: r.f.status,
    villaId: r.f.villaId,
    villaCode: r.villaCode ?? null,
    projectId: r.f.projectId,
    projectName: r.projectName ?? null,
    bookingChannelId: r.f.bookingChannelId,
    channelName: r.channelName ?? null,
    lastSyncedAt: r.f.lastSyncedAt?.toISOString() ?? null,
    lastSuccessAt: r.f.lastSuccessAt?.toISOString() ?? null,
    lastErrorAt: r.f.lastErrorAt?.toISOString() ?? null,
    lastError: r.f.lastError,
    syncIntervalMinutes: r.f.syncIntervalMinutes,
    createdByName: r.createdByName ?? null,
    createdAt: r.f.createdAt.toISOString(),
    eventCount: Number(r.eventCount ?? 0),
  }));
}

export async function getCalendarFeedById(
  id: string,
): Promise<WithSource<CalendarFeedRow> | null> {
  const all = await listCalendarFeeds();
  return all.find((f) => f.id === id) ?? null;
}

// -----------------------------------------------------------------------------
// Events
// -----------------------------------------------------------------------------

export async function listCalendarEvents(opts?: {
  feedId?: string;
  status?: string;
  conflictStatus?: string;
  limit?: number;
}): Promise<WithSource<CalendarEventRow>[]> {
  const db = getDb();
  if (!db) return [];
  const filters = [];
  if (opts?.feedId) filters.push(eq(channelCalendarEvents.feedId, opts.feedId));
  if (opts?.status) filters.push(eq(channelCalendarEvents.status, opts.status));
  if (opts?.conflictStatus)
    filters.push(eq(channelCalendarEvents.conflictStatus, opts.conflictStatus));

  const rows = await db
    .select({
      e: channelCalendarEvents,
      feedName: channelCalendarFeeds.feedName,
      villaCode: villas.unitCode,
      bookingCode: bookings.bookingCode,
    })
    .from(channelCalendarEvents)
    .leftJoin(channelCalendarFeeds, eq(channelCalendarFeeds.id, channelCalendarEvents.feedId))
    .leftJoin(villas, eq(villas.id, channelCalendarFeeds.villaId))
    .leftJoin(bookings, eq(bookings.id, channelCalendarEvents.bookingId))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(channelCalendarEvents.lastSeenAt))
    .limit(opts?.limit ?? 200);

  return rows.map((r) => ({
    source: "db" as const,
    id: r.e.id,
    feedId: r.e.feedId,
    feedName: r.feedName ?? null,
    villaCode: r.villaCode ?? null,
    externalUid: r.e.externalUid,
    externalSummary: r.e.externalSummary,
    checkIn: r.e.checkIn,
    checkOut: r.e.checkOut,
    status: r.e.status,
    conflictStatus: r.e.conflictStatus,
    conflictNotes: r.e.conflictNotes,
    bookingId: r.e.bookingId,
    bookingCode: r.bookingCode ?? null,
    firstSeenAt: r.e.firstSeenAt.toISOString(),
    lastSeenAt: r.e.lastSeenAt.toISOString(),
    updatedAt: r.e.updatedAt.toISOString(),
  }));
}

// -----------------------------------------------------------------------------
// Conflicts
// -----------------------------------------------------------------------------

export async function listBookingConflicts(opts?: {
  status?: string;
  villaId?: string;
}): Promise<WithSource<BookingConflictRow>[]> {
  const db = getDb();
  if (!db) return [];
  const filters = [];
  if (opts?.status) filters.push(eq(bookingConflicts.status, opts.status));
  if (opts?.villaId) filters.push(eq(bookingConflicts.villaId, opts.villaId));

  const rows = await db
    .select({
      c: bookingConflicts,
      villaCode: villas.unitCode,
      bookingCode: bookings.bookingCode,
      externalUid: channelCalendarEvents.externalUid,
      resolvedByName: appUsers.fullName,
    })
    .from(bookingConflicts)
    .leftJoin(villas, eq(villas.id, bookingConflicts.villaId))
    .leftJoin(bookings, eq(bookings.id, bookingConflicts.bookingId))
    .leftJoin(
      channelCalendarEvents,
      eq(channelCalendarEvents.id, bookingConflicts.calendarEventId),
    )
    .leftJoin(appUsers, eq(appUsers.id, bookingConflicts.resolvedBy))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(bookingConflicts.createdAt))
    .limit(200);

  return rows.map((r) => ({
    source: "db" as const,
    id: r.c.id,
    villaId: r.c.villaId,
    villaCode: r.villaCode ?? null,
    bookingId: r.c.bookingId,
    bookingCode: r.bookingCode ?? null,
    calendarEventId: r.c.calendarEventId,
    externalUid: r.externalUid ?? null,
    conflictType: r.c.conflictType,
    severity: r.c.severity,
    description: r.c.description,
    status: r.c.status,
    resolvedByName: r.resolvedByName ?? null,
    resolvedAt: r.c.resolvedAt?.toISOString() ?? null,
    createdAt: r.c.createdAt.toISOString(),
  }));
}

// -----------------------------------------------------------------------------
// Conflict-detection helper (pure DB query, exported for tests + actions)
// -----------------------------------------------------------------------------

export interface OverlappingBooking {
  id: string;
  bookingCode: string;
  checkIn: string;
  checkOut: string;
}

/**
 * Find bookings on the same villa that overlap [checkIn, checkOut). Honour
 * the iCal convention that DTEND is exclusive — `checkout = next_checkin`
 * is NOT an overlap.
 */
export async function detectBookingConflicts(
  villaId: string,
  checkIn: string,
  checkOut: string,
  excludeBookingId?: string,
): Promise<OverlappingBooking[]> {
  const db = getDb();
  if (!db) return [];
  const filters = [
    eq(bookings.villaId, villaId),
    // overlap condition: existing.checkIn < new.checkOut AND existing.checkOut > new.checkIn
    sql`${bookings.checkIn} < ${checkOut}::date`,
    sql`${bookings.checkOut} > ${checkIn}::date`,
    or(
      eq(bookings.status, "confirmed"),
      eq(bookings.status, "checked_in"),
      eq(bookings.status, "tentative"),
    ),
  ];
  if (excludeBookingId) filters.push(ne(bookings.id, excludeBookingId));

  const rows = await db
    .select({
      id: bookings.id,
      bookingCode: bookings.bookingCode,
      checkIn: bookings.checkIn,
      checkOut: bookings.checkOut,
    })
    .from(bookings)
    .where(and(...filters));

  return rows;
}
