import "server-only";

import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  sql,
} from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  bookings,
  bookingChannels,
  guests,
} from "@/lib/db/schema/bookings";
import { villaCalendarBlocks } from "@/lib/db/schema/availability";
import { villas, projects } from "@/lib/db/schema/projects";
import { ownershipShares } from "@/lib/db/schema/ownership";
import {
  directBookingHolds,
  directBookingRequests,
} from "@/lib/db/schema/direct-booking";
import { directBookingDeposits } from "@/lib/db/schema/payments";
import {
  statementLines,
  revenueLines,
} from "@/lib/db/schema/finance";
import { ownerStayRequests } from "@/lib/db/schema/owner-stays";
import {
  ownerBookingSummaries,
  ownerBookingRevenueBreakdowns,
  ownerRevenueSourceMonthly,
  type NewOwnerBookingSummary,
  type NewOwnerBookingRevenueBreakdown,
} from "@/lib/db/schema/owner-bookings";
import {
  buildOwnerLabel,
  calculateBookingNights,
  isOwnerVisibleBookingStatus,
  mapBookingChannelToSourceType,
  maskOwnerGuestName,
  publicBookingStatus,
  type OwnerBookingPublicStatus,
  type OwnerBookingSourceType,
} from "./calendar-pure";
import {
  buildRevenueSourceMonthlyBuckets,
  type RevenueBreakdownEntry,
  type RevenueSourceMonthlyInput,
} from "./revenue-pure";

/**
 * Prompt 108 — Owner-booking projection rebuild.
 *
 * Produces three owner-safe projection rows: one per booking (or
 * unconverted direct-booking request that is still blocking dates), a
 * list of revenue breakdown line items per booking, and a per-month
 * source mix bucket.
 *
 * Owners read these via `services.ts` — never the canonical
 * direct-booking / finance tables.  This module is the single seam
 * where guest emails / phones / payment provider IDs / finance link
 * IDs are dropped.
 */

interface RebuildWindow {
  from: string;
  to: string;
}

const ROLLING_WINDOW_DAYS = { from: 90, to: 365 };

