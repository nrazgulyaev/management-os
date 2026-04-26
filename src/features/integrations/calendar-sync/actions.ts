"use server";

import { revalidatePath } from "next/cache";
import { differenceInCalendarDays } from "date-fns";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  bookingConflicts,
  channelCalendarEvents,
  channelCalendarFeeds,
} from "@/lib/db/schema/integrations";
import { bookings } from "@/lib/db/schema/bookings";
import { villas } from "@/lib/db/schema/projects";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requirePermission } from "@/features/auth/permissions";
import {
  calendarEventIdSchema,
  conflictIdSchema,
  createCalendarFeedSchema,
  feedIdSchema,
} from "./schema";
import { detectBookingConflicts } from "./services";
import { parseIcsCalendar, type IcsRawEvent } from "./ical";
import type { ActionResult } from "@/features/projects/actions";

// -----------------------------------------------------------------------------
// Feed CRUD
// -----------------------------------------------------------------------------

export async function createCalendarFeedAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("integrations.write");
  const parsed = createCalendarFeedSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please review the form.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const d = parsed.data;

  const [row] = await db
    .insert(channelCalendarFeeds)
    .values({
      villaId: d.villaId,
      projectId: d.projectId ?? null,
      bookingChannelId: d.bookingChannelId ?? null,
      feedName: d.feedName,
      feedUrl: d.feedUrl,
      feedType: d.feedType,
      syncIntervalMinutes: d.syncIntervalMinutes ?? 180,
      createdBy: me?.id ?? null,
      status: "active",
    })
    .returning({ id: channelCalendarFeeds.id });

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "integrations.calendar_feed.create",
    entityType: "channel_calendar_feed",
    entityId: row.id,
    after: { feedName: d.feedName, feedType: d.feedType, villaId: d.villaId },
  });

  revalidatePath("/dashboard/integrations/calendar-feeds");
  return { ok: true, redirectTo: `/dashboard/integrations/calendar-feeds/${row.id}` };
}

async function setFeedStatus(
  formData: FormData,
  next: "active" | "paused" | "archived",
): Promise<ActionResult> {
  await requirePermission("integrations.write");
  const parsed = feedIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Missing feed id." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();

  const [before] = await db
    .select()
    .from(channelCalendarFeeds)
    .where(eq(channelCalendarFeeds.id, parsed.data.id))
    .limit(1);
  if (!before) return { ok: false, error: "Feed not found." };
  if (before.status === next) return { ok: true };

  await db
    .update(channelCalendarFeeds)
    .set({ status: next })
    .where(eq(channelCalendarFeeds.id, parsed.data.id));
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: `integrations.calendar_feed.${next}`,
    entityType: "channel_calendar_feed",
    entityId: parsed.data.id,
    before: { status: before.status },
    after: { status: next },
  });
  revalidatePath("/dashboard/integrations/calendar-feeds");
  revalidatePath(`/dashboard/integrations/calendar-feeds/${parsed.data.id}`);
  return { ok: true };
}

export async function pauseCalendarFeedAction(
  _p: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  return setFeedStatus(fd, "paused");
}
export async function resumeCalendarFeedAction(
  _p: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  return setFeedStatus(fd, "active");
}
export async function archiveCalendarFeedAction(
  _p: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  return setFeedStatus(fd, "archived");
}

// -----------------------------------------------------------------------------
// Sync — fetch + parse + upsert events + conflict detection
// -----------------------------------------------------------------------------

export interface SyncFeedResult {
  feedId: string;
  fetched: number;
  inserted: number;
  updated: number;
  cancelled: number;
  conflicts: number;
  error?: string;
}

/**
 * Fetch a single feed and process its VEVENTs. Side-effects: upsert
 * `channel_calendar_events`, mark stale events as `cancelled`, run conflict
 * detection, update feed last_synced_at / last_error metadata. Returns a
 * structured summary so the UI can show a meaningful toast.
 */
