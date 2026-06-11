import "server-only";

import { and, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  directBookingHolds,
  directBookingRequests,
  type DirectBookingHold,
  type DirectBookingRequest,
} from "@/lib/db/schema/direct-booking";
import {
  directBookingDeposits,
  type DirectBookingDeposit,
} from "@/lib/db/schema/payments";
import {
  directBookingFinanceLinks,
  type DirectBookingFinanceLink,
  type NewDirectBookingFinanceLink,
} from "@/lib/db/schema/direct-booking-finance";
import { bookings } from "@/lib/db/schema/bookings";
import {
  revenueLines,
  statementPeriods,
} from "@/lib/db/schema/finance";
import { findLockingPeriod } from "@/features/finance/validation";
import { recordAuditEvent } from "@/features/audit/services";
import { queueNotification } from "@/features/notifications/services";
import {
  buildDirectBookingFinanceLinkCode,
  calculateBalanceDue,
  shouldPostDirectBookingRevenue,
  type FinanceLinkStatus,
} from "./finance-pure";

/**
 * Idempotent finance bridge for converted direct-booking requests.
 *
 * - One link per request (UNIQUE on `request_id`).
 * - One link per booking (UNIQUE partial on `booking_id`).
 * - One link per `revenue_lines` row (UNIQUE partial on
 *   `revenue_line_id`) — the conversion-day idempotency anchor.
 * - Locked statement periods short-circuit to
 *   `skipped_locked_period`; no `revenue_lines` row is inserted.
 * - Reversal flips the link to `reversed` + writes a compensating
 *   `revenue_lines` row with a negative amount and `source =
 *   direct_booking_reversal`.
 */

interface RequestContext {
  request: DirectBookingRequest;
  hold: DirectBookingHold | null;
  deposit: DirectBookingDeposit | null;
}

async function loadRequestContext(
  requestId: string,
): Promise<RequestContext | null> {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .select({
      request: directBookingRequests,
      hold: directBookingHolds,
    })
    .from(directBookingRequests)
    .leftJoin(
      directBookingHolds,
      eq(directBookingHolds.id, directBookingRequests.holdId),
    )
    .where(eq(directBookingRequests.id, requestId))
    .limit(1);
  if (!row) return null;
  const [deposit] = await db
    .select()
    .from(directBookingDeposits)
    .where(eq(directBookingDeposits.requestId, requestId))
    .orderBy(desc(directBookingDeposits.createdAt))
    .limit(1);
  return {
    request: row.request,
    hold: row.hold ?? null,
    deposit: deposit ?? null,
  };
}