export function defaultRebuildWindow(today: Date = new Date()): RebuildWindow {
  const from = new Date(
    today.getTime() - ROLLING_WINDOW_DAYS.from * 24 * 60 * 60 * 1000,
  );
  const to = new Date(
    today.getTime() + ROLLING_WINDOW_DAYS.to * 24 * 60 * 60 * 1000,
  );
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

// -----------------------------------------------------------------------------
// Public entry points
// -----------------------------------------------------------------------------

export interface RebuildOutcome {
  ownersProcessed: number;
  summariesUpserted: number;
  breakdownsUpserted: number;
  monthlyBucketsUpserted: number;
}

const EMPTY: RebuildOutcome = {
  ownersProcessed: 0,
  summariesUpserted: 0,
  breakdownsUpserted: 0,
  monthlyBucketsUpserted: 0,
};

export async function rebuildOwnerBookingSummariesForAllOwners(
  window: RebuildWindow = defaultRebuildWindow(),
): Promise<RebuildOutcome> {
  const db = getDb();
  if (!db) return EMPTY;
  const ownerRows = await db
    .selectDistinct({ ownerId: ownershipShares.ownerId })
    .from(ownershipShares)
    .where(eq(ownershipShares.status, "active"));
  let outcome: RebuildOutcome = { ...EMPTY };
  for (const row of ownerRows) {
    const r = await rebuildOwnerBookingSummariesForOwner(row.ownerId, window);
    outcome = sumOutcome(outcome, r);
  }
  outcome.ownersProcessed = ownerRows.length;
  return outcome;
}

export async function rebuildOwnerBookingSummariesForOwner(
  ownerId: string,
  window: RebuildWindow = defaultRebuildWindow(),
): Promise<RebuildOutcome> {
  const db = getDb();
  if (!db) return EMPTY;
  const villaRows = await db
    .select({
      villaId: ownershipShares.villaId,
      projectId: ownershipShares.projectId,
    })
    .from(ownershipShares)
    .where(
      and(
        eq(ownershipShares.ownerId, ownerId),
        eq(ownershipShares.status, "active"),
      ),
    );
  const villaIds = Array.from(
    new Set(villaRows.map((r) => r.villaId).filter(Boolean) as string[]),
  );
  if (villaIds.length === 0) return EMPTY;

  // Org for this owner's derived projection rows. Owners belong to a
  // single org; resolve it from any owned villa's project. The projection
  // is a derived view, so child rows copy this org.
  const [orgRow] = await db
    .select({ organizationId: projects.organizationId })
    .from(villas)
    .leftJoin(projects, eq(projects.id, villas.projectId))
    .where(inArray(villas.id, villaIds))
    .limit(1);
  const organizationId = orgRow?.organizationId ?? null;

  // Always wipe + reinsert the projection rows that fall in the window
  // for these villas.  Idempotent by design: the projection is a
  // derived view, never a system of record.
  await db
    .delete(ownerBookingSummaries)
    .where(
      and(
        eq(ownerBookingSummaries.ownerId, ownerId),
        gte(ownerBookingSummaries.checkOut, window.from),
        lte(ownerBookingSummaries.checkIn, window.to),
      ),
    );

  let summariesUpserted = 0;
  let breakdownsUpserted = 0;

  // 1) Bookings.
  const bookingRows = await readBookingRows(villaIds, window);
  for (const row of bookingRows) {
    const sourceType: OwnerBookingSourceType = mapBookingChannelToSourceType({
      channelKey: row.channelKey,
      channelType: row.channelType,
      hasDirectBookingRequest: !!row.directBookingRequestId,
    });
    const status: OwnerBookingPublicStatus = publicBookingStatus({
      bookingStatus: row.status,
      bookingCheckIn: row.checkIn,
      bookingCheckOut: row.checkOut,
      requestStatus: row.requestStatus,
      depositStatus: row.depositStatus,
      today: window.from <= todayIso() ? todayIso() : null,
    });
    const ownerLabel = buildOwnerLabel(sourceType, status, row.channelLabel);
    const visible = isOwnerVisibleBookingStatus(status, true);
    const summary = await insertSummary(ownerId, organizationId, {
      villaId: row.villaId,
      projectId: row.projectId,
      bookingId: row.bookingId,
      directBookingRequestId: row.directBookingRequestId,
      directBookingHoldId: row.directBookingHoldId,
      sourceType,
      publicStatus: status,
      ownerLabel,
      guestLabel: maskOwnerGuestName(row.guestFullName),
      guestCountry: row.guestCountry,
      channelLabel: row.channelLabel,
      checkIn: row.checkIn,
      checkOut: row.checkOut,
      nights: calculateBookingNights(row.checkIn, row.checkOut) || row.nights,
      guestCount: row.guestCount,
      totalAmountMinor: row.totalAmountMinor,
      ownerRevenueMinor: row.ownerRevenueMinor,
      currency: row.currency,
      revenuePosted: row.revenuePosted,
      statementId: row.statementId,
      statementLineId: row.statementLineId,
      ownerVisible: visible,
      visibilityNotes: null,
      sourceUpdatedAt: row.sourceUpdatedAt,
    });
    summariesUpserted += 1;
    breakdownsUpserted += await insertBreakdowns(
      summary.id,
      ownerId,
      organizationId,
      row.villaId,
      row.bookingId,
      row.directBookingRequestId,
      row.breakdownInputs,
    );
  }

  // 2) Direct-booking requests without a converted booking but
  // still blocking the calendar.
  const requestRows = await readUnconvertedRequestRows(villaIds, window);
  for (const r of requestRows) {
    const status = publicBookingStatus({
      requestStatus: r.requestStatus,
      depositStatus: r.depositStatus,
      holdStatus: r.holdStatus,
    });
    if (!isOwnerVisibleBookingStatus(status, r.holdStatus === "active")) {
      continue;
    }
    const ownerLabel = buildOwnerLabel("direct_booking", status, "Direct");
    const summary = await insertSummary(ownerId, organizationId, {
      villaId: r.villaId,
      projectId: r.projectId,
      bookingId: null,
      directBookingRequestId: r.requestId,
      directBookingHoldId: r.holdId,
      sourceType: "direct_booking",
      publicStatus: status,
      ownerLabel,
      guestLabel: maskOwnerGuestName(r.guestFirstName),
      guestCountry: r.guestCountry,
      channelLabel: "Direct",
      checkIn: r.checkIn,
      checkOut: r.checkOut,
      nights: calculateBookingNights(r.checkIn, r.checkOut),
      guestCount: r.guestCount,
      totalAmountMinor: r.totalAmountMinor,
      ownerRevenueMinor: null,
      currency: r.currency,
      revenuePosted: false,
      statementId: null,
      statementLineId: null,
      ownerVisible: true,
      visibilityNotes: null,
      sourceUpdatedAt: r.sourceUpdatedAt,
    });
    summariesUpserted += 1;
    if (r.totalAmountMinor && r.currency) {
      breakdownsUpserted += await insertBreakdowns(
        summary.id,
        ownerId,
        organizationId,
        r.villaId,
        null,
        r.requestId,
        [
          {
            category: "accommodation",
            label: "Accommodation (estimated)",
            amountMinor: r.totalAmountMinor,
            currency: r.currency,
            direction: "revenue",
            ownerVisible: true,
            sortOrder: 10,
          },
        ],
      );
    }
  }

  // 3) Owner stays.
  const stayRows = await readOwnerStayRows(ownerId, villaIds, window);
  for (const s of stayRows) {
    const summary = await insertSummary(ownerId, organizationId, {
      villaId: s.villaId,
      projectId: s.projectId,
      bookingId: null,
      directBookingRequestId: null,
      directBookingHoldId: null,
      sourceType: "owner_stay",
      publicStatus: "owner_stay",
      ownerLabel: "Owner stay",
      guestLabel: null,
      guestCountry: null,
      channelLabel: null,
      checkIn: s.requestedStart,
      checkOut: s.requestedEnd,
      nights: calculateBookingNights(s.requestedStart, s.requestedEnd),
      guestCount: s.guestsCount,
      totalAmountMinor: null,
      ownerRevenueMinor: null,
      currency: s.currency,
      revenuePosted: false,
      statementId: null,
      statementLineId: null,
      ownerVisible: true,
      visibilityNotes: null,
      sourceUpdatedAt: s.sourceUpdatedAt,
    });
    summariesUpserted += 1;
    const totalCharge = BigInt(s.estimatedTotalOwnerChargeMinor || 0);
    if (totalCharge > 0n) {
      breakdownsUpserted += await insertBreakdowns(
        summary.id,
        ownerId,
        organizationId,
        s.villaId,
        null,
        null,
        [
          {
            category: "owner_payout_effect",
            label: "Owner stay charges (estimated)",
            amountMinor: totalCharge,
            currency: s.currency,
            direction: "deduction",
            ownerVisible: true,
            sortOrder: 50,
          },
        ],
      );
    }
  }

  // 4) Maintenance / internal holds (owner-visible only).
  const blockRows = await readOwnerVisibleBlocks(villaIds, window);
  for (const b of blockRows) {
    const sourceType: OwnerBookingSourceType =
      b.blockType === "maintenance"
        ? "maintenance_block"
        : b.blockType === "internal_hold" || b.blockType === "channel_sync"
          ? "internal_hold"
          : "maintenance_block";
    const status: OwnerBookingPublicStatus =
      sourceType === "maintenance_block" ? "maintenance" : "blocked";
    const ownerLabel =
      sourceType === "maintenance_block"
        ? "Maintenance block"
        : "Internal hold";
    await insertSummary(ownerId, organizationId, {
      villaId: b.villaId,
      projectId: b.projectId,
      bookingId: null,
      directBookingRequestId: null,
      directBookingHoldId: null,
      sourceType,
      publicStatus: status,
      ownerLabel,
      guestLabel: null,
      guestCountry: null,
      channelLabel: null,
      checkIn: b.startsOn,
      checkOut: b.endsOn,
      nights: Math.max(1, calculateBookingNights(b.startsOn, b.endsOn)),
      guestCount: null,
      totalAmountMinor: null,
      ownerRevenueMinor: null,
      currency: null,
      revenuePosted: false,
      statementId: null,
      statementLineId: null,
      ownerVisible: true,
      visibilityNotes: null,
      sourceUpdatedAt: b.sourceUpdatedAt,
    });
    summariesUpserted += 1;
  }

  // Also rebuild the monthly source mix for this owner.
  const monthlyOut = await rebuildOwnerRevenueSourceMonthlyForOwner(
    ownerId,
    window,
  );

  return {
    ownersProcessed: 1,
    summariesUpserted,
    breakdownsUpserted,
    monthlyBucketsUpserted: monthlyOut.upserted,
  };
}

export async function rebuildOwnerBookingSummaryForBooking(
  bookingId: string,
): Promise<RebuildOutcome> {
  const db = getDb();
  if (!db) return EMPTY;
  const [row] = await db
    .select({
      villaId: bookings.villaId,
      checkIn: bookings.checkIn,
      checkOut: bookings.checkOut,
    })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!row) return EMPTY;
  const owners = await db
    .select({ ownerId: ownershipShares.ownerId })
    .from(ownershipShares)
    .where(
      and(
        eq(ownershipShares.villaId, row.villaId),
        eq(ownershipShares.status, "active"),
      ),
    );
  let outcome: RebuildOutcome = { ...EMPTY };
  for (const o of owners) {
    const r = await rebuildOwnerBookingSummariesForOwner(o.ownerId, {
      from: row.checkIn as unknown as string,
      to: row.checkOut as unknown as string,
    });
    outcome = sumOutcome(outcome, r);
  }
  return outcome;
}

