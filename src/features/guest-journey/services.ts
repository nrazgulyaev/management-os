import "server-only";

import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  guestJourneyEvents,
  guestJourneyRules,
  guestJourneyRuns,
  guestJourneySuggestions,
  guestReviewRequests,
  type GuestJourneyEvent,
  type GuestJourneyRule,
  type GuestJourneyRun,
  type GuestJourneySuggestion,
  type GuestReviewRequest,
} from "@/lib/db/schema/guest-journey";
import { bookings, bookingChannels } from "@/lib/db/schema/bookings";
import {
  guestStayTokens,
  type GuestStayToken,
} from "@/lib/db/schema/guest-stays";
import { villas } from "@/lib/db/schema/projects";
import type { JourneyStage, RuleShape } from "./rules-pure";

/**
 * Read-only services for the guest journey. Mutations live in
 * `runner.ts` and `actions.ts`. Permission gates are applied at the
 * action layer; this module is a thin DB read facade.
 */

export interface JourneyHubStats {
  activeRules: number;
  pausedRules: number;
  pendingRuns: number;
  failedRuns: number;
  activeSuggestions: number;
  pendingReviewRequests: number;
}

export async function getJourneyHubStats(): Promise<JourneyHubStats> {
  const db = getDb();
  if (!db) {
    return {
      activeRules: 0,
      pausedRules: 0,
      pendingRuns: 0,
      failedRuns: 0,
      activeSuggestions: 0,
      pendingReviewRequests: 0,
    };
  }
  const rules = await db
    .select({
      status: guestJourneyRules.status,
      count: sql<number>`count(*)::int`,
    })
    .from(guestJourneyRules)
    .groupBy(guestJourneyRules.status);
  const runs = await db
    .select({
      status: guestJourneyRuns.status,
      count: sql<number>`count(*)::int`,
    })
    .from(guestJourneyRuns)
    .groupBy(guestJourneyRuns.status);
  const [{ count: activeSuggestions = 0 } = { count: 0 }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(guestJourneySuggestions)
    .where(eq(guestJourneySuggestions.status, "active"));
  const [{ count: pendingReviewRequests = 0 } = { count: 0 }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(guestReviewRequests)
    .where(eq(guestReviewRequests.status, "pending"));
  const byRule = (status: string) =>
    rules.find((r) => r.status === status)?.count ?? 0;
  const byRun = (status: string) =>
    runs.find((r) => r.status === status)?.count ?? 0;
  return {
    activeRules: byRule("active"),
    pausedRules: byRule("paused"),
    pendingRuns: byRun("pending"),
    failedRuns: byRun("failed"),
    activeSuggestions,
    pendingReviewRequests,
  };
}

export async function listGuestJourneyRules(opts?: {
  status?: "active" | "paused" | "archived";
  stage?: JourneyStage;
  limit?: number;
}): Promise<GuestJourneyRule[]> {
  const db = getDb();
  if (!db) return [];
  const filters = [] as ReturnType<typeof eq>[];
  if (opts?.status) filters.push(eq(guestJourneyRules.status, opts.status));
  if (opts?.stage) filters.push(eq(guestJourneyRules.journeyStage, opts.stage));
  return db
    .select()
    .from(guestJourneyRules)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(
      guestJourneyRules.journeyStage,
      guestJourneyRules.offsetMinutes,
      guestJourneyRules.ruleKey,
    )
    .limit(opts?.limit ?? 200);
}

export async function getGuestJourneyRule(
  id: string,
): Promise<GuestJourneyRule | null> {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(guestJourneyRules)
    .where(eq(guestJourneyRules.id, id))
    .limit(1);
  return row ?? null;
}

export interface JourneyRunRow {
  run: GuestJourneyRun;
  rule: GuestJourneyRule | null;
  bookingCode: string | null;
}

export async function listGuestJourneyRuns(opts?: {
  status?: "pending" | "executed" | "skipped" | "failed";
  bookingId?: string;
  limit?: number;
}): Promise<JourneyRunRow[]> {
  const db = getDb();
  if (!db) return [];
  const filters = [] as ReturnType<typeof eq>[];
  if (opts?.status) filters.push(eq(guestJourneyRuns.status, opts.status));
  if (opts?.bookingId)
    filters.push(eq(guestJourneyRuns.bookingId, opts.bookingId));
  const rows = await db
    .select({
      run: guestJourneyRuns,
      rule: guestJourneyRules,
      bookingCode: bookings.bookingCode,
    })
    .from(guestJourneyRuns)
    .leftJoin(
      guestJourneyRules,
      eq(guestJourneyRules.id, guestJourneyRuns.ruleId),
    )
    .leftJoin(bookings, eq(bookings.id, guestJourneyRuns.bookingId))
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(guestJourneyRuns.createdAt))
    .limit(opts?.limit ?? 200);
  return rows.map((r) => ({
    run: r.run,
    rule: r.rule,
    bookingCode: r.bookingCode ?? null,
  }));
}

export interface SuggestionRow {
  suggestion: GuestJourneySuggestion;
  bookingCode: string | null;
  villaCode: string | null;
}

export async function listGuestJourneySuggestions(opts?: {
  bookingId?: string;
  status?: "active" | "clicked" | "dismissed" | "expired" | "converted";
  limit?: number;
}): Promise<SuggestionRow[]> {
  const db = getDb();
  if (!db) return [];
  const filters = [] as ReturnType<typeof eq>[];
  if (opts?.bookingId)
    filters.push(eq(guestJourneySuggestions.bookingId, opts.bookingId));
  if (opts?.status)
    filters.push(eq(guestJourneySuggestions.status, opts.status));
  const rows = await db
    .select({
      suggestion: guestJourneySuggestions,
      bookingCode: bookings.bookingCode,
      villaCode: villas.unitCode,
    })
    .from(guestJourneySuggestions)
    .leftJoin(bookings, eq(bookings.id, guestJourneySuggestions.bookingId))
    .leftJoin(villas, eq(villas.id, guestJourneySuggestions.villaId))
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(guestJourneySuggestions.createdAt))
    .limit(opts?.limit ?? 200);
  return rows.map((r) => ({
    suggestion: r.suggestion,
    bookingCode: r.bookingCode ?? null,
    villaCode: r.villaCode ?? null,
  }));
}