export async function syncCalendarFeed(feedId: string): Promise<SyncFeedResult> {
  const db = getDb();
  if (!db) return { feedId, fetched: 0, inserted: 0, updated: 0, cancelled: 0, conflicts: 0, error: "DB not configured" };

  const [feed] = await db
    .select()
    .from(channelCalendarFeeds)
    .where(eq(channelCalendarFeeds.id, feedId))
    .limit(1);
  if (!feed) {
    return { feedId, fetched: 0, inserted: 0, updated: 0, cancelled: 0, conflicts: 0, error: "feed not found" };
  }
  if (feed.status === "archived") {
    return { feedId, fetched: 0, inserted: 0, updated: 0, cancelled: 0, conflicts: 0, error: "feed archived" };
  }

  const now = new Date();
  let icsText: string;
  try {
    const res = await fetch(feed.feedUrl, {
      cache: "no-store",
      headers: { "User-Agent": "Arconique-Management-OS/0.1" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    icsText = await res.text();
  } catch (e) {
    const message = e instanceof Error ? e.message : "fetch failed";
    await db
      .update(channelCalendarFeeds)
      .set({
        status: "error",
        lastSyncedAt: now,
        lastErrorAt: now,
        lastError: message.slice(0, 500),
      })
      .where(eq(channelCalendarFeeds.id, feed.id));
    return {
      feedId,
      fetched: 0,
      inserted: 0,
      updated: 0,
      cancelled: 0,
      conflicts: 0,
      error: message,
    };
  }

  const parsed = parseIcsCalendar(icsText);
  const seenUids = new Set<string>();
  let inserted = 0;
  let updated = 0;
  let conflicts = 0;

  // Upsert each VEVENT.
  for (const ev of parsed.events) {
    seenUids.add(ev.uid);
    const result = await upsertEventForFeed(feed.id, feed.villaId, ev);
    if (result === "inserted") inserted++;
    if (result === "updated") updated++;
    if (result === "conflict") conflicts++;
  }

  // Mark events that disappeared from the feed as cancelled.
  let cancelled = 0;
  if (parsed.events.length > 0) {
    const existing = await db
      .select({ id: channelCalendarEvents.id, externalUid: channelCalendarEvents.externalUid })
      .from(channelCalendarEvents)
      .where(eq(channelCalendarEvents.feedId, feed.id));
    for (const row of existing) {
      if (!seenUids.has(row.externalUid)) {
        await db
          .update(channelCalendarEvents)
          .set({ status: "cancelled" })
          .where(eq(channelCalendarEvents.id, row.id));
        cancelled++;
      }
    }
  }

  await db
    .update(channelCalendarFeeds)
    .set({
      status: parsed.errors.length > 0 ? "error" : "active",
      lastSyncedAt: now,
      lastSuccessAt: parsed.errors.length === 0 ? now : feed.lastSuccessAt,
      lastErrorAt: parsed.errors.length > 0 ? now : feed.lastErrorAt,
      lastError:
        parsed.errors.length > 0
          ? parsed.errors
              .map((e) => `${e.reason}${e.near ? ` (${e.near})` : ""}`)
              .join("; ")
              .slice(0, 500)
          : null,
    })
    .where(eq(channelCalendarFeeds.id, feed.id));

  return {
    feedId: feed.id,
    fetched: parsed.events.length,
    inserted,
    updated,
    cancelled,
    conflicts,
  };
}

async function upsertEventForFeed(
  feedId: string,
  villaId: string,
  ev: IcsRawEvent,
): Promise<"inserted" | "updated" | "conflict"> {
  const db = getDb();
  if (!db) return "updated";
  const now = new Date();

  const [existing] = await db
    .select()
    .from(channelCalendarEvents)
    .where(
      and(
        eq(channelCalendarEvents.feedId, feedId),
        eq(channelCalendarEvents.externalUid, ev.uid),
      ),
    )
    .limit(1);

  if (existing) {
    const datesChanged = existing.checkIn !== ev.dtStart || existing.checkOut !== ev.dtEnd;
    await db
      .update(channelCalendarEvents)
      .set({
        externalSummary: ev.summary ?? null,
        externalDescription: ev.description ?? null,
        externalLocation: ev.location ?? null,
        checkIn: ev.dtStart,
        checkOut: ev.dtEnd,
        rawIcs: ev.raw,
        lastSeenAt: now,
        status: existing.status === "cancelled" ? "active" : existing.status,
      })
      .where(eq(channelCalendarEvents.id, existing.id));
    if (datesChanged) {
      await scoreConflict(existing.id, villaId, ev);
      return "conflict";
    }
    return "updated";
  }

  const [inserted] = await db
    .insert(channelCalendarEvents)
    .values({
      feedId,
      externalUid: ev.uid,
      externalSummary: ev.summary ?? null,
      externalDescription: ev.description ?? null,
      externalLocation: ev.location ?? null,
      checkIn: ev.dtStart,
      checkOut: ev.dtEnd,
      rawIcs: ev.raw,
      status: "active",
    })
    .returning({ id: channelCalendarEvents.id });

  // New event — score it for overlap with existing bookings.
  const conflict = await scoreConflict(inserted.id, villaId, ev);
  return conflict ? "conflict" : "inserted";
}

async function scoreConflict(
  eventId: string,
  villaId: string,
  ev: IcsRawEvent,
): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const overlaps = await detectBookingConflicts(villaId, ev.dtStart, ev.dtEnd);
  if (overlaps.length === 0) {
    await db
      .update(channelCalendarEvents)
      .set({ conflictStatus: "none", conflictNotes: null })
      .where(eq(channelCalendarEvents.id, eventId));
    return false;
  }

  const overlap = overlaps[0];
  await db
    .update(channelCalendarEvents)
    .set({
      conflictStatus: "overlap",
      conflictNotes: `Overlaps booking ${overlap.bookingCode} (${overlap.checkIn} → ${overlap.checkOut})`,
    })
    .where(eq(channelCalendarEvents.id, eventId));

  // Avoid duplicate conflict rows for the same event.
  const [existingConflict] = await db
    .select()
    .from(bookingConflicts)
    .where(
      and(
        eq(bookingConflicts.calendarEventId, eventId),
        eq(bookingConflicts.status, "open"),
      ),
    )
    .limit(1);
  if (!existingConflict) {
    await db.insert(bookingConflicts).values({
      villaId,
      bookingId: overlap.id,
      calendarEventId: eventId,
      conflictType: "overlap",
      severity: "warning",
      description: `Calendar event "${ev.summary ?? ev.uid}" (${ev.dtStart} → ${ev.dtEnd}) overlaps existing booking ${overlap.bookingCode}.`,
    });
  }
  return true;
}

export async function syncAllActiveCalendarFeedsAction(): Promise<
  ActionResult & { results?: SyncFeedResult[] }
> {
  await requirePermission("bookings.sync");
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const feeds = await db
    .select({ id: channelCalendarFeeds.id })
    .from(channelCalendarFeeds)
    .where(eq(channelCalendarFeeds.status, "active"));

  const results: SyncFeedResult[] = [];
  for (const f of feeds) {
    results.push(await syncCalendarFeed(f.id));
  }

  const me = await getCurrentAppUser();
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "integrations.calendar.sync_all",
    entityType: "channel_calendar_feed",
    entityId: null,
    after: { count: feeds.length },
  });

  revalidatePath("/dashboard/integrations");
  revalidatePath("/dashboard/integrations/calendar-feeds");
  revalidatePath("/dashboard/integrations/calendar-events");
  revalidatePath("/dashboard/integrations/conflicts");
  revalidatePath("/dashboard/bookings/sync");
  return { ok: true, results };
}