export async function rebuildOwnerBookingSummaryForDirectRequest(
  requestId: string,
): Promise<RebuildOutcome> {
  const db = getDb();
  if (!db) return EMPTY;
  const [row] = await db
    .select({
      villaId: directBookingRequests.villaId,
      holdId: directBookingRequests.holdId,
    })
    .from(directBookingRequests)
    .where(eq(directBookingRequests.id, requestId))
    .limit(1);
  if (!row) return EMPTY;
  const owners = await db
    .select({ ownerId: ownershipShares.ownerId })
    .from(ownershipShares)
    .where(
      and(
        eq(ownershipShares.villaId, row.villaId),
        eq(ownershipShares.status, "active"),
      ),
    );
  let outcome: RebuildOutcome = { ...EMPTY };
  for (const o of owners) {
    const r = await rebuildOwnerBookingSummariesForOwner(o.ownerId);
    outcome = sumOutcome(outcome, r);
  }
  return outcome;
}

// -----------------------------------------------------------------------------
// Monthly source mix
// -----------------------------------------------------------------------------

export async function rebuildOwnerRevenueSourceMonthlyForAllOwners(
  window: RebuildWindow = defaultRebuildWindow(),
): Promise<{ ownersProcessed: number; upserted: number }> {
  const db = getDb();
  if (!db) return { ownersProcessed: 0, upserted: 0 };
  const ownerRows = await db
    .selectDistinct({ ownerId: ownershipShares.ownerId })
    .from(ownershipShares)
    .where(eq(ownershipShares.status, "active"));
  let upserted = 0;
  for (const row of ownerRows) {
    const out = await rebuildOwnerRevenueSourceMonthlyForOwner(
      row.ownerId,
      window,
    );
    upserted += out.upserted;
  }
  return { ownersProcessed: ownerRows.length, upserted };
}

