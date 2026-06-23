import "server-only";

import { and, desc, eq, isNull, lt, lte, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  directBookingExpiryRuns,
  directBookingHoldRateLimits,
  directBookingHolds,
  directBookingRequestEvents,
  directBookingRequests,
  type DirectBookingHold,
  type DirectBookingRequest,
  type DirectBookingRequestEvent,
  type NewDirectBookingHold,
  type NewDirectBookingRequest,
} from "@/lib/db/schema/direct-booking";
import { villas } from "@/lib/db/schema/projects";
import { bookings, guests } from "@/lib/db/schema/bookings";
import {
  decideRateLimit,
  type RateLimitDecision,
  type RateLimitWindow,
} from "./hold-pure";

/**
 * Read services for the direct-booking domain. Mutations live in
 * `actions.ts` and `expiry.ts`.
 */

export async function getHoldByTokenHash(
  tokenHash: string,
): Promise<DirectBookingHold | null> {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(directBookingHolds)
    .where(eq(directBookingHolds.holdTokenHash, tokenHash))
    .limit(1);
  return row ?? null;
}

export async function getHoldById(
  id: string,
  // TENANCY: admin/request-path callers pass the verified caller org so a
  // cross-org id resolves to no row (returns null). The org column is a
  // nullable legacy anchor (migration 0153) — a NULL pre-backfill row is still
  // readable (mirrors getDirectBookingDetailByHoldId); only a set-but-mismatched
  // org is rejected. Internal/system callers may pass nothing and stay
  // org-agnostic.
  organizationId: string | null = null,
): Promise<DirectBookingHold | null> {
  const db = getDb();
  if (!db) return null;
  const where = organizationId
    ? and(
        eq(directBookingHolds.id, id),
        or(
          isNull(directBookingHolds.organizationId),
          eq(directBookingHolds.organizationId, organizationId),
        ),
      )
    : eq(directBookingHolds.id, id);
  const [row] = await db
    .select()
    .from(directBookingHolds)
    .where(where)
    .limit(1);
  return row ?? null;
}

export interface HoldWithVilla {
  hold: DirectBookingHold;
  villaName: string | null;
  villaCode: string | null;
}

export async function listDirectBookingHolds(
  // TENANCY: required caller org — the admin holds list is scoped to the
  // caller's tenant. Mirrors getDirectBookingMetrics (strict eq on org) so the
  // hub KPI tiles and this list agree on what the operator owns.
  organizationId: string,
  opts?: {
    status?: DirectBookingHold["status"];
    villaId?: string;
    limit?: number;
  },
): Promise<HoldWithVilla[]> {
  const db = getDb();
  if (!db) return [];
  const filters: ReturnType<typeof eq>[] = [
    eq(directBookingHolds.organizationId, organizationId),
  ];
  if (opts?.status) filters.push(eq(directBookingHolds.status, opts.status));
  if (opts?.villaId) filters.push(eq(directBookingHolds.villaId, opts.villaId));
  const rows = await db
    .select({
      hold: directBookingHolds,
      villaName: villas.name,
      villaCode: villas.unitCode,
    })
    .from(directBookingHolds)
    .leftJoin(villas, eq(villas.id, directBookingHolds.villaId))
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(directBookingHolds.createdAt))
    .limit(opts?.limit ?? 200);
  return rows.map((r) => ({
    hold: r.hold,
    villaName: r.villaName ?? null,
    villaCode: r.villaCode ?? null,
  }));
}

export async function listExpiringHolds(
  withinMinutes: number,
  limit = 50,
  now: Date = new Date(),
): Promise<DirectBookingHold[]> {
  const db = getDb();
  if (!db) return [];
  const horizon = new Date(now.getTime() + withinMinutes * 60_000);
  return db
    .select()
    .from(directBookingHolds)
    .where(
      and(
        eq(directBookingHolds.status, "active"),
        lte(directBookingHolds.expiresAt, horizon),
      ),
    )
    .orderBy(directBookingHolds.expiresAt)
    .limit(limit);
}

export interface RequestRow {
  request: DirectBookingRequest;
  hold: DirectBookingHold | null;
  villaName: string | null;
  villaCode: string | null;
}

