import "server-only";

import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  ownerBookingSummaries,
  ownerBookingRevenueBreakdowns,
  ownerRevenueSourceMonthly,
  type OwnerBookingSummary,
} from "@/lib/db/schema/owner-bookings";
import { ownerStatements } from "@/lib/db/schema/finance";
import { villas, projects } from "@/lib/db/schema/projects";
import { listOwnerIdsForCurrentUser } from "@/features/notifications/services";
import {
  isDemoOwnerFallbackActive,
  listDemoOwnerBookings,
  listDemoOwnerRevenueMonthly,
} from "@/features/demo-data/owner-portal-fallback";
import {
  type OwnerBookingPublicStatus,
  type OwnerBookingSourceType,
} from "./calendar-pure";
import {
  type RevenueBreakdownEntry,
  type RevenueSourceMonthlyRow,
} from "./revenue-pure";

/**
 * Owner-safe read services for the projection.
 *
 * Owners read these via the owner portal; admins read the same shapes
 * for the owner-intelligence admin pages.
 */

export interface OwnerBookingSummaryRow {
  id: string;
  ownerId: string;
  villaId: string | null;
  villaCode: string | null;
  villaName: string | null;
  projectId: string | null;
  projectName: string | null;
  bookingId: string | null;
  directBookingRequestId: string | null;
  directBookingHoldId: string | null;
  sourceType: OwnerBookingSourceType;
  publicStatus: OwnerBookingPublicStatus;
  ownerLabel: string;
  guestLabel: string | null;
  guestCountry: string | null;
  channelLabel: string | null;
  checkIn: string;
  checkOut: string;
  nights: number;
  guestCount: number | null;
  totalAmountMinor: bigint | null;
  ownerRevenueMinor: bigint | null;
  currency: string | null;
  revenuePosted: boolean;
  statementId: string | null;
  statementHref: string | null;
  ownerVisible: boolean;
  sourceUpdatedAt: string | null;
}

export interface OwnerBookingFilter {
  ownerId?: string;
  villaId?: string | null;
  sourceType?: OwnerBookingSourceType | null;
  publicStatus?: OwnerBookingPublicStatus | null;
  monthIso?: string | null; // "YYYY-MM"
  from?: string | null;
  to?: string | null;
}

// -----------------------------------------------------------------------------
// Reads
// -----------------------------------------------------------------------------

export async function listOwnerBookingSummariesForCurrentUser(
  filter?: OwnerBookingFilter,
): Promise<OwnerBookingSummaryRow[]> {
  const ownerIds = filter?.ownerId
    ? [filter.ownerId]
    : await listOwnerIdsForCurrentUser();
  if (ownerIds.length === 0) return [];
  const db = getDb();
  if (!db) return demoOwnerBookingFallback(ownerIds, filter);
  const rows = await readSummaries(ownerIds, filter ?? {});
  if (rows.length === 0) return demoOwnerBookingFallback(ownerIds, filter);
  return rows;
}

function demoOwnerBookingFallback(
  ownerIds: ReadonlyArray<string>,
  filter?: OwnerBookingFilter,
): OwnerBookingSummaryRow[] {
  if (!isDemoOwnerFallbackActive()) return [];
  const ownerSet = new Set(ownerIds);
  const rows = listDemoOwnerBookings().filter((r) => ownerSet.has(r.ownerId));
  return applyOwnerBookingFilter(rows as unknown as OwnerBookingSummaryRow[], filter);
}

function applyOwnerBookingFilter(
  rows: OwnerBookingSummaryRow[],
  filter?: OwnerBookingFilter,
): OwnerBookingSummaryRow[] {
  if (!filter) return rows;
  return rows.filter((r) => {
    if (filter.villaId && r.villaId !== filter.villaId) return false;
    if (filter.sourceType && r.sourceType !== filter.sourceType) return false;
    if (filter.publicStatus && r.publicStatus !== filter.publicStatus)
      return false;
    if (filter.from && r.checkOut < filter.from) return false;
    if (filter.to && r.checkIn > filter.to) return false;
    return true;
  });
}

export async function listOwnerBookingSummariesForOwner(
  ownerId: string,
  filter?: OwnerBookingFilter,
): Promise<OwnerBookingSummaryRow[]> {
  return readSummaries([ownerId], filter ?? {});
}

export async function getOwnerBookingSummaryById(
  id: string,
  opts?: { ownerOnly?: boolean; organizationId?: string },
): Promise<OwnerBookingSummaryRow | null> {
  const db = getDb();
  if (!db) return null;
  const ownerIds = opts?.ownerOnly
    ? await listOwnerIdsForCurrentUser()
    : null;
  const conditions = [eq(ownerBookingSummaries.id, id)];
  if (ownerIds && ownerIds.length > 0) {
    conditions.push(inArray(ownerBookingSummaries.ownerId, ownerIds));
  } else if (ownerIds && ownerIds.length === 0) {
    return null;
  }
  // TENANCY: the admin (owner-intelligence) path has no ownerOnly grant filter.
  // owner_booking_summaries carries organization_id, so the admin caller passes
  // its verified org and we hard-scope the lookup; a cross-org id reads as null.
  if (opts?.organizationId) {
    conditions.push(
      eq(ownerBookingSummaries.organizationId, opts.organizationId),
    );
  }
  const rows = await readSummariesRaw(conditions);
  return rows[0] ?? null;
}