export async function rebuildOwnerRevenueSourceMonthlyForOwner(
  ownerId: string,
  window: RebuildWindow = defaultRebuildWindow(),
): Promise<{ upserted: number }> {
  const db = getDb();
  if (!db) return { upserted: 0 };

  // Pull the most recent owner summaries and translate them into the
  // input rows the pure helper expects.
  const rows = await db
    .select({
      ownerId: ownerBookingSummaries.ownerId,
      organizationId: ownerBookingSummaries.organizationId,
      villaId: ownerBookingSummaries.villaId,
      projectId: ownerBookingSummaries.projectId,
      checkIn: ownerBookingSummaries.checkIn,
      checkOut: ownerBookingSummaries.checkOut,
      sourceType: ownerBookingSummaries.sourceType,
      totalAmountMinor: ownerBookingSummaries.totalAmountMinor,
      ownerRevenueMinor: ownerBookingSummaries.ownerRevenueMinor,
      currency: ownerBookingSummaries.currency,
      revenuePosted: ownerBookingSummaries.revenuePosted,
      publicStatus: ownerBookingSummaries.publicStatus,
      nights: ownerBookingSummaries.nights,
    })
    .from(ownerBookingSummaries)
    .where(
      and(
        eq(ownerBookingSummaries.ownerId, ownerId),
        gte(ownerBookingSummaries.checkOut, window.from),
        lte(ownerBookingSummaries.checkIn, window.to),
      ),
    );

  const inputs: RevenueSourceMonthlyInput[] = [];
  for (const r of rows) {
    if (!r.currency) continue;
    if (
      r.publicStatus !== "confirmed" &&
      r.publicStatus !== "in_house" &&
      r.publicStatus !== "completed"
    ) {
      continue;
    }
    const gross = r.ownerRevenueMinor ?? r.totalAmountMinor ?? 0n;
    if (gross === 0n) continue;
    inputs.push({
      ownerId: r.ownerId,
      villaId: r.villaId ?? null,
      projectId: r.projectId ?? null,
      serviceDate: r.checkIn as unknown as string,
      sourceType: r.sourceType as OwnerBookingSourceType,
      grossRevenueMinor: gross,
      deductionsMinor: 0n,
      netOwnerEffectMinor: gross,
      bookingCount: 1,
      occupiedNights: r.nights,
      currency: r.currency,
    });
  }

  // Wipe + reinsert per owner across the window.  Idempotent.
  await db
    .delete(ownerRevenueSourceMonthly)
    .where(
      and(
        eq(ownerRevenueSourceMonthly.ownerId, ownerId),
        gte(ownerRevenueSourceMonthly.periodMonth, window.from),
        lte(ownerRevenueSourceMonthly.periodMonth, window.to),
      ),
    );

  // Org is constant per owner; take it from any summary row in the window.
  const organizationId = rows.find((r) => r.organizationId)?.organizationId ?? null;
  const buckets = buildRevenueSourceMonthlyBuckets(inputs);
  if (buckets.length === 0) return { upserted: 0 };
  await db.insert(ownerRevenueSourceMonthly).values(
    buckets.map((b) => ({
      organizationId,
      ownerId: b.ownerId,
      villaId: b.villaId,
      projectId: b.projectId,
      periodMonth: b.periodMonth,
      sourceType: b.sourceType,
      grossRevenueMinor: b.grossRevenueMinor,
      deductionsMinor: b.deductionsMinor,
      netOwnerEffectMinor: b.netOwnerEffectMinor,
      bookingCount: b.bookingCount,
      occupiedNights: b.occupiedNights,
      currency: b.currency,
    })),
  );
  return { upserted: buckets.length };
}