export async function listGuestVisibleSuggestionsForToken(
  stayTokenId: string,
  now: Date = new Date(),
  limit = 3,
): Promise<GuestJourneySuggestion[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(guestJourneySuggestions)
    .where(
      and(
        eq(guestJourneySuggestions.stayTokenId, stayTokenId),
        eq(guestJourneySuggestions.status, "active"),
      ),
    )
    .orderBy(
      sql`CASE ${guestJourneySuggestions.priority} WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 ELSE 9 END`,
      guestJourneySuggestions.suggestedFor,
    )
    .limit(50);
  // Filter visibility in JS (already-active rows whose `expires_at`
  // has passed should not flicker into the rendered set).
  return rows
    .filter((r) => {
      if (r.expiresAt && r.expiresAt.getTime() <= now.getTime()) return false;
      if (r.suggestedFor && r.suggestedFor.getTime() > now.getTime())
        return false;
      return true;
    })
    .slice(0, limit);
}

export async function listGuestJourneyEventsForBooking(
  bookingId: string,
  limit = 100,
): Promise<GuestJourneyEvent[]> {
  const db = getDb();
  if (!db) return [];
  return db
    .select()
    .from(guestJourneyEvents)
    .where(eq(guestJourneyEvents.bookingId, bookingId))
    .orderBy(desc(guestJourneyEvents.eventAt))
    .limit(limit);
}

export interface ReviewRequestRow {
  request: GuestReviewRequest;
  bookingCode: string | null;
  villaCode: string | null;
}

