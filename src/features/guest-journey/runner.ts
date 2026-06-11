import "server-only";

import { and, eq, isNull, lte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  guestJourneyEvents,
  guestJourneyRules,
  guestJourneyRuns,
  guestJourneySuggestions,
  guestReviewRequests,
} from "@/lib/db/schema/guest-journey";
import { bookings } from "@/lib/db/schema/bookings";
import { guestServices } from "@/lib/db/schema/guest-services";
import { queueNotification } from "@/features/notifications/services";
import {
  buildNotificationDedupeKey,
  calculateScheduledFor,
  resolveAnchorDate,
  ruleAppliesToBooking,
  shouldSkipRule,
  type BookingContext,
  type RuleShape,
} from "./rules-pure";
import {
  buildSuggestionFromRule,
  publicSuggestionLabel,
  type SuggestionType,
} from "./suggestions-pure";
import {
  buildReviewRequestDedupeKey,
  buildReviewRequestUrl,
  pickReviewChannelForBooking,
  reviewRequestCopy,
  shouldRequestReview,
  type ReviewChannel,
} from "./review-pure";
import {
  getActiveStayTokenForBooking,
  getBookingForJourney,
  ruleToShape,
} from "./services";

/**
 * The journey runner — deterministic + idempotent.
 *
 * - `ensureJourneyRunsForBooking` materializes one `guest_journey_runs`
 *   row per (booking, active rule) pair, computing `scheduled_for`
 *   from the booking's anchor + the rule's offset.
 * - `runDueGuestJourneyRules` walks pending runs whose
 *   `scheduled_for <= now` and dispatches them.
 * - Each run dispatch may produce: an in-app notification, a
 *   guest-visible suggestion, a journey event, or a review request —
 *   all using stable dedupe keys so re-runs are no-ops.
 */

interface DispatchOutcome {
  status: "executed" | "skipped" | "failed";
  skipReason?: string;
  errorMessage?: string;
  suggestionId?: string;
  notificationQueueId?: string;
}

export async function ensureJourneyRunsForBooking(
  bookingId: string,
): Promise<{ created: number; updated: number; skipped: number }> {
  const db = getDb();
  if (!db) return { created: 0, updated: 0, skipped: 0 };
  const booking = await getBookingForJourney(bookingId);
  if (!booking) return { created: 0, updated: 0, skipped: 0 };
  const stayToken = await getActiveStayTokenForBooking(bookingId);

  const ctx: BookingContext = {
    id: booking.id,
    villaId: booking.villaId,
    projectId: booking.projectId,
    channelKey: booking.channelKey,
    checkIn: booking.checkIn,
    checkOut: booking.checkOut,
    status: booking.status,
    bookingCreatedAt: booking.bookingCreatedAt,
    stayTokenIssuedAt: stayToken?.createdAt ?? null,
  };

  const activeRules = await db
    .select()
    .from(guestJourneyRules)
    .where(eq(guestJourneyRules.status, "active"));

  let created = 0;
  let updated = 0;
  let skipped = 0;
  for (const rule of activeRules) {
    const shape = ruleToShape(rule);
    if (!ruleAppliesToBooking(shape, ctx)) {
      skipped++;
      continue;
    }
    const anchor = resolveAnchorDate(ctx, shape.triggerAnchor);
    const scheduledFor = calculateScheduledFor(anchor, shape.offsetMinutes);

    const [existing] = await db
      .select()
      .from(guestJourneyRuns)
      .where(
        and(
          eq(guestJourneyRuns.bookingId, booking.id),
          eq(guestJourneyRuns.ruleId, rule.id),
        ),
      )
      .limit(1);
    if (existing) {
      if (
        existing.status === "pending" &&
        existing.scheduledFor?.getTime() !== scheduledFor?.getTime()
      ) {
        await db
          .update(guestJourneyRuns)
          .set({
            scheduledFor,
            stayTokenId: stayToken?.id ?? null,
            updatedAt: new Date(),
          })
          .where(eq(guestJourneyRuns.id, existing.id));
        updated++;
      }
      continue;
    }
    await db.insert(guestJourneyRuns).values({
      bookingId: booking.id,
      stayTokenId: stayToken?.id ?? null,
      ruleId: rule.id,
      scheduledFor,
      status: "pending",
    });
    created++;
  }
  return { created, updated, skipped };
}