export async function syncCalendarFeedAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult & { result?: SyncFeedResult }> {
  await requirePermission("bookings.sync");
  const parsed = feedIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Missing feed id." };
  const result = await syncCalendarFeed(parsed.data.id);
  if (result.error) return { ok: false, error: result.error };

  revalidatePath(`/dashboard/integrations/calendar-feeds/${parsed.data.id}`);
  revalidatePath("/dashboard/integrations/calendar-feeds");
  return { ok: true, result };
}

// -----------------------------------------------------------------------------
// Materialise an event as a booking
// -----------------------------------------------------------------------------

import { runBookingAutomationForBooking } from "@/features/booking-automation/services";

export async function materialiseCalendarEventAsBooking(
  eventId: string,
): Promise<{ bookingId?: string; error?: string }> {
  const db = getDb();
  if (!db) return { error: "Database is not configured." };

  const [ev] = await db
    .select()
    .from(channelCalendarEvents)
    .where(eq(channelCalendarEvents.id, eventId))
    .limit(1);
  if (!ev) return { error: "Calendar event not found." };
  if (ev.bookingId) return { bookingId: ev.bookingId };

  const [feed] = await db
    .select()
    .from(channelCalendarFeeds)
    .where(eq(channelCalendarFeeds.id, ev.feedId))
    .limit(1);
  if (!feed) return { error: "Source feed missing." };

  const [villa] = await db
    .select()
    .from(villas)
    .where(eq(villas.id, feed.villaId))
    .limit(1);
  if (!villa) return { error: "Villa missing." };

  // De-dup by source_reference.
  const [existing] = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(
      and(
        eq(bookings.villaId, feed.villaId),
        eq(bookings.sourceReference, ev.externalUid),
      ),
    )
    .limit(1);

  let bookingId: string;
  if (existing) {
    bookingId = existing.id;
  } else {
    const nights = Math.max(
      1,
      differenceInCalendarDays(new Date(ev.checkOut), new Date(ev.checkIn)),
    );
    const bookingCode = `EXT-${ev.externalUid.slice(0, 16)}`;
    const [row] = await db
      .insert(bookings)
      .values({
        villaId: feed.villaId,
        channelId: feed.bookingChannelId,
        guestId: null,
        bookingCode,
        sourceReference: ev.externalUid,
        status: "confirmed",
        checkIn: ev.checkIn,
        checkOut: ev.checkOut,
        nights,
        currency: "USD",
        // Channel iCal feeds rarely include money. Leave amounts at zero —
        // we never invent financial values.
        grossAmount: "0",
        cleaningFeeAmount: "0",
        channelFeeAmount: "0",
        paymentFeeAmount: "0",
        netExpectedAmount: "0",
        notes: ev.externalSummary
          ? `Imported from calendar feed: ${ev.externalSummary}`
          : `Imported from calendar feed (${feed.feedName})`,
      })
      .returning({ id: bookings.id });
    bookingId = row.id;
  }

  await db
    .update(channelCalendarEvents)
    .set({ bookingId })
    .where(eq(channelCalendarEvents.id, ev.id));

  // Trigger booking automation (idempotent — already-run rules are skipped).
  try {
    await runBookingAutomationForBooking(bookingId);
  } catch (e) {
    // Automation failures are non-fatal — log and continue.
    console.error("booking automation failed", e);
  }

  return { bookingId };
}