export async function listDirectBookingRequests(
  // TENANCY: required caller org — the admin requests inbox is scoped to the
  // caller's tenant (strict eq, matching getDirectBookingMetrics). The
  // org+status+created index backs this list.
  organizationId: string,
  opts?: {
    status?: DirectBookingRequest["status"];
    limit?: number;
  },
): Promise<RequestRow[]> {
  const db = getDb();
  if (!db) return [];
  const filters: ReturnType<typeof eq>[] = [
    eq(directBookingRequests.organizationId, organizationId),
  ];
  if (opts?.status)
    filters.push(eq(directBookingRequests.status, opts.status));
  const rows = await db
    .select({
      request: directBookingRequests,
      hold: directBookingHolds,
      villaName: villas.name,
      villaCode: villas.unitCode,
    })
    .from(directBookingRequests)
    .leftJoin(
      directBookingHolds,
      eq(directBookingHolds.id, directBookingRequests.holdId),
    )
    .leftJoin(villas, eq(villas.id, directBookingRequests.villaId))
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(directBookingRequests.createdAt))
    .limit(opts?.limit ?? 200);
  return rows.map((r) => ({
    request: r.request,
    hold: r.hold ?? null,
    villaName: r.villaName ?? null,
    villaCode: r.villaCode ?? null,
  }));
}

export interface RequestDetail extends RequestRow {
  events: DirectBookingRequestEvent[];
  booking: { id: string; bookingCode: string; status: string } | null;
}

