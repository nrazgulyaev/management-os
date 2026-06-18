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
import { villas, projects } from "@/lib/db/schema/projects";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requirePermission } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import { assertPublicUrl } from "@/lib/net/safe-url";
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
  const organizationId = await requireOrgId();
  const me = await getCurrentAppUser();
  const d = parsed.data;

  // TENANCY: a feed SSRF-fetches and materialises events/bookings against its
  // villa. Verify the client-supplied villa belongs to the caller's org
  // (villa → project.organization_id) before attaching, and stamp the org on
  // the row so all downstream reads/writes are scoped.
  const [villaOk] = await db
    .select({ id: villas.id })
    .from(villas)
    .innerJoin(projects, eq(projects.id, villas.projectId))
    .where(
      and(
        eq(villas.id, d.villaId),
        eq(projects.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!villaOk) return { ok: false, error: "Villa not found." };

  const [row] = await db
    .insert(channelCalendarFeeds)
    .values({
      organizationId,
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

// Stage 10.E.5 — edit a feed's metadata. Re-validates against
// createCalendarFeedSchema; mutates feedName / feedUrl / feedType /
// syncIntervalMinutes / bookingChannelId. Villa / project remain
// editable (rare but legitimate — a feed may be re-pointed at a new
// villa during reorgs). Status transitions stay on pause/resume/
// archive actions.
export async function editCalendarFeedAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("integrations.write");
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Missing feed id." };
  const parsed = createCalendarFeedSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please review the form.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const organizationId = await requireOrgId();
  const me = await getCurrentAppUser();
  const d = parsed.data;

  // TENANCY: verify the (re-pointable) villa belongs to the caller's org so a
  // feed can't be aimed at another tenant's villa.
  const [villaOk] = await db
    .select({ id: villas.id })
    .from(villas)
    .innerJoin(projects, eq(projects.id, villas.projectId))
    .where(
      and(
        eq(villas.id, d.villaId),
        eq(projects.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!villaOk) return { ok: false, error: "Villa not found." };

  // Scope the UPDATE to the caller's org — a cross-org feed id reads as "not
  // found" and can never have its URL / villa re-written.
  const [row] = await db
    .update(channelCalendarFeeds)
    .set({
      villaId: d.villaId,
      projectId: d.projectId ?? null,
      bookingChannelId: d.bookingChannelId ?? null,
      feedName: d.feedName,
      feedUrl: d.feedUrl,
      feedType: d.feedType,
      syncIntervalMinutes: d.syncIntervalMinutes ?? 180,
    })
    .where(
      and(
        eq(channelCalendarFeeds.id, id),
        eq(channelCalendarFeeds.organizationId, organizationId),
      ),
    )
    .returning({ id: channelCalendarFeeds.id });
  if (!row) return { ok: false, error: "Feed not found." };
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "integrations.calendar_feed.update",
    entityType: "channel_calendar_feed",
    entityId: id,
    after: { feedName: d.feedName, feedType: d.feedType, feedUrl: d.feedUrl },
  });
  revalidatePath("/dashboard/integrations/calendar-feeds");
  return { ok: true };
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
  const organizationId = await requireOrgId();
  const me = await getCurrentAppUser();

  const [before] = await db
    .select()
    .from(channelCalendarFeeds)
    .where(
      and(
        eq(channelCalendarFeeds.id, parsed.data.id),
        eq(channelCalendarFeeds.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!before) return { ok: false, error: "Feed not found." };
  if (before.status === next) return { ok: true };

  await db
    .update(channelCalendarFeeds)
    .set({ status: next })
    .where(
      and(
        eq(channelCalendarFeeds.id, parsed.data.id),
        eq(channelCalendarFeeds.organizationId, organizationId),
      ),
    );
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
    // SSRF guard: re-validate at fetch time (the stored URL could have been
    // written before this guard existed). SsrfError flows to the catch below
    // → feed marked status='error', same as any fetch failure.
    await assertPublicUrl(feed.feedUrl);
    const res = await fetch(feed.feedUrl, {
      cache: "no-store",
      headers: { "User-Agent": "Arconique-Management-OS/0.1" },
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
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
    const result = await upsertEventForFeed(
      feed.id,
      feed.villaId,
      feed.organizationId,
      ev,
    );
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
  organizationId: string | null,
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
      await scoreConflict(existing.id, villaId, organizationId, ev);
      return "conflict";
    }
    return "updated";
  }

  const [inserted] = await db
    .insert(channelCalendarEvents)
    .values({
      organizationId,
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
  const conflict = await scoreConflict(inserted.id, villaId, organizationId, ev);
  return conflict ? "conflict" : "inserted";
}

async function scoreConflict(
  eventId: string,
  villaId: string,
  organizationId: string | null,
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
      organizationId,
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
  // SESSION-RESOLUTION-1 P5 — return friendly errors instead of letting
  // requirePermission throw bubble up to the framework "Server Components
  // render error" banner. The caller renders the `ok: false` result inline.
  try {
    await requirePermission("bookings.sync");
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Permission denied";
    return { ok: false, error: msg };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  // TENANCY: scope "sync all" to the caller's org. Without this a single tenant
  // clicking "Sync all" would fetch/upsert/rewrite EVERY org's feeds + events
  // platform-wide. The cron (runCalendarSyncJob) is the all-orgs path; this
  // button is per-tenant.
  const organizationId = await requireOrgId();
  const feeds = await db
    .select({ id: channelCalendarFeeds.id })
    .from(channelCalendarFeeds)
    .where(
      and(
        eq(channelCalendarFeeds.status, "active"),
        eq(channelCalendarFeeds.organizationId, organizationId),
      ),
    );

  // Per-feed try/catch so one bad feed (malformed iCal, network timeout,
  // PG constraint violation in the upsert path, etc.) doesn't kill the
  // entire run. Every iteration produces a SyncFeedResult — successful or
  // errored — so the UI can show a per-row status summary.
  const results: SyncFeedResult[] = [];
  for (const f of feeds) {
    try {
      results.push(await syncCalendarFeed(f.id));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({
        feedId: f.id,
        fetched: 0,
        inserted: 0,
        updated: 0,
        cancelled: 0,
        conflicts: 0,
        error: `Unhandled: ${message.slice(0, 200)}`,
      });
    }
  }

  const me = await getCurrentAppUser().catch(() => null);
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "integrations.calendar.sync_all",
    entityType: "channel_calendar_feed",
    entityId: null,
    after: {
      count: feeds.length,
      succeeded: results.filter((r) => !r.error).length,
      failed: results.filter((r) => r.error).length,
    },
  }).catch(() => null);

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
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  // TENANCY: scope the tenant-facing entry point (the internal syncCalendarFeed
  // is also called by the cron per-feed, so the org check lives here). Verify
  // the feed belongs to the caller's org before fetching/rewriting it.
  const organizationId = await requireOrgId();
  const [ownFeed] = await db
    .select({ id: channelCalendarFeeds.id })
    .from(channelCalendarFeeds)
    .where(
      and(
        eq(channelCalendarFeeds.id, parsed.data.id),
        eq(channelCalendarFeeds.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!ownFeed) return { ok: false, error: "Feed not found." };

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

  // Org for the materialised booking. The feed carries it (backfilled),
  // but the column is nullable — fall back to the villa's project org.
  let organizationId = feed.organizationId;
  if (!organizationId) {
    const [proj] = await db
      .select({ organizationId: projects.organizationId })
      .from(projects)
      .where(eq(projects.id, villa.projectId))
      .limit(1);
    organizationId = proj?.organizationId ?? null;
  }
  if (!organizationId) return { error: "Cannot resolve organization for feed." };

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
        organizationId,
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
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  // TENANCY: the event's org is derived from its feed/villa, not the caller —
  // so without this gate a tenant could pass another org's event id and create
  // a confirmed booking + stamp event.bookingId in that other org. Require the
  // event's parent feed to belong to the caller's org before materialising.
  const organizationId = await requireOrgId();
  const [ownEvent] = await db
    .select({ id: channelCalendarEvents.id })
    .from(channelCalendarEvents)
    .innerJoin(
      channelCalendarFeeds,
      eq(channelCalendarFeeds.id, channelCalendarEvents.feedId),
    )
    .where(
      and(
        eq(channelCalendarEvents.id, parsed.data.id),
        eq(channelCalendarFeeds.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!ownEvent) return { ok: false, error: "Calendar event not found." };

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
  const organizationId = await requireOrgId();
  const me = await getCurrentAppUser();

  // TENANCY: scope the UPDATE so a tenant can't mark another org's event as
  // ignored. Match on the event's own org and its parent feed's org so the
  // guard holds even where one column was left unthreaded on legacy rows.
  const [scoped] = await db
    .select({ id: channelCalendarEvents.id })
    .from(channelCalendarEvents)
    .innerJoin(
      channelCalendarFeeds,
      eq(channelCalendarFeeds.id, channelCalendarEvents.feedId),
    )
    .where(
      and(
        eq(channelCalendarEvents.id, parsed.data.id),
        eq(channelCalendarFeeds.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!scoped) return { ok: false, error: "Calendar event not found." };

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
  const organizationId = await requireOrgId();
  const me = await getCurrentAppUser();

  const [before] = await db
    .select()
    .from(bookingConflicts)
    .where(
      and(
        eq(bookingConflicts.id, parsed.data.id),
        eq(bookingConflicts.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!before) return { ok: false, error: "Conflict not found." };

  await db
    .update(bookingConflicts)
    .set({
      status: "resolved",
      resolvedBy: me?.id ?? null,
      resolvedAt: new Date(),
    })
    .where(
      and(
        eq(bookingConflicts.id, parsed.data.id),
        eq(bookingConflicts.organizationId, organizationId),
      ),
    );

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
  const organizationId = await requireOrgId();

  const [before] = await db
    .select({ id: bookingConflicts.id })
    .from(bookingConflicts)
    .where(
      and(
        eq(bookingConflicts.id, parsed.data.id),
        eq(bookingConflicts.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!before) return { ok: false, error: "Conflict not found." };

  await db
    .update(bookingConflicts)
    .set({ status: "acknowledged" })
    .where(
      and(
        eq(bookingConflicts.id, parsed.data.id),
        eq(bookingConflicts.organizationId, organizationId),
      ),
    );
  revalidatePath("/dashboard/integrations/conflicts");
  return { ok: true };
}