export interface DueRunRow {
  runId: string;
  bookingId: string;
  ruleId: string;
  scheduledFor: Date | null;
}

export async function listDueJourneyRuns(
  now: Date = new Date(),
  limit = 100,
): Promise<DueRunRow[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select({
      runId: guestJourneyRuns.id,
      bookingId: guestJourneyRuns.bookingId,
      ruleId: guestJourneyRuns.ruleId,
      scheduledFor: guestJourneyRuns.scheduledFor,
    })
    .from(guestJourneyRuns)
    .where(
      and(
        eq(guestJourneyRuns.status, "pending"),
        lte(guestJourneyRuns.scheduledFor, now),
      ),
    )
    .orderBy(guestJourneyRuns.scheduledFor)
    .limit(limit);
  return rows
    .filter((r) => r.bookingId && r.ruleId)
    .map((r) => ({
      runId: r.runId,
      bookingId: r.bookingId!,
      ruleId: r.ruleId!,
      scheduledFor: r.scheduledFor,
    }));
}

/**
 * Dispatch a single (booking, rule) run. Idempotent: if the run is
 * already executed/skipped/failed we return the row as-is.
 */
export async function runGuestJourneyRuleForBooking(
  bookingId: string,
  ruleId: string,
  now: Date = new Date(),
): Promise<DispatchOutcome | null> {
  const db = getDb();
  if (!db) return null;

  const [run] = await db
    .select()
    .from(guestJourneyRuns)
    .where(
      and(
        eq(guestJourneyRuns.bookingId, bookingId),
        eq(guestJourneyRuns.ruleId, ruleId),
      ),
    )
    .limit(1);
  if (!run) return null;
  if (run.status !== "pending") {
    return {
      status: run.status as DispatchOutcome["status"],
      skipReason: run.skipReason ?? undefined,
      errorMessage: run.errorMessage ?? undefined,
      suggestionId: run.suggestionId ?? undefined,
      notificationQueueId: run.notificationQueueId ?? undefined,
    };
  }

  const [rule] = await db
    .select()
    .from(guestJourneyRules)
    .where(eq(guestJourneyRules.id, ruleId))
    .limit(1);
  const booking = await getBookingForJourney(bookingId);
  if (!rule || !booking) {
    await markRunSkipped(run.id, "missing_rule_or_booking");
    return { status: "skipped", skipReason: "missing_rule_or_booking" };
  }
  const stayToken = await getActiveStayTokenForBooking(bookingId);

  const ctx: BookingContext = {
    id: booking.id,
    villaId: booking.villaId,
    projectId: booking.projectId,
    channelKey: booking.channelKey,
    checkIn: booking.checkIn,
    checkOut: booking.checkOut,
    status: booking.status,
    bookingCreatedAt: booking.bookingCreatedAt,
    stayTokenIssuedAt: stayToken?.createdAt ?? null,
  };
  const shape = ruleToShape(rule);
  if (!ruleAppliesToBooking(shape, ctx)) {
    await markRunSkipped(run.id, "rule_does_not_apply");
    return { status: "skipped", skipReason: "rule_does_not_apply" };
  }
  const anchor = resolveAnchorDate(ctx, shape.triggerAnchor);
  const scheduledFor = calculateScheduledFor(anchor, shape.offsetMinutes);
  const skip = shouldSkipRule(shape, ctx, scheduledFor, now);
  if (skip) {
    await markRunSkipped(run.id, skip);
    return { status: "skipped", skipReason: skip };
  }

  // 1. Create / upsert the suggestion if the rule has a suggestion
  //    type. Suggestions persist beyond the run so the guest can see
  //    them inside /stay/[token] until they expire.
  let suggestionId: string | undefined;
  if (rule.suggestionType) {
    const serviceKey = await fetchServiceKey(rule.serviceId);
    const draft = buildSuggestionFromRule(
      shape as RuleShape & { payloadJson?: { title?: string } | null },
      {
        ...ctx,
        stayTokenId: stayToken?.id ?? null,
        rawToken: null, // raw token is never persisted server-side; CTAs are token-rewritten on the guest page
        serviceKey,
      },
      scheduledFor,
      computeExpiry(rule.journeyStage as RuleShape["journeyStage"], scheduledFor, ctx),
    );
    const [existingSugg] = await db
      .select()
      .from(guestJourneySuggestions)
      .where(
        and(
          eq(guestJourneySuggestions.bookingId, booking.id),
          eq(guestJourneySuggestions.ruleId, rule.id),
        ),
      )
      .limit(1);
    if (existingSugg) {
      suggestionId = existingSugg.id;
    } else {
      const [inserted] = await db
        .insert(guestJourneySuggestions)
        .values({
          ...draft,
          ownerVisible: false,
        })
        .returning({ id: guestJourneySuggestions.id });
      suggestionId = inserted?.id;
    }
  }

  // 2. Queue the notification if the rule asks for one and we have a
  //    template. Default to in-app for the demo platform.
  let notificationQueueId: string | undefined;
  if (rule.templateKey && rule.channel !== "none") {
    const labels = publicSuggestionLabel(
      (rule.suggestionType ?? "info") as SuggestionType,
    );
    const dedupeKey = buildNotificationDedupeKey(
      booking.id,
      rule.id,
      scheduledFor,
    );
    const result = await queueNotification({
      recipientType: "guest",
      recipientId: stayToken?.id ?? undefined,
      organizationId: booking.organizationId,
      channel: rule.channel === "email" ? "email" : "in_app",
      templateKey: rule.templateKey,
      title: labels.title,
      body: labels.body ?? labels.title,
      payload: {
        bookingCode: booking.bookingCode,
        suggestionType: rule.suggestionType ?? "info",
        suggestionId: suggestionId ?? null,
      },
      priority: normalisePriority(rule.priority),
      dedupeKey,
      scheduledFor: scheduledFor ? scheduledFor.toISOString() : undefined,
    });
    if (result?.notificationId) {
      notificationQueueId = result.notificationId;
    }
  }

  // 3. Append a journey event so the timeline reflects the dispatch.
  await db.insert(guestJourneyEvents).values({
    bookingId: booking.id,
    stayTokenId: stayToken?.id ?? null,
    eventType: "service_suggested",
    sourceType: "rule",
    sourceId: rule.id,
    title: rule.name,
    description: rule.description ?? null,
    severity: "info",
    ownerVisible: false,
    metadataJson: {
      ruleKey: rule.ruleKey,
      stage: rule.journeyStage,
      offsetMinutes: rule.offsetMinutes,
    },
  });

  // 4. Mark the run executed.
  await db
    .update(guestJourneyRuns)
    .set({
      status: "executed",
      executedAt: now,
      suggestionId: suggestionId ?? null,
      notificationQueueId: notificationQueueId ?? null,
      updatedAt: now,
    })
    .where(eq(guestJourneyRuns.id, run.id));

  return {
    status: "executed",
    suggestionId,
    notificationQueueId,
  };
}