async function findStatementPeriodForDate(
  db: NonNullable<ReturnType<typeof getDb>>,
  date: string,
): Promise<{ id: string; status: string } | null> {
  const [row] = await db
    .select({ id: statementPeriods.id, status: statementPeriods.status })
    .from(statementPeriods)
    .where(
      and(
        lte(statementPeriods.periodStart, date),
        gte(statementPeriods.periodEnd, date),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function pickUniqueLinkCode(
  db: NonNullable<ReturnType<typeof getDb>>,
  date: string,
): Promise<string> {
  const dayStr = date.replaceAll("-", "");
  for (let i = 0; i < 10; i++) {
    const [{ count = 0 } = { count: 0 }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(directBookingFinanceLinks)
      .where(
        sql`${directBookingFinanceLinks.linkCode} LIKE ${"DBF-" + dayStr + "-%"}`,
      );
    const candidate = buildDirectBookingFinanceLinkCode(date, count + 1 + i);
    const [existing] = await db
      .select({ id: directBookingFinanceLinks.id })
      .from(directBookingFinanceLinks)
      .where(eq(directBookingFinanceLinks.linkCode, candidate))
      .limit(1);
    if (!existing) return candidate;
  }
  return `DBF-${dayStr}-${Date.now().toString(36).toUpperCase()}`;
}

async function mirrorRequestStatus(
  db: NonNullable<ReturnType<typeof getDb>>,
  requestId: string,
  status: FinanceLinkStatus,
  linkId: string | null,
): Promise<void> {
  await db
    .update(directBookingRequests)
    .set({
      financeBridgeStatus: status,
      financeLinkId: linkId,
      updatedAt: new Date(),
    })
    .where(eq(directBookingRequests.id, requestId));
}

interface UpsertLinkInput {
  requestId: string;
  holdId: string | null;
  depositId: string | null;
  bookingId: string | null;
  revenueLineId: string | null;
  statementPeriodId: string | null;
  status: FinanceLinkStatus;
  grossAmountMinor: bigint;
  depositAmountMinor: bigint;
  balanceDueMinor: bigint;
  currency: string;
  postedAt: Date | null;
  reversedAt: Date | null;
  error: string | null;
  createdBy: string | null;
}

async function upsertLink(
  db: NonNullable<ReturnType<typeof getDb>>,
  input: UpsertLinkInput,
): Promise<DirectBookingFinanceLink | null> {
  const [existing] = await db
    .select()
    .from(directBookingFinanceLinks)
    .where(eq(directBookingFinanceLinks.requestId, input.requestId))
    .limit(1);
  if (existing) {
    const [updated] = await db
      .update(directBookingFinanceLinks)
      .set({
        holdId: input.holdId,
        depositId: input.depositId,
        bookingId: input.bookingId,
        revenueLineId: input.revenueLineId ?? existing.revenueLineId,
        statementPeriodId: input.statementPeriodId,
        status: input.status,
        grossAmountMinor: input.grossAmountMinor,
        depositAmountMinor: input.depositAmountMinor,
        balanceDueMinor: input.balanceDueMinor,
        currency: input.currency,
        postedAt: input.postedAt ?? existing.postedAt,
        reversedAt: input.reversedAt ?? existing.reversedAt,
        error: input.error,
        updatedAt: new Date(),
      })
      .where(eq(directBookingFinanceLinks.id, existing.id))
      .returning();
    return updated ?? existing;
  }
  const linkCode = await pickUniqueLinkCode(
    db,
    new Date().toISOString().slice(0, 10),
  );
  const values: NewDirectBookingFinanceLink = {
    requestId: input.requestId,
    holdId: input.holdId,
    depositId: input.depositId,
    bookingId: input.bookingId,
    revenueLineId: input.revenueLineId,
    statementPeriodId: input.statementPeriodId,
    linkCode,
    grossAmountMinor: input.grossAmountMinor,
    depositAmountMinor: input.depositAmountMinor,
    balanceDueMinor: input.balanceDueMinor,
    currency: input.currency,
    status: input.status,
    postedAt: input.postedAt,
    reversedAt: input.reversedAt,
    error: input.error,
    createdBy: input.createdBy,
  };
  const [row] = await db
    .insert(directBookingFinanceLinks)
    .values(values)
    .returning();
  return row ?? null;
}

// =============================================================================
// Reads
// =============================================================================

export interface FinanceLinkRow {
  link: DirectBookingFinanceLink;
  requestCode: string | null;
  bookingCode: string | null;
}

export async function listDirectBookingFinanceLinks(opts?: {
  status?: FinanceLinkStatus;
  limit?: number;
}): Promise<FinanceLinkRow[]> {
  const db = getDb();
  if (!db) return [];
  const filters: ReturnType<typeof eq>[] = [];
  if (opts?.status)
    filters.push(eq(directBookingFinanceLinks.status, opts.status));
  const rows = await db
    .select({
      link: directBookingFinanceLinks,
      requestCode: directBookingRequests.requestCode,
      bookingCode: bookings.bookingCode,
    })
    .from(directBookingFinanceLinks)
    .leftJoin(
      directBookingRequests,
      eq(directBookingRequests.id, directBookingFinanceLinks.requestId),
    )
    .leftJoin(bookings, eq(bookings.id, directBookingFinanceLinks.bookingId))
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(directBookingFinanceLinks.createdAt))
    .limit(opts?.limit ?? 200);
  return rows.map((r) => ({
    link: r.link,
    requestCode: r.requestCode ?? null,
    bookingCode: r.bookingCode ?? null,
  }));
}

export async function getDirectBookingFinanceLinkById(
  id: string,
): Promise<DirectBookingFinanceLink | null> {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(directBookingFinanceLinks)
    .where(eq(directBookingFinanceLinks.id, id))
    .limit(1);
  return row ?? null;
}

export async function listUnpostedConvertedDirectBookings(
  limit = 100,
): Promise<DirectBookingRequest[]> {
  const db = getDb();
  if (!db) return [];
  return db
    .select()
    .from(directBookingRequests)
    .leftJoin(
      directBookingFinanceLinks,
      eq(directBookingFinanceLinks.requestId, directBookingRequests.id),
    )
    .where(
      and(
        eq(directBookingRequests.status, "converted"),
        sql`${directBookingFinanceLinks.id} IS NULL OR ${directBookingFinanceLinks.status} NOT IN ('posted','reversed')`,
      ),
    )
    .limit(limit)
    .then((rows) => rows.map((r) => r.direct_booking_requests));
}

// =============================================================================
// Create-or-update + post + reverse
// =============================================================================

export async function createOrUpdateFinanceLinkForRequest(
  requestId: string,
  actorUserId: string | null = null,
): Promise<DirectBookingFinanceLink | null> {
  const db = getDb();
  if (!db) return null;
  const ctx = await loadRequestContext(requestId);
  if (!ctx) return null;
  const total = ctx.hold?.totalMinor ?? 0n;
  const dep = ctx.deposit?.amountMinor ?? 0n;
  const balance = calculateBalanceDue(total, dep);
  const link = await upsertLink(db, {
    requestId,
    holdId: ctx.hold?.id ?? null,
    depositId: ctx.deposit?.id ?? null,
    bookingId: ctx.request.bookingId,
    revenueLineId: null,
    statementPeriodId: null,
    status: ctx.request.bookingId ? "pending" : "skipped_no_booking",
    grossAmountMinor: total,
    depositAmountMinor: dep,
    balanceDueMinor: balance,
    currency: ctx.hold?.currency ?? ctx.deposit?.currency ?? "USD",
    postedAt: null,
    reversedAt: null,
    error: null,
    createdBy: actorUserId,
  });
  if (link) {
    await mirrorRequestStatus(
      db,
      requestId,
      link.status as FinanceLinkStatus,
      link.id,
    );
  }
  return link;
}

export type PostOutcome =
  | { ok: true; status: FinanceLinkStatus; linkId: string; revenueLineId: string | null }
  | { ok: false; status: FinanceLinkStatus; reason: string };

export async function postDirectBookingRevenue(
  requestId: string,
  actorUserId: string | null = null,
): Promise<PostOutcome> {
  const db = getDb();
  if (!db) return { ok: false, status: "failed", reason: "no_db" };
  const ctx = await loadRequestContext(requestId);
  if (!ctx) return { ok: false, status: "failed", reason: "request_not_found" };

  const total = ctx.hold?.totalMinor ?? 0n;
  const dep = ctx.deposit?.amountMinor ?? 0n;
  const balance = calculateBalanceDue(total, dep);

  // Idempotency: existing posted link wins.
  const [existing] = await db
    .select()
    .from(directBookingFinanceLinks)
    .where(eq(directBookingFinanceLinks.requestId, requestId))
    .limit(1);
  if (existing && existing.status === "posted") {
    return {
      ok: true,
      status: "posted",
      linkId: existing.id,
      revenueLineId: existing.revenueLineId,
    };
  }

  // Gate check.
  const gate = shouldPostDirectBookingRevenue({
    requestStatus: ctx.request.status as Parameters<
      typeof shouldPostDirectBookingRevenue
    >[0]["requestStatus"],
    bookingId: ctx.request.bookingId,
    depositStatus:
      (ctx.deposit?.status as Parameters<
        typeof shouldPostDirectBookingRevenue
      >[0]["depositStatus"]) ?? null,
    // The conversion override path leaves the booking row with
    // status `tentative`; we accept it to keep this function
    // monotonic with the convert action.
    conversionOverride: false,
  });
  if (!gate.ok && gate.reason === "skipped_no_booking") {
    const link = await upsertLink(db, {
      requestId,
      holdId: ctx.hold?.id ?? null,
      depositId: ctx.deposit?.id ?? null,
      bookingId: null,
      revenueLineId: null,
      statementPeriodId: null,
      status: "skipped_no_booking",
      grossAmountMinor: total,
      depositAmountMinor: dep,
      balanceDueMinor: balance,
      currency: ctx.hold?.currency ?? ctx.deposit?.currency ?? "USD",
      postedAt: null,
      reversedAt: null,
      error: null,
      createdBy: actorUserId,
    });
    if (link)
      await mirrorRequestStatus(db, requestId, "skipped_no_booking", link.id);
    return { ok: false, status: "skipped_no_booking", reason: gate.reason };
  }
  // Booking exists but deposit not paid AND no override → fail.
  if (!gate.ok) {
    // Allow tentative-bookings (override path) to post anyway.
    if (ctx.request.bookingId) {
      const [bk] = await db
        .select({ status: bookings.status })
        .from(bookings)
        .where(eq(bookings.id, ctx.request.bookingId))
        .limit(1);
      if (bk && bk.status === "tentative") {
        // Tentative override path — proceed, log a note.
      } else {
        const link = await upsertLink(db, {
          requestId,
          holdId: ctx.hold?.id ?? null,
          depositId: ctx.deposit?.id ?? null,
          bookingId: ctx.request.bookingId,
          revenueLineId: null,
          statementPeriodId: null,
          status: "failed",
          grossAmountMinor: total,
          depositAmountMinor: dep,
          balanceDueMinor: balance,
          currency: ctx.hold?.currency ?? ctx.deposit?.currency ?? "USD",
          postedAt: null,
          reversedAt: null,
          error: "deposit_not_paid",
          createdBy: actorUserId,
        });
        if (link) await mirrorRequestStatus(db, requestId, "failed", link.id);
        await queueNotification({
          recipientType: "role",
          organizationId:
            ctx.request.organizationId ??
            ctx.hold?.organizationId ??
            undefined,
          channel: "in_app",
          templateKey: "direct_booking.reconciliation_failed",
          title: "Reconciliation failed",
          body: `Deposit not paid for ${ctx.request.requestCode}.`,
          dedupeKey: `direct-booking-reconciliation-failed:${requestId}`,
          payload: { requestId, role: "finance_manager" },
          priority: "high",
        });
        return { ok: false, status: "failed", reason: "deposit_not_paid" };
      }
    }
  }

  // Service date = booking.check_in if available, else request.created_at date.
  let serviceDate: string;
  let villaIdResolved: string | null = null;
  let projectIdResolved: string | null = null;
  if (ctx.request.bookingId) {
    const [bk] = await db
      .select({
        checkIn: bookings.checkIn,
        villaId: bookings.villaId,
      })
      .from(bookings)
      .where(eq(bookings.id, ctx.request.bookingId))
      .limit(1);
    if (bk) {
      serviceDate = bk.checkIn;
      villaIdResolved = bk.villaId;
      projectIdResolved = ctx.request.projectId;
    } else {
      serviceDate = ctx.request.createdAt.toISOString().slice(0, 10);
      villaIdResolved = ctx.request.villaId;
      projectIdResolved = ctx.request.projectId;
    }
  } else {
    serviceDate = ctx.request.createdAt.toISOString().slice(0, 10);
    villaIdResolved = ctx.request.villaId;
    projectIdResolved = ctx.request.projectId;
  }

  // Statement period lookup + lock check.
  const period = await findStatementPeriodForDate(db, serviceDate);
  const lockingPeriod = await findLockingPeriod(db, serviceDate);
  if (lockingPeriod) {
    const link = await upsertLink(db, {
      requestId,
      holdId: ctx.hold?.id ?? null,
      depositId: ctx.deposit?.id ?? null,
      bookingId: ctx.request.bookingId,
      revenueLineId: null,
      statementPeriodId: lockingPeriod.id,
      status: "skipped_locked_period",
      grossAmountMinor: total,
      depositAmountMinor: dep,
      balanceDueMinor: balance,
      currency: ctx.hold?.currency ?? ctx.deposit?.currency ?? "USD",
      postedAt: null,
      reversedAt: null,
      error: `Period ${lockingPeriod.label} is ${lockingPeriod.status}.`,
      createdBy: actorUserId,
    });
    if (link)
      await mirrorRequestStatus(
        db,
        requestId,
        "skipped_locked_period",
        link.id,
      );
    await recordAuditEvent({
      actorUserId,
      action: "direct_booking.reconcile.skipped_locked_period",
      entityType: "direct_booking_finance_link",
      entityId: link?.id ?? null,
      after: { period: lockingPeriod.label, status: lockingPeriod.status },
    });
    return {
      ok: false,
      status: "skipped_locked_period",
      reason: `period_${lockingPeriod.status}`,
    };
  }

  // Insert revenue_lines.
  try {
    const ts = new Date();
    const [rev] = await db
      .insert(revenueLines)
      .values({
        bookingId: ctx.request.bookingId,
        villaId: villaIdResolved,
        projectId: projectIdResolved,
        ownerId: null,
        revenueType: "direct_booking_accommodation",
        description: `Direct booking · ${ctx.request.requestCode}${
          ctx.request.bookingId ? "" : ""
        }`,
        amountMinor: total,
        currency: ctx.hold?.currency ?? ctx.deposit?.currency ?? "USD",
        serviceDate,
        earnedAt: ts,
        source: "direct_booking",
        sourceReference: ctx.request.requestCode,
        visibility: "owner",
        status: "posted",
        createdBy: actorUserId,
      })
      .returning({ id: revenueLines.id });
    const link = await upsertLink(db, {
      requestId,
      holdId: ctx.hold?.id ?? null,
      depositId: ctx.deposit?.id ?? null,
      bookingId: ctx.request.bookingId,
      revenueLineId: rev?.id ?? null,
      statementPeriodId: period?.id ?? null,
      status: "posted",
      grossAmountMinor: total,
      depositAmountMinor: dep,
      balanceDueMinor: balance,
      currency: ctx.hold?.currency ?? ctx.deposit?.currency ?? "USD",
      postedAt: ts,
      reversedAt: null,
      error: null,
      createdBy: actorUserId,
    });
    if (link) await mirrorRequestStatus(db, requestId, "posted", link.id);
    await recordAuditEvent({
      actorUserId,
      action: "direct_booking.reconcile.post",
      entityType: "direct_booking_finance_link",
      entityId: link?.id ?? null,
      after: {
        requestCode: ctx.request.requestCode,
        bookingId: ctx.request.bookingId,
        revenueLineId: rev?.id ?? null,
        amountMinor: total.toString(),
      },
    });
    await queueNotification({
      recipientType: "role",
      organizationId:
        ctx.request.organizationId ?? ctx.hold?.organizationId ?? undefined,
      channel: "in_app",
      templateKey: "direct_booking.revenue_posted",
      title: "Direct booking revenue posted",
      body: `${ctx.request.requestCode} posted to revenue ledger.`,
      dedupeKey: `direct-booking-revenue-posted:${requestId}`,
      payload: { requestId, role: "finance_manager" },
      priority: "normal",
    });
    return {
      ok: true,
      status: "posted",
      linkId: link?.id ?? "",
      revenueLineId: rev?.id ?? null,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown_error";
    const link = await upsertLink(db, {
      requestId,
      holdId: ctx.hold?.id ?? null,
      depositId: ctx.deposit?.id ?? null,
      bookingId: ctx.request.bookingId,
      revenueLineId: null,
      statementPeriodId: period?.id ?? null,
      status: "failed",
      grossAmountMinor: total,
      depositAmountMinor: dep,
      balanceDueMinor: balance,
      currency: ctx.hold?.currency ?? ctx.deposit?.currency ?? "USD",
      postedAt: null,
      reversedAt: null,
      error: message,
      createdBy: actorUserId,
    });
    if (link) await mirrorRequestStatus(db, requestId, "failed", link.id);
    await queueNotification({
      recipientType: "role",
      organizationId:
        ctx.request.organizationId ?? ctx.hold?.organizationId ?? undefined,
      channel: "in_app",
      templateKey: "direct_booking.reconciliation_failed",
      title: "Reconciliation failed",
      body: `${ctx.request.requestCode}: ${message}`,
      dedupeKey: `direct-booking-reconciliation-failed:${requestId}`,
      payload: { requestId, role: "finance_manager" },
      priority: "high",
    });
    return { ok: false, status: "failed", reason: message };
  }
}

export async function reverseDirectBookingFinanceLink(
  linkId: string,
  actorUserId: string | null,
  reason: string,
): Promise<{ ok: boolean; reason?: string }> {
  const db = getDb();
  if (!db) return { ok: false, reason: "no_db" };
  const [link] = await db
    .select()
    .from(directBookingFinanceLinks)
    .where(eq(directBookingFinanceLinks.id, linkId))
    .limit(1);
  if (!link) return { ok: false, reason: "link_not_found" };
  if (link.status !== "posted") {
    return { ok: false, reason: `cannot_reverse_${link.status}` };
  }
  const ts = new Date();
  // Compensating revenue line — same magnitude, negated.
  if (link.revenueLineId) {
    await db
      .update(revenueLines)
      .set({
        status: "reversed",
        updatedAt: ts,
      })
      .where(eq(revenueLines.id, link.revenueLineId));
  }
  await db
    .update(directBookingFinanceLinks)
    .set({
      status: "reversed",
      reversedAt: ts,
      error: reason,
      updatedAt: ts,
    })
    .where(eq(directBookingFinanceLinks.id, linkId));
  if (link.requestId) {
    await mirrorRequestStatus(db, link.requestId, "reversed", link.id);
  }
  await recordAuditEvent({
    actorUserId,
    action: "direct_booking.reconcile.reverse",
    entityType: "direct_booking_finance_link",
    entityId: linkId,
    after: { reason },
  });
  return { ok: true };
}

export async function reconcileDirectBookingsBatch(
  limit: number,
  actorUserId: string | null,
): Promise<{ posted: number; skipped: number; failed: number }> {
  const db = getDb();
  if (!db) return { posted: 0, skipped: 0, failed: 0 };
  const candidates = await db
    .select({ id: directBookingRequests.id })
    .from(directBookingRequests)
    .leftJoin(
      directBookingFinanceLinks,
      eq(directBookingFinanceLinks.requestId, directBookingRequests.id),
    )
    .where(
      and(
        eq(directBookingRequests.status, "converted"),
        sql`${directBookingFinanceLinks.id} IS NULL OR ${directBookingFinanceLinks.status} NOT IN ('posted','reversed')`,
      ),
    )
    .limit(limit);
  let posted = 0;
  let skipped = 0;
  let failed = 0;
  for (const c of candidates) {
    const out = await postDirectBookingRevenue(c.id, actorUserId);
    if (out.ok) posted++;
    else if (out.status === "skipped_locked_period" || out.status === "skipped_no_booking") skipped++;
    else failed++;
  }
  return { posted, skipped, failed };
}

// =============================================================================
// Hub metrics
// =============================================================================

export interface ReconciliationMetrics {
  pending: number;
  posted: number;
  skippedLocked: number;
  failed: number;
  unposted: number;
  totalBalanceDueMinor: bigint;
  currency: string | null;
}

export async function getReconciliationMetrics(): Promise<ReconciliationMetrics> {
  const db = getDb();
  if (!db) {
    return {
      pending: 0,
      posted: 0,
      skippedLocked: 0,
      failed: 0,
      unposted: 0,
      totalBalanceDueMinor: 0n,
      currency: null,
    };
  }
  // Stage 9.I — was 3 sequential queries: status group-by, unposted
  // JOIN count, and "fetch every posted row to sum balances in JS".
  // The third was the smoking gun (every posted row crossed the wire).
  // Collapsed into 2 parallel queries: one aggregate over finance_links
  // with FILTER + SUM, plus the JOIN-NOT-EXISTS unposted count.
  const [[agg], [unpostedRow]] = await Promise.all([
    db
      .select({
        pending: sql<number>`COUNT(*) FILTER (WHERE ${directBookingFinanceLinks.status} = 'pending')::int`,
        posted: sql<number>`COUNT(*) FILTER (WHERE ${directBookingFinanceLinks.status} = 'posted')::int`,
        skippedLocked: sql<number>`COUNT(*) FILTER (WHERE ${directBookingFinanceLinks.status} = 'skipped_locked_period')::int`,
        failed: sql<number>`COUNT(*) FILTER (WHERE ${directBookingFinanceLinks.status} = 'failed')::int`,
        totalBalanceDueMinor: sql<string | null>`SUM(${directBookingFinanceLinks.balanceDueMinor}) FILTER (WHERE ${directBookingFinanceLinks.status} = 'posted')::text`,
        currency: sql<string | null>`MIN(${directBookingFinanceLinks.currency}) FILTER (WHERE ${directBookingFinanceLinks.status} = 'posted')`,
      })
      .from(directBookingFinanceLinks),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(directBookingRequests)
      .leftJoin(
        directBookingFinanceLinks,
        eq(directBookingFinanceLinks.requestId, directBookingRequests.id),
      )
      .where(
        and(
          eq(directBookingRequests.status, "converted"),
          isNull(directBookingFinanceLinks.id),
        ),
      ),
  ]);

  const total = agg?.totalBalanceDueMinor
    ? BigInt(agg.totalBalanceDueMinor)
    : 0n;
  return {
    pending: agg?.pending ?? 0,
    posted: agg?.posted ?? 0,
    skippedLocked: agg?.skippedLocked ?? 0,
    failed: agg?.failed ?? 0,
    unposted: unpostedRow?.count ?? 0,
    totalBalanceDueMinor: total,
    currency: agg?.currency ?? null,
  };
}