export async function listGuestReviewRequests(opts?: {
  status?: "pending" | "sent" | "clicked" | "completed" | "skipped" | "failed";
  limit?: number;
}): Promise<ReviewRequestRow[]> {
  const db = getDb();
  if (!db) return [];
  const filters = [] as ReturnType<typeof eq>[];
  if (opts?.status) filters.push(eq(guestReviewRequests.status, opts.status));
  const rows = await db
    .select({
      request: guestReviewRequests,
      bookingCode: bookings.bookingCode,
      villaCode: villas.unitCode,
    })
    .from(guestReviewRequests)
    .leftJoin(bookings, eq(bookings.id, guestReviewRequests.bookingId))
    .leftJoin(villas, eq(villas.id, guestReviewRequests.villaId))
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(guestReviewRequests.createdAt))
    .limit(opts?.limit ?? 200);
  return rows.map((r) => ({
    request: r.request,
    bookingCode: r.bookingCode ?? null,
    villaCode: r.villaCode ?? null,
  }));
}

export interface BookingForJourney {
  id: string;
  /** Org anchor — bookings.organization_id (NOT NULL since 0155). */
  organizationId: string;
  villaId: string;
  projectId: string | null;
  channelKey: string | null;
  externalReference: string | null;
  bookingCode: string;
  checkIn: string;
  checkOut: string;
  status: string;
  bookingCreatedAt: Date | null;
}

/**
 * Fetch the booking + channel key + project id needed by the rule
 * engine. Returns null when the booking does not exist.
 */
export async function getBookingForJourney(
  bookingId: string,
): Promise<BookingForJourney | null> {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .select({
      id: bookings.id,
      organizationId: bookings.organizationId,
      villaId: bookings.villaId,
      projectId: villas.projectId,
      channelKey: bookingChannels.key,
      externalReference: bookings.sourceReference,
      bookingCode: bookings.bookingCode,
      checkIn: bookings.checkIn,
      checkOut: bookings.checkOut,
      status: bookings.status,
      bookingCreatedAt: bookings.createdAt,
    })
    .from(bookings)
    .leftJoin(villas, eq(villas.id, bookings.villaId))
    .leftJoin(bookingChannels, eq(bookingChannels.id, bookings.channelId))
    .where(eq(bookings.id, bookingId))
    .limit(1);
  return row ?? null;
}

export interface StayTokenForJourney {
  id: string;
  rawToken: string | null;
  issuedAt: Date | null;
}

/**
 * Fetch the active stay token for a booking (if any). We cannot
 * recover the raw token from the hash — but rules that need to embed
 * the token in CTAs can carry it via the request that triggers them.
 */
export async function getActiveStayTokenForBooking(
  bookingId: string,
): Promise<GuestStayToken | null> {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(guestStayTokens)
    .where(
      and(
        eq(guestStayTokens.bookingId, bookingId),
        eq(guestStayTokens.status, "active"),
      ),
    )
    .orderBy(desc(guestStayTokens.createdAt))
    .limit(1);
  return row ?? null;
}

export function ruleToShape(rule: GuestJourneyRule): RuleShape {
  return {
    id: rule.id,
    ruleKey: rule.ruleKey,
    journeyStage: rule.journeyStage as RuleShape["journeyStage"],
    triggerAnchor: rule.triggerAnchor as RuleShape["triggerAnchor"],
    offsetMinutes: rule.offsetMinutes,
    status: rule.status as RuleShape["status"],
    villaId: rule.villaId,
    projectId: rule.projectId,
    appliesToChannel: rule.appliesToChannel,
    channel: rule.channel,
    templateKey: rule.templateKey,
    suggestionType: rule.suggestionType,
    serviceId: rule.serviceId,
    priority: rule.priority as RuleShape["priority"],
  };
}

/** Suppress an unused-import warning when `inArray` / `isNull` are
 *  reserved for future filters (admin search by status set, etc). */
export const __reserved = { inArray, isNull };