// -----------------------------------------------------------------------------
// Per-source readers
// -----------------------------------------------------------------------------

interface BookingProjectionRow {
  bookingId: string;
  villaId: string | null;
  projectId: string | null;
  channelKey: string | null;
  channelLabel: string | null;
  channelType: string | null;
  status: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  guestFullName: string | null;
  guestCountry: string | null;
  guestCount: number | null;
  totalAmountMinor: bigint | null;
  ownerRevenueMinor: bigint | null;
  currency: string;
  revenuePosted: boolean;
  statementId: string | null;
  statementLineId: string | null;
  directBookingRequestId: string | null;
  directBookingHoldId: string | null;
  requestStatus: string | null;
  depositStatus: string | null;
  sourceUpdatedAt: string | null;
  breakdownInputs: BreakdownInput[];
}

interface BreakdownInput {
  category: RevenueBreakdownEntry["category"];
  label: string;
  amountMinor: bigint;
  currency: string;
  direction: RevenueBreakdownEntry["direction"];
  ownerVisible: boolean;
  sortOrder: number;
}

async function readBookingRows(
  villaIds: ReadonlyArray<string>,
  window: RebuildWindow,
): Promise<BookingProjectionRow[]> {
  const db = getDb();
  if (!db || villaIds.length === 0) return [];
  const rows = await db
    .select({
      bookingId: bookings.id,
      villaId: bookings.villaId,
      checkIn: bookings.checkIn,
      checkOut: bookings.checkOut,
      nights: bookings.nights,
      status: bookings.status,
      currency: bookings.currency,
      grossAmount: bookings.grossAmount,
      adults: bookings.adults,
      children: bookings.children,
      channelKey: bookingChannels.key,
      channelLabel: bookingChannels.name,
      channelType: bookingChannels.type,
      guestFullName: guests.fullName,
      guestCountry: guests.nationality,
      villaProjectId: villas.projectId,
      requestId: directBookingRequests.id,
      requestStatus: directBookingRequests.status,
      requestHoldId: directBookingRequests.holdId,
      depositStatus: directBookingDeposits.status,
      sourceUpdatedAt: bookings.updatedAt,
    })
    .from(bookings)
    .leftJoin(villas, eq(villas.id, bookings.villaId))
    .leftJoin(bookingChannels, eq(bookingChannels.id, bookings.channelId))
    .leftJoin(guests, eq(guests.id, bookings.guestId))
    .leftJoin(
      directBookingRequests,
      eq(directBookingRequests.bookingId, bookings.id),
    )
    .leftJoin(
      directBookingDeposits,
      eq(directBookingDeposits.requestId, directBookingRequests.id),
    )
    .where(
      and(
        inArray(bookings.villaId, villaIds as string[]),
        lte(bookings.checkIn, window.to),
        gte(bookings.checkOut, window.from),
      ),
    )
    .orderBy(asc(bookings.checkIn));

  // Compute revenue posting + statement linkage per booking via
  // statement_lines.source_table / source_id and revenue_lines.
  const bookingIds = rows.map((r) => r.bookingId);
  const revenueByBooking = await loadRevenueLinkageForBookings(bookingIds);

  const out: BookingProjectionRow[] = [];
  for (const r of rows) {
    const linkage = revenueByBooking.get(r.bookingId) ?? {
      ownerRevenueMinor: null,
      statementId: null,
      statementLineId: null,
      revenuePosted: false,
      breakdowns: [],
    };
    const totalMinor = grossToMinor(r.grossAmount, r.currency);
    const breakdowns: BreakdownInput[] = [];
    if (totalMinor) {
      breakdowns.push({
        category: "accommodation",
        label: "Accommodation",
        amountMinor: totalMinor,
        currency: r.currency,
        direction: "revenue",
        ownerVisible: true,
        sortOrder: 10,
      });
    }
    breakdowns.push(...linkage.breakdowns);
    out.push({
      bookingId: r.bookingId,
      villaId: r.villaId,
      projectId: r.villaProjectId ?? null,
      channelKey: r.channelKey ?? null,
      channelLabel: r.channelLabel ?? null,
      channelType: r.channelType ?? null,
      status: r.status,
      checkIn: r.checkIn as unknown as string,
      checkOut: r.checkOut as unknown as string,
      nights: r.nights,
      guestFullName: r.guestFullName ?? null,
      guestCountry: r.guestCountry ?? null,
      guestCount:
        ((r.adults ?? 0) + (r.children ?? 0)) || null,
      totalAmountMinor: totalMinor,
      ownerRevenueMinor: linkage.ownerRevenueMinor,
      currency: r.currency,
      revenuePosted: linkage.revenuePosted,
      statementId: linkage.statementId,
      statementLineId: linkage.statementLineId,
      directBookingRequestId: r.requestId ?? null,
      directBookingHoldId: r.requestHoldId ?? null,
      requestStatus: r.requestStatus ?? null,
      depositStatus: r.depositStatus ?? null,
      sourceUpdatedAt:
        r.sourceUpdatedAt instanceof Date
          ? r.sourceUpdatedAt.toISOString()
          : (r.sourceUpdatedAt as unknown as string | null),
      breakdownInputs: breakdowns,
    });
  }
  return out;
}