export async function listOwnerBookingBreakdowns(
  summaryId: string,
): Promise<RevenueBreakdownEntry[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select({
      category: ownerBookingRevenueBreakdowns.category,
      label: ownerBookingRevenueBreakdowns.label,
      amountMinor: ownerBookingRevenueBreakdowns.amountMinor,
      currency: ownerBookingRevenueBreakdowns.currency,
      direction: ownerBookingRevenueBreakdowns.direction,
      ownerVisible: ownerBookingRevenueBreakdowns.ownerVisible,
      sortOrder: ownerBookingRevenueBreakdowns.sortOrder,
    })
    .from(ownerBookingRevenueBreakdowns)
    .where(eq(ownerBookingRevenueBreakdowns.ownerBookingSummaryId, summaryId))
    .orderBy(asc(ownerBookingRevenueBreakdowns.sortOrder));
  return rows.map((r) => ({
    category: r.category as RevenueBreakdownEntry["category"],
    label: r.label,
    amountMinor: r.amountMinor,
    currency: r.currency,
    direction: r.direction as RevenueBreakdownEntry["direction"],
    ownerVisible: r.ownerVisible,
    sortOrder: r.sortOrder,
  }));
}

export async function listOwnerRevenueSourceMonthly(
  ownerId: string,
  opts?: { villaId?: string | null; from?: string; to?: string },
): Promise<RevenueSourceMonthlyRow[]> {
  const db = getDb();
  if (!db) return demoRevenueFallback(ownerId, opts);
  const conditions = [eq(ownerRevenueSourceMonthly.ownerId, ownerId)];
  if (opts?.villaId) {
    conditions.push(eq(ownerRevenueSourceMonthly.villaId, opts.villaId));
  }
  if (opts?.from) {
    conditions.push(gte(ownerRevenueSourceMonthly.periodMonth, opts.from));
  }
  if (opts?.to) {
    conditions.push(lte(ownerRevenueSourceMonthly.periodMonth, opts.to));
  }
  const rows = await db
    .select({
      ownerId: ownerRevenueSourceMonthly.ownerId,
      villaId: ownerRevenueSourceMonthly.villaId,
      projectId: ownerRevenueSourceMonthly.projectId,
      periodMonth: ownerRevenueSourceMonthly.periodMonth,
      sourceType: ownerRevenueSourceMonthly.sourceType,
      grossRevenueMinor: ownerRevenueSourceMonthly.grossRevenueMinor,
      deductionsMinor: ownerRevenueSourceMonthly.deductionsMinor,
      netOwnerEffectMinor: ownerRevenueSourceMonthly.netOwnerEffectMinor,
      bookingCount: ownerRevenueSourceMonthly.bookingCount,
      occupiedNights: ownerRevenueSourceMonthly.occupiedNights,
      currency: ownerRevenueSourceMonthly.currency,
    })
    .from(ownerRevenueSourceMonthly)
    .where(and(...conditions))
    .orderBy(desc(ownerRevenueSourceMonthly.periodMonth));
  const projected = rows.map((r) => ({
    ownerId: r.ownerId,
    villaId: r.villaId ?? null,
    projectId: r.projectId ?? null,
    periodMonth: r.periodMonth as unknown as string,
    sourceType: r.sourceType as RevenueSourceMonthlyRow["sourceType"],
    grossRevenueMinor: r.grossRevenueMinor,
    deductionsMinor: r.deductionsMinor,
    netOwnerEffectMinor: r.netOwnerEffectMinor,
    bookingCount: r.bookingCount,
    occupiedNights: r.occupiedNights,
    currency: r.currency,
  }));
  if (projected.length === 0) return demoRevenueFallback(ownerId, opts);
  return projected;
}

function demoRevenueFallback(
  ownerId: string,
  opts?: { villaId?: string | null; from?: string; to?: string },
): RevenueSourceMonthlyRow[] {
  if (!isDemoOwnerFallbackActive()) return [];
  return listDemoOwnerRevenueMonthly()
    .filter((r) => r.ownerId === ownerId)
    .filter((r) => !opts?.villaId || r.villaId === opts.villaId)
    .filter((r) => !opts?.from || r.periodMonth >= opts.from)
    .filter((r) => !opts?.to || r.periodMonth <= opts.to) as unknown as RevenueSourceMonthlyRow[];
}

// -----------------------------------------------------------------------------
// Internal
// -----------------------------------------------------------------------------