export async function getRequestDetailById(
  id: string,
  // TENANCY: required caller org — AND'd into the request load so a cross-org
  // id resolves to no row (→ null → notFound()). Mirrors the convert action's
  // strict-eq request load. The events + booking sub-queries below key off the
  // now-org-verified request id, so those FK lookups are safe.
  organizationId: string,
): Promise<RequestDetail | null> {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .select({
      request: directBookingRequests,
      hold: directBookingHolds,
      villaName: villas.name,
      villaCode: villas.unitCode,
    })
    .from(directBookingRequests)
    .leftJoin(
      directBookingHolds,
      eq(directBookingHolds.id, directBookingRequests.holdId),
    )
    .leftJoin(villas, eq(villas.id, directBookingRequests.villaId))
    .where(
      and(
        eq(directBookingRequests.id, id),
        eq(directBookingRequests.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!row) return null;
  const [events, booking] = await Promise.all([
    db
      .select()
      .from(directBookingRequestEvents)
      .where(eq(directBookingRequestEvents.requestId, id))
      .orderBy(desc(directBookingRequestEvents.createdAt))
      .limit(200),
    row.request.bookingId
      ? db
          .select({
            id: bookings.id,
            bookingCode: bookings.bookingCode,
            status: bookings.status,
          })
          .from(bookings)
          .where(eq(bookings.id, row.request.bookingId))
          .limit(1)
      : Promise.resolve([] as { id: string; bookingCode: string; status: string }[]),
  ]);
  return {
    request: row.request,
    hold: row.hold ?? null,
    villaName: row.villaName ?? null,
    villaCode: row.villaCode ?? null,
    events,
    booking: booking[0] ?? null,
  };
}

export async function listRequestEvents(
  requestId: string,
  limit = 200,
): Promise<DirectBookingRequestEvent[]> {
  const db = getDb();
  if (!db) return [];
  return db
    .select()
    .from(directBookingRequestEvents)
    .where(eq(directBookingRequestEvents.requestId, requestId))
    .orderBy(desc(directBookingRequestEvents.createdAt))
    .limit(limit);
}

// -----------------------------------------------------------------------------
// Hub metrics
// -----------------------------------------------------------------------------

export interface DirectBookingMetrics {
  activeHolds: number;
  submittedRequests: number;
  expiringSoon: number;
  approvedToday: number;
  rejectedToday: number;
  conversionRate: number;
}

export async function getDirectBookingMetrics(
  organizationId: string,
  now: Date = new Date(),
): Promise<DirectBookingMetrics> {
  const db = getDb();
  if (!db) {
    return {
      activeHolds: 0,
      submittedRequests: 0,
      expiringSoon: 0,
      approvedToday: 0,
      rejectedToday: 0,
      conversionRate: 0,
    };
  }
  // Stage 9.I — was 7 separate aggregate queries fired in parallel,
  // saturating the postgres pool on Vercel cold-start (>60s hangs in
  // 8.C audit). Collapsed to 2 single-row aggregates via FILTER:
  //   one over direct_booking_holds, one over direct_booking_requests.
  // Each query reads its table once, no fan-out.
  const startOfDay = new Date(now);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const inFiveMin = new Date(now.getTime() + 5 * 60_000);
  const startOfDayIso = startOfDay.toISOString();
  const inFiveMinIso = inFiveMin.toISOString();

  const [[holdAgg], [reqAgg]] = await Promise.all([
    db
      .select({
        active: sql<number>`COUNT(*) FILTER (WHERE ${directBookingHolds.status} = 'active')::int`,
        expiringSoon: sql<number>`COUNT(*) FILTER (WHERE ${directBookingHolds.status} = 'active' AND ${directBookingHolds.expiresAt} <= ${inFiveMinIso}::timestamptz)::int`,
      })
      .from(directBookingHolds)
      // TENANCY: hub KPI tiles count only the caller's tenant volume.
      .where(eq(directBookingHolds.organizationId, organizationId)),
    db
      .select({
        submitted: sql<number>`COUNT(*) FILTER (WHERE ${directBookingRequests.status} = 'submitted')::int`,
        approvedToday: sql<number>`COUNT(*) FILTER (WHERE ${directBookingRequests.status} = 'approved' AND ${directBookingRequests.reviewedAt} >= ${startOfDayIso}::timestamptz)::int`,
        rejectedToday: sql<number>`COUNT(*) FILTER (WHERE ${directBookingRequests.status} = 'rejected' AND ${directBookingRequests.reviewedAt} >= ${startOfDayIso}::timestamptz)::int`,
        total: sql<number>`COUNT(*)::int`,
        converted: sql<number>`COUNT(*) FILTER (WHERE ${directBookingRequests.status} = 'converted')::int`,
      })
      .from(directBookingRequests)
      .where(eq(directBookingRequests.organizationId, organizationId)),
  ]);

  const total = reqAgg?.total ?? 0;
  const converted = reqAgg?.converted ?? 0;
  return {
    activeHolds: holdAgg?.active ?? 0,
    submittedRequests: reqAgg?.submitted ?? 0,
    expiringSoon: holdAgg?.expiringSoon ?? 0,
    approvedToday: reqAgg?.approvedToday ?? 0,
    rejectedToday: reqAgg?.rejectedToday ?? 0,
    conversionRate: total > 0 ? converted / total : 0,
  };
}

// -----------------------------------------------------------------------------
// Inserts / mutations used by actions
// -----------------------------------------------------------------------------

export async function insertHold(
  values: NewDirectBookingHold,
): Promise<DirectBookingHold | null> {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .insert(directBookingHolds)
    .values(values)
    .returning();
  return row ?? null;
}

export async function updateHoldStatus(
  id: string,
  status: DirectBookingHold["status"],
  patch?: Partial<DirectBookingHold>,
  // TENANCY: admin-path callers (e.g. cancel) pass the verified caller org so a
  // cross-org hold id resolves to no row (returns null). Cron/system + public
  // token-authenticated callers (expiry.ts, public-api.ts) pass nothing and
  // stay org-agnostic. The org column is a nullable legacy anchor (migration
  // 0153) — a NULL pre-backfill row is still writable; only a set-but-mismatched
  // org is rejected. Mirrors updateRequestStatus.
  organizationId: string | null = null,
): Promise<DirectBookingHold | null> {
  const db = getDb();
  if (!db) return null;
  const where = organizationId
    ? and(
        eq(directBookingHolds.id, id),
        or(
          isNull(directBookingHolds.organizationId),
          eq(directBookingHolds.organizationId, organizationId),
        ),
      )
    : eq(directBookingHolds.id, id);
  const [row] = await db
    .update(directBookingHolds)
    .set({ status, updatedAt: new Date(), ...(patch ?? {}) })
    .where(where)
    .returning();
  return row ?? null;
}

export async function insertRequest(
  values: NewDirectBookingRequest,
): Promise<DirectBookingRequest | null> {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .insert(directBookingRequests)
    .values(values)
    .returning();
  return row ?? null;
}

export async function updateRequestStatus(
  id: string,
  status: DirectBookingRequest["status"],
  patch?: Partial<DirectBookingRequest>,
  // TENANCY: request-path callers pass the verified caller org so a cross-org
  // id resolves to no row (returns null = "Request not found"). Cron/system
  // callers (expiry.ts) pass nothing and stay org-agnostic. The org column is
  // a nullable legacy anchor (migration 0153) — a NULL pre-backfill row is
  // still writable by the internal caller; only a set-but-mismatched org is
  // rejected.
  organizationId: string | null = null,
): Promise<DirectBookingRequest | null> {
  const db = getDb();
  if (!db) return null;
  const where = organizationId
    ? and(
        eq(directBookingRequests.id, id),
        or(
          isNull(directBookingRequests.organizationId),
          eq(directBookingRequests.organizationId, organizationId),
        ),
      )
    : eq(directBookingRequests.id, id);
  const [row] = await db
    .update(directBookingRequests)
    .set({ status, updatedAt: new Date(), ...(patch ?? {}) })
    .where(where)
    .returning();
  return row ?? null;
}

export async function appendRequestEvent(args: {
  requestId: string;
  eventType: string;
  actorType: "guest" | "internal" | "system";
  actorUserId?: string | null;
  message?: string | null;
  metadataJson?: Record<string, unknown> | null;
}): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db.insert(directBookingRequestEvents).values({
    requestId: args.requestId,
    eventType: args.eventType,
    actorType: args.actorType,
    actorUserId: args.actorUserId ?? null,
    message: args.message ?? null,
    metadataJson: args.metadataJson ?? null,
  });
}

// -----------------------------------------------------------------------------
// Guest upsert
// -----------------------------------------------------------------------------

export async function upsertGuestByEmail(args: {
  email: string;
  fullName: string;
  phone?: string | null;
  nationality?: string | null;
  /** TENANCY (0176): org of the booking this guest is being created for.
   *  Nullable for the public path where the hold's org may be unset; the
   *  guests column is nullable and the backfill covers any gap. */
  organizationId: string | null;
}): Promise<string | null> {
  const db = getDb();
  if (!db) return null;
  const normalised = args.email.trim().toLowerCase();
  const [existing] = await db
    .select({ id: guests.id })
    .from(guests)
    .where(eq(guests.email, normalised))
    .limit(1);
  if (existing) {
    await db
      .update(guests)
      .set({
        fullName: args.fullName,
        phone: args.phone ?? null,
        nationality: args.nationality ?? null,
        updatedAt: new Date(),
      })
      .where(eq(guests.id, existing.id));
    return existing.id;
  }
  const [row] = await db
    .insert(guests)
    .values({
      organizationId: args.organizationId,
      fullName: args.fullName,
      email: normalised,
      phone: args.phone ?? null,
      nationality: args.nationality ?? null,
      status: "active",
    })
    .returning({ id: guests.id });
  return row?.id ?? null;
}

// -----------------------------------------------------------------------------
// Rate limiting (DB-backed; pure decision in hold-pure)
// -----------------------------------------------------------------------------

export async function checkAndRecordRateLimit(args: {
  ipHash: string;
  now?: Date;
  maxHolds?: number;
  windowMinutes?: number;
  blockMinutes?: number;
}): Promise<RateLimitDecision> {
  const db = getDb();
  if (!db) return { allowed: true };
  const now = args.now ?? new Date();
  const windowMinutes = args.windowMinutes ?? 10;
  const cutoff = new Date(now.getTime() - windowMinutes * 60_000);

  const [latest] = await db
    .select()
    .from(directBookingHoldRateLimits)
    .where(
      and(
        eq(directBookingHoldRateLimits.ipHash, args.ipHash),
        sql`${directBookingHoldRateLimits.windowStart} >= ${cutoff.toISOString()}`,
      ),
    )
    .orderBy(desc(directBookingHoldRateLimits.windowStart))
    .limit(1);

  const current: RateLimitWindow | null = latest
    ? {
        windowStart: latest.windowStart,
        holdCount: latest.holdCount,
        blockedUntil: latest.blockedUntil,
      }
    : null;

  const { decision, next } = decideRateLimit({
    now,
    current,
    maxHolds: args.maxHolds,
    windowMinutes,
    blockMinutes: args.blockMinutes,
  });

  if (latest) {
    await db
      .update(directBookingHoldRateLimits)
      .set({
        holdCount: next.holdCount,
        blockedUntil: next.blockedUntil,
        updatedAt: new Date(),
      })
      .where(eq(directBookingHoldRateLimits.id, latest.id));
  } else {
    await db.insert(directBookingHoldRateLimits).values({
      ipHash: args.ipHash,
      windowStart: next.windowStart,
      holdCount: next.holdCount,
      blockedUntil: next.blockedUntil,
    });
  }
  return decision;
}

// -----------------------------------------------------------------------------
// Expiry runs (observability)
// -----------------------------------------------------------------------------

export async function startExpiryRun(): Promise<{ id: string; runCode: string } | null> {
  const db = getDb();
  if (!db) return null;
  const runCode = `DBE-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const [row] = await db
    .insert(directBookingExpiryRuns)
    .values({
      runCode,
      status: "running",
    })
    .returning({ id: directBookingExpiryRuns.id });
  return row ? { id: row.id, runCode } : null;
}

export async function finishExpiryRun(args: {
  id: string;
  expiredHoldsCount: number;
  expiredRequestsCount: number;
  releasedBlocksCount: number;
  status: "success" | "failed";
  errorMessage?: string | null;
}): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db
    .update(directBookingExpiryRuns)
    .set({
      expiredHoldsCount: args.expiredHoldsCount,
      expiredRequestsCount: args.expiredRequestsCount,
      releasedBlocksCount: args.releasedBlocksCount,
      status: args.status,
      errorMessage: args.errorMessage ?? null,
      finishedAt: new Date(),
    })
    .where(eq(directBookingExpiryRuns.id, args.id));
}

export async function findHoldsToExpire(
  now: Date,
  limit = 100,
): Promise<DirectBookingHold[]> {
  const db = getDb();
  if (!db) return [];
  return db
    .select()
    .from(directBookingHolds)
    .where(
      and(
        eq(directBookingHolds.status, "active"),
        lt(directBookingHolds.expiresAt, now),
      ),
    )
    .limit(limit);
}