interface RevenueLinkage {
  ownerRevenueMinor: bigint | null;
  statementId: string | null;
  statementLineId: string | null;
  revenuePosted: boolean;
  breakdowns: BreakdownInput[];
}

async function loadRevenueLinkageForBookings(
  bookingIds: ReadonlyArray<string>,
): Promise<Map<string, RevenueLinkage>> {
  const out = new Map<string, RevenueLinkage>();
  if (bookingIds.length === 0) return out;
  const db = getDb();
  if (!db) return out;

  // Find revenue_lines posted for these bookings.
  const rev = await db
    .select({
      bookingId: revenueLines.bookingId,
      amountMinor: revenueLines.amountMinor,
      currency: revenueLines.currency,
      revenueType: revenueLines.revenueType,
      description: revenueLines.description,
      id: revenueLines.id,
      status: revenueLines.status,
    })
    .from(revenueLines)
    .where(
      and(
        inArray(revenueLines.bookingId, bookingIds as string[]),
        eq(revenueLines.status, "posted"),
      ),
    );
  // Find matching statement_lines.
  const revIds = rev.map((r) => r.id);
  let stmtRows: {
    bookingId: string | null;
    statementId: string;
    lineId: string;
    amountMinor: bigint;
    currency: string;
    description: string;
    category: string;
    sourceId: string | null;
    sourceTable: string | null;
  }[] = [];
  if (revIds.length > 0) {
    stmtRows = await db
      .select({
        bookingId: revenueLines.bookingId,
        statementId: statementLines.statementId,
        lineId: statementLines.id,
        amountMinor: statementLines.amountMinor,
        currency: statementLines.currency,
        description: statementLines.description,
        category: statementLines.category,
        sourceId: statementLines.sourceId,
        sourceTable: statementLines.sourceTable,
      })
      .from(statementLines)
      .leftJoin(
        revenueLines,
        and(
          eq(statementLines.sourceTable, sql`'revenue_lines'`),
          eq(statementLines.sourceId, revenueLines.id),
        ),
      )
      .where(
        and(
          inArray(revenueLines.id, revIds as string[]),
          eq(statementLines.ownerVisible, true),
        ),
      );
  }
  // Aggregate per booking.
  for (const r of rev) {
    if (!r.bookingId) continue;
    const breakdowns: BreakdownInput[] = [];
    breakdowns.push({
      category:
        r.revenueType === "direct_booking_accommodation"
          ? "accommodation"
          : "service_revenue",
      label: r.description,
      amountMinor: r.amountMinor,
      currency: r.currency,
      direction: "revenue",
      ownerVisible: true,
      sortOrder: 20,
    });
    out.set(r.bookingId, {
      ownerRevenueMinor: r.amountMinor,
      statementId: null,
      statementLineId: null,
      revenuePosted: true,
      breakdowns,
    });
  }
  for (const s of stmtRows) {
    if (!s.bookingId) continue;
    const existing = out.get(s.bookingId);
    if (!existing) continue;
    existing.statementId = s.statementId;
    existing.statementLineId = s.lineId;
    // Prefer the statement line amount as owner revenue (allocated).
    existing.ownerRevenueMinor = s.amountMinor;
  }
  return out;
}

interface UnconvertedRequestRow {
  requestId: string;
  holdId: string;
  villaId: string | null;
  projectId: string | null;
  guestFirstName: string | null;
  guestCountry: string | null;
  guestCount: number;
  checkIn: string;
  checkOut: string;
  nights: number;
  currency: string;
  totalAmountMinor: bigint | null;
  requestStatus: string;
  depositStatus: string | null;
  holdStatus: string;
  sourceUpdatedAt: string | null;
}