async function readSummaries(
  ownerIds: ReadonlyArray<string>,
  filter: OwnerBookingFilter,
): Promise<OwnerBookingSummaryRow[]> {
  const conditions = [inArray(ownerBookingSummaries.ownerId, ownerIds as string[])];
  if (filter.villaId) {
    conditions.push(eq(ownerBookingSummaries.villaId, filter.villaId));
  }
  if (filter.sourceType) {
    conditions.push(eq(ownerBookingSummaries.sourceType, filter.sourceType));
  }
  if (filter.publicStatus) {
    conditions.push(
      eq(ownerBookingSummaries.publicStatus, filter.publicStatus),
    );
  }
  if (filter.monthIso) {
    const start = `${filter.monthIso}-01`;
    const next = nextMonth(filter.monthIso);
    conditions.push(gte(ownerBookingSummaries.checkIn, start));
    conditions.push(lte(ownerBookingSummaries.checkIn, next));
  }
  if (filter.from)
    conditions.push(gte(ownerBookingSummaries.checkOut, filter.from));
  if (filter.to)
    conditions.push(lte(ownerBookingSummaries.checkIn, filter.to));
  return readSummariesRaw(conditions);
}

async function readSummariesRaw(
  conditions: ReadonlyArray<ReturnType<typeof eq>>,
): Promise<OwnerBookingSummaryRow[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select({
      summary: ownerBookingSummaries,
      villaCode: villas.unitCode,
      villaName: villas.name,
      projectName: projects.name,
      statementCode: ownerStatements.statementCode,
      statementStatus: ownerStatements.status,
    })
    .from(ownerBookingSummaries)
    .leftJoin(villas, eq(villas.id, ownerBookingSummaries.villaId))
    .leftJoin(projects, eq(projects.id, ownerBookingSummaries.projectId))
    .leftJoin(
      ownerStatements,
      eq(ownerStatements.id, ownerBookingSummaries.statementId),
    )
    .where(and(...conditions))
    .orderBy(desc(ownerBookingSummaries.checkIn));
  return rows.map((r) => projectRow(r));
}

function projectRow(r: {
  summary: OwnerBookingSummary;
  villaCode: string | null;
  villaName: string | null;
  projectName: string | null;
  statementCode: string | null;
  statementStatus: string | null;
}): OwnerBookingSummaryRow {
  const s = r.summary;
  // Owner-facing statement href: only show when the statement is
  // issued / approved / paid (never draft).
  const statementHref =
    s.statementId &&
    (r.statementStatus === "issued" ||
      r.statementStatus === "approved" ||
      r.statementStatus === "paid")
      ? `/owner/statements/${s.statementId}`
      : null;
  return {
    id: s.id,
    ownerId: s.ownerId,
    villaId: s.villaId,
    villaCode: r.villaCode,
    villaName: r.villaName,
    projectId: s.projectId,
    projectName: r.projectName,
    bookingId: s.bookingId,
    directBookingRequestId: s.directBookingRequestId,
    directBookingHoldId: s.directBookingHoldId,
    sourceType: s.sourceType as OwnerBookingSourceType,
    publicStatus: s.publicStatus as OwnerBookingPublicStatus,
    ownerLabel: s.ownerLabel,
    guestLabel: s.guestLabel,
    guestCountry: s.guestCountry,
    channelLabel: s.channelLabel,
    checkIn: s.checkIn as unknown as string,
    checkOut: s.checkOut as unknown as string,
    nights: s.nights,
    guestCount: s.guestCount,
    totalAmountMinor: s.totalAmountMinor,
    ownerRevenueMinor: s.ownerRevenueMinor,
    currency: s.currency,
    revenuePosted: s.revenuePosted,
    statementId: s.statementId,
    statementHref,
    ownerVisible: s.ownerVisible,
    sourceUpdatedAt:
      s.sourceUpdatedAt instanceof Date
        ? s.sourceUpdatedAt.toISOString()
        : (s.sourceUpdatedAt as unknown as string | null),
  };
}

function nextMonth(monthIso: string): string {
  const [y, m] = monthIso.split("-").map((p) => Number(p));
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, "0")}-01`;
}

// -----------------------------------------------------------------------------
// Aggregate metrics for the owner-revenue page
// -----------------------------------------------------------------------------

export interface OwnerRevenueMetrics {
  totalGrossMinor: bigint;
  totalNetEffectMinor: bigint;
  bookingCount: number;
  occupiedNights: number;
  currency: string | null;
}

export async function getOwnerRevenueMetrics(
  ownerId: string,
  opts?: { from?: string; to?: string; villaId?: string | null },
): Promise<OwnerRevenueMetrics> {
  const rows = await listOwnerRevenueSourceMonthly(ownerId, opts);
  let gross = 0n;
  let net = 0n;
  let count = 0;
  let nights = 0;
  let currency: string | null = null;
  for (const r of rows) {
    gross += r.grossRevenueMinor;
    net += r.netOwnerEffectMinor;
    count += r.bookingCount;
    nights += r.occupiedNights;
    if (!currency) currency = r.currency;
  }
  return {
    totalGrossMinor: gross,
    totalNetEffectMinor: net,
    bookingCount: count,
    occupiedNights: nights,
    currency,
  };
}