export async function runDueGuestJourneyRules(
  limit = 100,
  now: Date = new Date(),
): Promise<{ executed: number; skipped: number; failed: number }> {
  const due = await listDueJourneyRuns(now, limit);
  let executed = 0;
  let skipped = 0;
  let failed = 0;
  for (const row of due) {
    try {
      const out = await runGuestJourneyRuleForBooking(
        row.bookingId,
        row.ruleId,
        now,
      );
      if (!out) continue;
      if (out.status === "executed") executed++;
      else if (out.status === "skipped") skipped++;
      else failed++;
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : "unknown_error";
      const db = getDb();
      if (db) {
        await db
          .update(guestJourneyRuns)
          .set({
            status: "failed",
            errorMessage: message,
            executedAt: now,
            updatedAt: now,
          })
          .where(eq(guestJourneyRuns.id, row.runId));
      }
    }
  }
  return { executed, skipped, failed };
}

export async function generateJourneySuggestionsForBooking(
  bookingId: string,
): Promise<{ created: number }> {
  const db = getDb();
  if (!db) return { created: 0 };
  await ensureJourneyRunsForBooking(bookingId);
  const due = await db
    .select()
    .from(guestJourneyRuns)
    .where(
      and(
        eq(guestJourneyRuns.bookingId, bookingId),
        eq(guestJourneyRuns.status, "pending"),
      ),
    );
  let created = 0;
  for (const run of due) {
    if (!run.ruleId || !run.bookingId) continue;
    const out = await runGuestJourneyRuleForBooking(
      run.bookingId,
      run.ruleId,
      new Date(),
    );
    if (out?.suggestionId) created++;
  }
  return { created };
}