async function readUnconvertedRequestRows(
  villaIds: ReadonlyArray<string>,
  window: RebuildWindow,
): Promise<UnconvertedRequestRow[]> {
  const db = getDb();
  if (!db || villaIds.length === 0) return [];
  const rows = await db
    .select({
      requestId: directBookingRequests.id,
      requestStatus: directBookingRequests.status,
      bookingId: directBookingRequests.bookingId,
      requestVillaId: directBookingRequests.villaId,
      requestProjectId: directBookingRequests.projectId,
      guestFirstName: directBookingRequests.guestFirstName,
      guestCountry: directBookingRequests.guestCountry,
      requestUpdatedAt: directBookingRequests.updatedAt,
      holdId: directBookingHolds.id,
      holdStatus: directBookingHolds.status,
      holdCheckIn: directBookingHolds.checkIn,
      holdCheckOut: directBookingHolds.checkOut,
      nights: directBookingHolds.nights,
      guestCount: directBookingHolds.guestCount,
      currency: directBookingHolds.currency,
      totalMinor: directBookingHolds.totalMinor,
      depositStatus: directBookingDeposits.status,
    })
    .from(directBookingRequests)
    .leftJoin(
      directBookingHolds,
      eq(directBookingHolds.id, directBookingRequests.holdId),
    )
    .leftJoin(
      directBookingDeposits,
      eq(directBookingDeposits.requestId, directBookingRequests.id),
    )
    .where(
      and(
        inArray(directBookingRequests.villaId, villaIds as string[]),
        isNull(directBookingRequests.bookingId),
        lte(directBookingHolds.checkIn, window.to),
        gte(directBookingHolds.checkOut, window.from),
      ),
    );
  return rows
    .filter((r) => r.holdId !== null && r.holdCheckIn !== null)
    .map((r) => ({
      requestId: r.requestId,
      holdId: r.holdId as string,
      villaId: r.requestVillaId ?? null,
      projectId: r.requestProjectId ?? null,
      guestFirstName: r.guestFirstName ?? null,
      guestCountry: r.guestCountry ?? null,
      guestCount: r.guestCount ?? 1,
      checkIn: r.holdCheckIn as unknown as string,
      checkOut: r.holdCheckOut as unknown as string,
      nights: r.nights ?? 0,
      currency: r.currency ?? "USD",
      totalAmountMinor: r.totalMinor ?? null,
      requestStatus: r.requestStatus,
      depositStatus: r.depositStatus ?? null,
      holdStatus: r.holdStatus ?? "active",
      sourceUpdatedAt:
        r.requestUpdatedAt instanceof Date
          ? r.requestUpdatedAt.toISOString()
          : (r.requestUpdatedAt as unknown as string | null),
    }));
}

interface OwnerStayRow {
  ownerStayId: string;
  villaId: string | null;
  projectId: string | null;
  requestedStart: string;
  requestedEnd: string;
  guestsCount: number | null;
  currency: string;
  estimatedTotalOwnerChargeMinor: number;
  sourceUpdatedAt: string | null;
}

async function readOwnerStayRows(
  ownerId: string,
  villaIds: ReadonlyArray<string>,
  window: RebuildWindow,
): Promise<OwnerStayRow[]> {
  const db = getDb();
  if (!db || villaIds.length === 0) return [];
  const rows = await db
    .select({
      id: ownerStayRequests.id,
      villaId: ownerStayRequests.villaId,
      projectId: ownerStayRequests.projectId,
      requestedStart: ownerStayRequests.requestedStart,
      requestedEnd: ownerStayRequests.requestedEnd,
      guestsCount: ownerStayRequests.guestsCount,
      currency: ownerStayRequests.currency,
      estimatedTotalOwnerChargeMinor:
        ownerStayRequests.estimatedTotalOwnerChargeMinor,
      status: ownerStayRequests.status,
      updatedAt: ownerStayRequests.updatedAt,
    })
    .from(ownerStayRequests)
    .where(
      and(
        eq(ownerStayRequests.ownerId, ownerId),
        inArray(ownerStayRequests.villaId, villaIds as string[]),
        lte(ownerStayRequests.requestedStart, window.to),
        gte(ownerStayRequests.requestedEnd, window.from),
      ),
    );
  return rows
    .filter((r) => r.status !== "rejected" && r.status !== "cancelled")
    .map((r) => ({
      ownerStayId: r.id,
      villaId: r.villaId,
      projectId: r.projectId ?? null,
      requestedStart: r.requestedStart as unknown as string,
      requestedEnd: r.requestedEnd as unknown as string,
      guestsCount: r.guestsCount ?? null,
      currency: r.currency,
      estimatedTotalOwnerChargeMinor: Number(
        r.estimatedTotalOwnerChargeMinor ?? 0,
      ),
      sourceUpdatedAt:
        r.updatedAt instanceof Date ? r.updatedAt.toISOString() : null,
    }));
}

interface OwnerVisibleBlockRow {
  blockId: string;
  villaId: string;
  projectId: string | null;
  blockType: string;
  startsOn: string;
  endsOn: string;
  sourceUpdatedAt: string | null;
}