export async function materialiseCalendarEventAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("bookings.conflict.manage");
  const parsed = calendarEventIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Missing event id." };
  const result = await materialiseCalendarEventAsBooking(parsed.data.id);
  if (result.error) return { ok: false, error: result.error };

  const me = await getCurrentAppUser();
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "integrations.calendar.materialise_event",
    entityType: "channel_calendar_event",
    entityId: parsed.data.id,
    after: { bookingId: result.bookingId ?? null },
  });

  revalidatePath("/dashboard/integrations/calendar-events");
  revalidatePath("/dashboard/bookings");
  return { ok: true };
}

export async function ignoreCalendarEventAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("bookings.conflict.manage");
  const parsed = calendarEventIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Missing event id." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();

  await db
    .update(channelCalendarEvents)
    .set({ status: "ignored", conflictStatus: "none" })
    .where(eq(channelCalendarEvents.id, parsed.data.id));
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "integrations.calendar.ignore_event",
    entityType: "channel_calendar_event",
    entityId: parsed.data.id,
  });
  revalidatePath("/dashboard/integrations/calendar-events");
  return { ok: true };
}

// -----------------------------------------------------------------------------
// Conflict resolution
// -----------------------------------------------------------------------------

export async function resolveBookingConflictAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("bookings.conflict.manage");
  const parsed = conflictIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Missing conflict id." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();

  const [before] = await db
    .select()
    .from(bookingConflicts)
    .where(eq(bookingConflicts.id, parsed.data.id))
    .limit(1);
  if (!before) return { ok: false, error: "Conflict not found." };

  await db
    .update(bookingConflicts)
    .set({
      status: "resolved",
      resolvedBy: me?.id ?? null,
      resolvedAt: new Date(),
    })
    .where(eq(bookingConflicts.id, parsed.data.id));

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "integrations.conflict.resolve",
    entityType: "booking_conflict",
    entityId: parsed.data.id,
    before: { status: before.status },
    after: { status: "resolved" },
  });

  revalidatePath("/dashboard/integrations/conflicts");
  return { ok: true };
}

export async function acknowledgeBookingConflictAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("bookings.conflict.manage");
  const parsed = conflictIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Missing conflict id." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  await db
    .update(bookingConflicts)
    .set({ status: "acknowledged" })
    .where(eq(bookingConflicts.id, parsed.data.id));
  revalidatePath("/dashboard/integrations/conflicts");
  return { ok: true };
}