/**
 * Re-queue a notification for an existing suggestion (used when an
 * admin manually nudges a guest).
 */
export async function queueJourneyNotificationForSuggestion(
  suggestionId: string,
): Promise<{ notificationId: string | null; suppressed: boolean }> {
  const db = getDb();
  if (!db) return { notificationId: null, suppressed: true };
  const [s] = await db
    .select()
    .from(guestJourneySuggestions)
    .where(eq(guestJourneySuggestions.id, suggestionId))
    .limit(1);
  if (!s || !s.bookingId) return { notificationId: null, suppressed: true };
  const labels = publicSuggestionLabel(
    (s.suggestionType ?? "info") as SuggestionType,
  );
  const dedupeKey = `journey-suggestion:${s.id}`;
  const result = await queueNotification({
    recipientType: "guest",
    recipientId: s.stayTokenId ?? undefined,
    organizationId: (await fetchOrgIdForBooking(s.bookingId)) ?? undefined,
    channel: "in_app",
    templateKey: "guest_journey.in_app_suggestion",
    title: s.title ?? labels.title,
    body: s.body ?? labels.body ?? labels.title,
    payload: { suggestionId: s.id, suggestionType: s.suggestionType },
    priority: normalisePriority(s.priority),
    dedupeKey,
  });
  return {
    notificationId: result?.notificationId ?? null,
    suppressed: result?.status === "suppressed",
  };
}

/**
 * Create-or-update the post-stay review request for a booking. The
 * channel is picked deterministically from the booking's distribution
 * channel.
 */
export async function createReviewRequestForBooking(
  bookingId: string,
  now: Date = new Date(),
): Promise<{ id: string | null; status: string }> {
  const db = getDb();
  if (!db) return { id: null, status: "no_db" };
  const booking = await getBookingForJourney(bookingId);
  if (!booking) return { id: null, status: "no_booking" };
  if (!shouldRequestReview(booking, now)) {
    return { id: null, status: "not_eligible" };
  }
  const channel: ReviewChannel = pickReviewChannelForBooking(booking.channelKey);
  const stayToken = await getActiveStayTokenForBooking(bookingId);
  const url = buildReviewRequestUrl(channel, {
    bookingId: booking.id,
    bookingCode: booking.bookingCode,
    rawToken: null,
    externalReference: booking.externalReference ?? null,
  });

  const [existing] = await db
    .select()
    .from(guestReviewRequests)
    .where(
      and(
        eq(guestReviewRequests.bookingId, booking.id),
        eq(guestReviewRequests.channel, channel),
      ),
    )
    .limit(1);
  if (existing) {
    if (existing.status === "pending") {
      await db
        .update(guestReviewRequests)
        .set({ scheduledFor: now, updatedAt: now })
        .where(eq(guestReviewRequests.id, existing.id));
    }
    return { id: existing.id, status: existing.status };
  }
  const villaId = booking.villaId;
  const projectId = booking.projectId;
  const guestId = await fetchGuestIdForBooking(booking.id);
  const copy = reviewRequestCopy(channel);
  const [inserted] = await db
    .insert(guestReviewRequests)
    .values({
      bookingId: booking.id,
      guestId,
      villaId,
      projectId,
      channel,
      reviewTargetUrl: url,
      requestStage: "initial",
      status: "pending",
      scheduledFor: now,
    })
    .returning({ id: guestReviewRequests.id });
  if (!inserted) return { id: null, status: "insert_failed" };

  // Queue the notification — this is the actual nudge.
  const dedupeKey = buildReviewRequestDedupeKey(booking.id, channel, "initial");
  const result = await queueNotification({
    recipientType: "guest",
    recipientId: stayToken?.id ?? undefined,
    organizationId: booking.organizationId,
    channel: "in_app",
    templateKey:
      channel === "internal_survey"
        ? "guest_journey.review_request_direct"
        : "guest_journey.review_request_ota",
    title: copy.title,
    body: copy.body,
    payload: {
      bookingCode: booking.bookingCode,
      channel,
      reviewUrl: url,
    },
    priority: "normal",
    dedupeKey,
    scheduledFor: now.toISOString(),
  });
  await db
    .update(guestReviewRequests)
    .set({
      notificationQueueId: result?.notificationId ?? null,
      status: "sent",
      sentAt: now,
      updatedAt: now,
    })
    .where(eq(guestReviewRequests.id, inserted.id));
  return { id: inserted.id, status: "sent" };
}