async function readOwnerVisibleBlocks(
  villaIds: ReadonlyArray<string>,
  window: RebuildWindow,
): Promise<OwnerVisibleBlockRow[]> {
  const db = getDb();
  if (!db || villaIds.length === 0) return [];
  const rows = await db
    .select({
      id: villaCalendarBlocks.id,
      villaId: villaCalendarBlocks.villaId,
      projectId: villaCalendarBlocks.projectId,
      blockType: villaCalendarBlocks.blockType,
      startsAt: villaCalendarBlocks.startsAt,
      endsAt: villaCalendarBlocks.endsAt,
      ownerVisible: villaCalendarBlocks.ownerVisible,
      status: villaCalendarBlocks.status,
      updatedAt: villaCalendarBlocks.updatedAt,
    })
    .from(villaCalendarBlocks)
    .where(
      and(
        inArray(villaCalendarBlocks.villaId, villaIds as string[]),
        eq(villaCalendarBlocks.status, "active"),
        eq(villaCalendarBlocks.ownerVisible, true),
        lte(villaCalendarBlocks.startsAt, new Date(`${window.to}T23:59:59Z`)),
        sql`${villaCalendarBlocks.endsAt} > ${window.from}::timestamptz`,
      ),
    );
  return rows.map((r) => ({
    blockId: r.id,
    villaId: r.villaId,
    projectId: r.projectId ?? null,
    blockType: r.blockType,
    startsOn: (r.startsAt as Date).toISOString().slice(0, 10),
    endsOn: (r.endsAt as Date).toISOString().slice(0, 10),
    sourceUpdatedAt:
      r.updatedAt instanceof Date ? r.updatedAt.toISOString() : null,
  }));
}

// -----------------------------------------------------------------------------
// Inserts
// -----------------------------------------------------------------------------

type SummaryPayload = Omit<
  NewOwnerBookingSummary,
  "id" | "ownerId" | "createdAt" | "updatedAt" | "sourceUpdatedAt"
> & { sourceUpdatedAt: string | null };

async function insertSummary(
  ownerId: string,
  organizationId: string | null,
  payload: SummaryPayload,
): Promise<{ id: string }> {
  const db = getDb();
  if (!db) throw new Error("DB unavailable");
  const { sourceUpdatedAt, ...rest } = payload;
  const [row] = await db
    .insert(ownerBookingSummaries)
    .values({
      organizationId,
      ownerId,
      ...rest,
      sourceUpdatedAt: sourceUpdatedAt ? new Date(sourceUpdatedAt) : null,
    })
    .returning({ id: ownerBookingSummaries.id });
  return row;
}

async function insertBreakdowns(
  summaryId: string,
  ownerId: string,
  organizationId: string | null,
  villaId: string | null,
  bookingId: string | null,
  directBookingRequestId: string | null,
  inputs: ReadonlyArray<BreakdownInput>,
): Promise<number> {
  const db = getDb();
  if (!db || inputs.length === 0) return 0;
  const values: NewOwnerBookingRevenueBreakdown[] = inputs.map((i) => ({
    organizationId,
    ownerBookingSummaryId: summaryId,
    ownerId,
    villaId,
    bookingId,
    directBookingRequestId,
    category: i.category,
    label: i.label,
    amountMinor: i.amountMinor,
    currency: i.currency,
    direction: i.direction,
    ownerVisible: i.ownerVisible,
    sortOrder: i.sortOrder,
  }));
  await db.insert(ownerBookingRevenueBreakdowns).values(values);
  return values.length;
}

// -----------------------------------------------------------------------------
// Internal utilities
// -----------------------------------------------------------------------------

function sumOutcome(a: RebuildOutcome, b: RebuildOutcome): RebuildOutcome {
  return {
    ownersProcessed: a.ownersProcessed + b.ownersProcessed,
    summariesUpserted: a.summariesUpserted + b.summariesUpserted,
    breakdownsUpserted: a.breakdownsUpserted + b.breakdownsUpserted,
    monthlyBucketsUpserted:
      a.monthlyBucketsUpserted + b.monthlyBucketsUpserted,
  };
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Bookings.gross_amount is stored as numeric(14,2) — convert to bigint
 * minor (2 decimal scale) deterministically.
 */
function grossToMinor(
  gross: string | null | undefined,
  _currency: string,
): bigint | null {
  if (gross === null || gross === undefined) return null;
  const cleaned = String(gross).trim();
  if (cleaned === "" || cleaned === "0" || cleaned === "0.00") return 0n;
  // Numeric "1234.56" → 123456n.
  const [whole = "0", frac = "00"] = cleaned.split(".");
  const padded = (frac + "00").slice(0, 2);
  const sign = whole.startsWith("-") ? -1n : 1n;
  const wholeAbs = whole.replace(/^-/, "").replace(/^\+/, "");
  try {
    const wholeBig = BigInt(wholeAbs);
    const fracBig = BigInt(padded);
    return sign * (wholeBig * 100n + fracBig);
  } catch {
    return null;
  }
}