export async function runPostStayReviewRequests(
  limit = 100,
  now: Date = new Date(),
): Promise<{ created: number; skipped: number }> {
  const db = getDb();
  if (!db) return { created: 0, skipped: 0 };
  // Pick checkouts in the last 14 days that have no review request
  // yet.
  const horizonIso = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const candidates = await db
    .select({
      id: bookings.id,
      checkOut: bookings.checkOut,
      status: bookings.status,
    })
    .from(bookings)
    .leftJoin(
      guestReviewRequests,
      eq(guestReviewRequests.bookingId, bookings.id),
    )
    .where(
      and(
        sql`${bookings.checkOut} >= ${horizonIso}`,
        sql`${bookings.checkOut} < ${nowIso(now)}`,
        isNull(guestReviewRequests.id),
      ),
    )
    .limit(limit);
  let created = 0;
  let skipped = 0;
  for (const b of candidates) {
    const out = await createReviewRequestForBooking(b.id, now);
    if (out.id) created++;
    else skipped++;
  }
  return { created, skipped };
}

async function fetchServiceKey(
  serviceId: string | null,
): Promise<string | null> {
  if (!serviceId) return null;
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .select({ key: guestServices.serviceKey })
    .from(guestServices)
    .where(eq(guestServices.id, serviceId))
    .limit(1);
  return row?.key ?? null;
}

async function fetchGuestIdForBooking(
  bookingId: string,
): Promise<string | null> {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .select({ guestId: bookings.guestId })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);
  return row?.guestId ?? null;
}

/** Org anchor for a booking — bookings.organization_id (NOT NULL since 0155). */
async function fetchOrgIdForBooking(
  bookingId: string,
): Promise<string | null> {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .select({ organizationId: bookings.organizationId })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);
  return row?.organizationId ?? null;
}

async function markRunSkipped(runId: string, reason: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db
    .update(guestJourneyRuns)
    .set({
      status: "skipped",
      skipReason: reason,
      executedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(guestJourneyRuns.id, runId));
}

function nowIso(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function normalisePriority(
  p: string,
): "low" | "normal" | "high" | "urgent" {
  return p === "low" || p === "high" || p === "urgent" ? p : "normal";
}

function computeExpiry(
  stage: RuleShape["journeyStage"],
  scheduledFor: Date | null,
  ctx: BookingContext,
): Date | null {
  if (!scheduledFor) return null;
  // pre-arrival / arrival-day suggestions expire at check-out.
  if (
    stage === "pre_arrival" ||
    stage === "arrival_day" ||
    stage === "in_stay" ||
    stage === "pre_checkout"
  ) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(ctx.checkOut)) {
      return new Date(`${ctx.checkOut}T11:00:00.000Z`);
    }
    return null;
  }
  // post-stay (review request) expires 30 days after.
  return new Date(scheduledFor.getTime() + 30 * 24 * 60 * 60 * 1000);
}
