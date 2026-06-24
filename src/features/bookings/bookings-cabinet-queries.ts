import "server-only";

import { and, asc, eq, gt, gte, inArray, lt, lte, notInArray, sql } from "drizzle-orm";
import { getDb, rowsOf } from "@/lib/db/client";
import { projects, villas } from "@/lib/db/schema/projects";
import { bookingChannels, bookings, guests } from "@/lib/db/schema/bookings";
import { ownerStayRequests } from "@/lib/db/schema/owner-stays";
import { villaCalendarBlocks } from "@/lib/db/schema/availability";
import { requireOrgId } from "@/features/auth/require-org";
// SHAPE-FIX-1 / DAILY-DIGEST P0 — rowsOf handles postgres-js Array shape.
// TODO(DB-SHAPE-CODEMOD-1): adjacent files in this module still pending full sweep.

/**
 * Sprint TASK-6-DATA-PART-1 — Mgmt OS Bookings cabinet read aggregates.
 *
 * Reads the `bookings` / `villas` / `booking_channels` triad. Bookings
 * sit above the multi-tenancy line (no `organization_id` column), so
 * reads are tenant-wide — same as `getLiveDashboardCounts()`.
 *
 * Rate plans + channel sync + conflict resolver have no schema yet
 * (DEMO-3 dependency). They return empty arrays here and the cabinet
 * renders friendly empty states.
 */

const FX_USD_TO_IDR = 15_800;

function usdToIdrMinor(usd: number): bigint {
  return BigInt(Math.round(usd * FX_USD_TO_IDR * 100));
}

export interface BookingsCabinetRow {
  id: string;
  bookingCode: string;
  villaCode: string;
  channelKey: string | null;
  channelName: string | null;
  guestName: string | null;
  checkIn: string;
  checkOut: string;
  nights: number;
  grossUsdMinor: bigint;
  status: string;
  adults: number;
  children: number;
}

export async function listBookingsForCabinet(
  limit = 25,
  villaId?: string,
): Promise<BookingsCabinetRow[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  // Optional villa filter — drives the "View bookings" drill-down from
  // /dashboard/villas/[id]. The org predicate stays primary so a forged
  // villaId from another tenant simply matches no rows.
  const villaFilter = villaId ? sql`AND b.villa_id = ${villaId}` : sql``;
  const rows = await db.execute<{
    id: string;
    booking_code: string;
    villa_code: string;
    channel_key: string | null;
    channel_name: string | null;
    guest_name: string | null;
    check_in: string;
    check_out: string;
    nights: string;
    gross_amount: string;
    status: string;
    adults: string;
    children: string;
  }>(sql`
    SELECT b.id::text         AS id,
           b.booking_code      AS booking_code,
           v.unit_code         AS villa_code,
           bc.key              AS channel_key,
           bc.name             AS channel_name,
           b.notes             AS guest_name,
           b.check_in::text    AS check_in,
           b.check_out::text   AS check_out,
           b.nights::text      AS nights,
           b.gross_amount::text AS gross_amount,
           b.status            AS status,
           b.adults::text      AS adults,
           b.children::text    AS children
      FROM bookings b
      JOIN villas v ON v.id = b.villa_id
      LEFT JOIN booking_channels bc ON bc.id = b.channel_id
     WHERE b.organization_id = ${organizationId}
       ${villaFilter}
     ORDER BY b.check_in DESC
     LIMIT ${limit}
  `);
  return rowsOf<{
    id: string;
    booking_code: string;
    villa_code: string;
    channel_key: string | null;
    channel_name: string | null;
    guest_name: string | null;
    check_in: string;
    check_out: string;
    nights: string;
    gross_amount: string;
    status: string;
    adults: string;
    children: string;
  }>(rows).map((r) => ({
    id: r.id,
    bookingCode: r.booking_code,
    villaCode: r.villa_code,
    channelKey: r.channel_key,
    channelName: r.channel_name,
    guestName: r.guest_name?.replace(/^\[DEMO2\] /, "").trim() || null,
    checkIn: r.check_in,
    checkOut: r.check_out,
    nights: Number(r.nights || 0),
    grossUsdMinor: BigInt(Math.round(Number(r.gross_amount || 0) * 100)),
    status: r.status,
    adults: Number(r.adults || 0),
    children: Number(r.children || 0),
  }));
}

export interface BookingsKpis {
  bookingsMtd: number;
  adrMtdUsdMinor: bigint;
  leadTimeAvgDays: number;
  cancellationRatePct: number;
  channelConflicts: number;
  /** Operational KPIs (mgmt-p1/bookings prototype). */
  todayArrivals: number;
  inStayTonight: number;
  gross7dUsdMinor: bigint;
}

export async function getBookingsKpis(): Promise<BookingsKpis> {
  const db = getDb();
  if (!db) {
    return {
      bookingsMtd: 0,
      adrMtdUsdMinor: 0n,
      leadTimeAvgDays: 0,
      cancellationRatePct: 0,
      channelConflicts: 0,
      todayArrivals: 0,
      inStayTonight: 0,
      gross7dUsdMinor: 0n,
    };
  }
  const organizationId = await requireOrgId();
  const rows = await db.execute<{
    bookings_mtd: string;
    revenue_mtd: string;
    nights_mtd: string;
    lead_time_avg: string;
    cancellations_ytd: string;
    bookings_ytd: string;
    today_arrivals: string;
    in_stay_tonight: string;
    gross_7d: string;
  }>(sql`
    SELECT
      (SELECT COUNT(*)::text FROM bookings
        WHERE organization_id = ${organizationId}
          AND check_in >= date_trunc('month', CURRENT_DATE)::date
          AND status IN ('confirmed','checked_in','checked_out')) AS bookings_mtd,
      COALESCE((SELECT SUM(gross_amount)::text FROM bookings
        WHERE organization_id = ${organizationId}
          AND check_in >= date_trunc('month', CURRENT_DATE)::date
          AND status IN ('confirmed','checked_in','checked_out')), '0') AS revenue_mtd,
      COALESCE((SELECT SUM(nights)::text FROM bookings
        WHERE organization_id = ${organizationId}
          AND check_in >= date_trunc('month', CURRENT_DATE)::date
          AND status IN ('confirmed','checked_in','checked_out')), '0') AS nights_mtd,
      COALESCE((SELECT AVG(EXTRACT(DAY FROM (check_in::timestamp - created_at)))::text
        FROM bookings
        WHERE organization_id = ${organizationId}
          AND check_in >= date_trunc('year', CURRENT_DATE)::date
          AND status IN ('confirmed','checked_in','checked_out')), '0') AS lead_time_avg,
      (SELECT COUNT(*)::text FROM bookings
        WHERE organization_id = ${organizationId}
          AND status = 'cancelled'
          AND check_in >= date_trunc('year', CURRENT_DATE)::date) AS cancellations_ytd,
      (SELECT COUNT(*)::text FROM bookings
        WHERE organization_id = ${organizationId}
          AND check_in >= date_trunc('year', CURRENT_DATE)::date) AS bookings_ytd,
      (SELECT COUNT(*)::text FROM bookings
        WHERE organization_id = ${organizationId}
          AND check_in = CURRENT_DATE
          AND status IN ('confirmed','checked_in')) AS today_arrivals,
      (SELECT COUNT(*)::text FROM bookings
        WHERE organization_id = ${organizationId}
          AND check_in <= CURRENT_DATE AND check_out > CURRENT_DATE
          AND status IN ('confirmed','checked_in')) AS in_stay_tonight,
      COALESCE((SELECT SUM(gross_amount)::text FROM bookings
        WHERE organization_id = ${organizationId}
          AND check_in >= CURRENT_DATE - INTERVAL '7 days'
          AND check_in <= CURRENT_DATE
          AND status IN ('confirmed','checked_in','checked_out')), '0') AS gross_7d
  `);
  const r = rowsOf<{
    bookings_mtd: string;
    revenue_mtd: string;
    nights_mtd: string;
    lead_time_avg: string;
    cancellations_ytd: string;
    bookings_ytd: string;
    today_arrivals: string;
    in_stay_tonight: string;
    gross_7d: string;
  }>(rows)[0];
  if (!r) {
    return {
      bookingsMtd: 0,
      adrMtdUsdMinor: 0n,
      leadTimeAvgDays: 0,
      cancellationRatePct: 0,
      channelConflicts: 0,
      todayArrivals: 0,
      inStayTonight: 0,
      gross7dUsdMinor: 0n,
    };
  }
  const revenue = Number(r.revenue_mtd || 0);
  const nights = Number(r.nights_mtd || 0);
  const cxYtd = Number(r.cancellations_ytd || 0);
  const totalYtd = Number(r.bookings_ytd || 0);
  return {
    bookingsMtd: Number(r.bookings_mtd || 0),
    adrMtdUsdMinor: BigInt(Math.round((nights > 0 ? revenue / nights : 0) * 100)),
    leadTimeAvgDays: Math.round(Number(r.lead_time_avg || 0) * 10) / 10,
    cancellationRatePct: totalYtd > 0 ? Math.round((cxYtd / totalYtd) * 1000) / 10 : 0,
    channelConflicts: 0,
    todayArrivals: Number(r.today_arrivals || 0),
    inStayTonight: Number(r.in_stay_tonight || 0),
    gross7dUsdMinor: BigInt(Math.round(Number(r.gross_7d || 0) * 100)),
  };
}

export type CalendarBlockKind = "confirmed" | "hold" | "owner";
export interface CalendarBlock {
  id: string;
  kind: CalendarBlockKind;
  label: string;
  /** ISO YYYY-MM-DD */
  checkIn: string;
  checkOut: string;
  href?: string;
  // BOOKINGS-CAL-PARITY-1 — optional tooltip extras (additive; older
  // callers that ignore them keep working unchanged).
  /** Booking code, e.g. BK-2148. */
  code?: string;
  /** Channel display name, e.g. "Airbnb" — only guest bookings have one. */
  channel?: string;
  /** Raw status: confirmed | checked_in | checked_out | tentative | inquiry | owner_stay | hold. */
  status?: string;
}
export interface CalendarVillaRow {
  villaId: string;
  villaCode: string;
  villaName: string | null;
  blocks: CalendarBlock[];
}

/**
 * Occupancy timeline for the Bookings calendar grid: every active villa
 * over an N-night window with its guest bookings (confirmed = green,
 * tentative/inquiry = hold/terra), owner stays (gold) and internal holds
 * (terra) merged into colour-coded blocks. Rate plans / channel sync are
 * NOT here — they live in their own cabinets.
 */
export async function getNext14NightsTimeline(
  startDate?: string,
  nights = 14,
): Promise<CalendarVillaRow[]> {
  const db = getDb();
  if (!db) return [];
  // BOOKINGS-CAL-PARITY-1 — scope villas to the caller's org (via
  // projects.organization_id), matching listBookingsForCabinet above.
  const organizationId = await requireOrgId();
  const start = startDate ?? new Date().toISOString().slice(0, 10);
  const endIso = new Date(new Date(`${start}T00:00:00.000Z`).getTime() + nights * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const startTs = new Date(`${start}T00:00:00.000Z`);
  const endTs = new Date(`${endIso}T00:00:00.000Z`);

  const villaRows = await db
    .select({ id: villas.id, unitCode: villas.unitCode, name: villas.name })
    .from(villas)
    .innerJoin(projects, eq(projects.id, villas.projectId))
    .where(
      and(
        notInArray(villas.status, ["archived", "out_of_service"]),
        eq(projects.organizationId, organizationId),
      ),
    )
    .orderBy(asc(villas.unitCode));
  if (villaRows.length === 0) return [];
  const villaIds = villaRows.map((v) => v.id);

  const [bookingRows, ownerRows, holdRows] = await Promise.all([
    db
      .select({
        id: bookings.id,
        villaId: bookings.villaId,
        code: bookings.bookingCode,
        notes: bookings.notes,
        guestName: guests.fullName,
        channelName: bookingChannels.name,
        checkIn: bookings.checkIn,
        checkOut: bookings.checkOut,
        status: bookings.status,
      })
      .from(bookings)
      .leftJoin(guests, eq(guests.id, bookings.guestId))
      .leftJoin(bookingChannels, eq(bookingChannels.id, bookings.channelId))
      .where(
        and(
          inArray(bookings.villaId, villaIds),
          inArray(bookings.status, [
            "confirmed",
            "checked_in",
            "checked_out",
            "tentative",
            "inquiry",
          ]),
          lt(bookings.checkIn, endIso),
          gt(bookings.checkOut, start),
        ),
      ),
    db
      .select({
        id: ownerStayRequests.id,
        villaId: ownerStayRequests.villaId,
        checkIn: ownerStayRequests.requestedStart,
        checkOut: ownerStayRequests.requestedEnd,
        status: ownerStayRequests.status,
      })
      .from(ownerStayRequests)
      .where(
        and(
          inArray(ownerStayRequests.villaId, villaIds),
          inArray(ownerStayRequests.status, [
            "requested",
            "approved",
            "confirmed",
            "active",
            "completed",
          ]),
          lte(ownerStayRequests.requestedStart, endIso),
          gte(ownerStayRequests.requestedEnd, start),
        ),
      ),
    db
      .select({
        id: villaCalendarBlocks.id,
        villaId: villaCalendarBlocks.villaId,
        startsAt: villaCalendarBlocks.startsAt,
        endsAt: villaCalendarBlocks.endsAt,
        title: villaCalendarBlocks.title,
      })
      .from(villaCalendarBlocks)
      .where(
        and(
          inArray(villaCalendarBlocks.villaId, villaIds),
          eq(villaCalendarBlocks.status, "active"),
          eq(villaCalendarBlocks.blockType, "internal_hold"),
          lte(villaCalendarBlocks.startsAt, endTs),
          gte(villaCalendarBlocks.endsAt, startTs),
        ),
      ),
  ]);

  const clean = (s: string | null | undefined) =>
    s?.replace(/^\[DEMO2?\]\s*/, "").trim() || null;

  const byVilla = new Map<string, CalendarVillaRow>();
  for (const v of villaRows) {
    byVilla.set(v.id, {
      villaId: v.id,
      villaCode: v.unitCode,
      villaName: v.name,
      blocks: [],
    });
  }

  for (const b of bookingRows) {
    const row = byVilla.get(b.villaId);
    if (!row) continue;
    const confirmed =
      b.status === "confirmed" || b.status === "checked_in" || b.status === "checked_out";
    row.blocks.push({
      id: `b-${b.id}`,
      kind: confirmed ? "confirmed" : "hold",
      label: clean(b.guestName) ?? clean(b.notes) ?? b.code ?? "Guest",
      checkIn: b.checkIn,
      checkOut: b.checkOut,
      href: `/dashboard/bookings/${b.id}`,
      code: b.code ?? undefined,
      channel: b.channelName ?? undefined,
      status: b.status,
    });
  }
  for (const o of ownerRows) {
    if (!o.villaId) continue;
    const row = byVilla.get(o.villaId);
    if (!row) continue;
    row.blocks.push({
      id: `o-${o.id}`,
      kind: "owner",
      label: "Owner stay",
      checkIn: o.checkIn,
      checkOut: o.checkOut,
      status: "owner_stay",
    });
  }
  for (const h of holdRows) {
    const row = byVilla.get(h.villaId);
    if (!row) continue;
    row.blocks.push({
      id: `h-${h.id}`,
      kind: "hold",
      label: h.title || "Hold",
      checkIn: h.startsAt.toISOString().slice(0, 10),
      checkOut: h.endsAt.toISOString().slice(0, 10),
      status: "hold",
    });
  }
  return Array.from(byVilla.values());
}

export interface RatePlanRow {
  planName: string;
  basePriceUsdMinor: bigint;
  channels: string[];
  multipliers: string;
}

/** No `rate_plans` table seeded yet — DEMO-3 / dynamic-pricing schema. */
export async function getRatePlans(): Promise<RatePlanRow[]> {
  return [];
}

export interface ChannelSyncRow {
  channelKey: string;
  channelName: string;
  lastSyncAt: string | null;
  status: "ok" | "warn" | "error" | "not_configured";
}

/** Channel sync state has no dedicated table yet. Returns the channels
 *  we know about with status='not_configured' so the cabinet can render
 *  a roster rather than a blank panel. */
export async function getChannelSyncStatus(): Promise<ChannelSyncRow[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db.execute<{ key: string; name: string }>(sql`
    SELECT key, name FROM booking_channels
     WHERE status = 'active'
     ORDER BY name ASC
  `);
  return rowsOf<{ key: string; name: string }>(rows).map((r) => ({
    channelKey: r.key,
    channelName: r.name,
    lastSyncAt: null,
    status: "not_configured" as const,
  }));
}

export interface ConflictRow {
  villaCode: string;
  channel: string;
  conflictType: string;
  suggestedAction: string;
}

/** No conflict resolver schema yet. */
export async function getConflictResolverItems(): Promise<ConflictRow[]> {
  return [];
}

export { usdToIdrMinor };

// =============================================================================
// DAILY-DIGEST-SPRINT-1 P2 — date-scoped activity for the Daily Digest agent.
// =============================================================================
//
// Queries are scoped to the caller's organization via the `orgId` param
// threaded from the agent context (bookings.organization_id).

export interface DigestBookingsForDate {
  date: string;
  checkInsCount: number;
  checkOutsCount: number;
  newBookingsCount: number;
  newBookingsRevenueUsd: number;
  cancellationsCount: number;
  netRevenueUsd: number;
  notableArrivals: Array<{
    bookingCode: string;
    villaCode: string;
    guestName: string | null;
    nights: number;
    grossUsd: number;
  }>;
}

/**
 * Bookings activity for the Daily Digest. Returns counts + a small
 * sample of notable arrivals so the agent can flag specific check-ins
 * without needing a second tool call.
 *
 * "New bookings" = rows whose created_at falls on the digest date.
 * "Check-ins" / "check-outs" = rows whose check_in / check_out equals
 * the digest date. Cancellations = status='cancelled' transitions on
 * that date (using updated_at as proxy — fine for v1).
 */
export async function getBookingsActivityForDate(input: {
  orgId: string;
  date: string;
}): Promise<DigestBookingsForDate> {
  const db = getDb();
  if (!db) {
    return {
      date: input.date,
      checkInsCount: 0,
      checkOutsCount: 0,
      newBookingsCount: 0,
      newBookingsRevenueUsd: 0,
      cancellationsCount: 0,
      netRevenueUsd: 0,
      notableArrivals: [],
    };
  }

  const aggRows = await db.execute<{
    check_ins: string;
    check_outs: string;
    new_bookings: string;
    new_revenue: string;
    cancellations: string;
  }>(sql`
    SELECT
      (SELECT COUNT(*)::text FROM bookings
        WHERE organization_id = ${input.orgId}
          AND check_in::date  = ${input.date}::date
          AND status IN ('confirmed','checked_in','checked_out')) AS check_ins,
      (SELECT COUNT(*)::text FROM bookings
        WHERE organization_id = ${input.orgId}
          AND check_out::date = ${input.date}::date
          AND status IN ('confirmed','checked_in','checked_out')) AS check_outs,
      (SELECT COUNT(*)::text FROM bookings
        WHERE organization_id = ${input.orgId}
          AND created_at::date = ${input.date}::date) AS new_bookings,
      (SELECT COALESCE(SUM(gross_amount), 0)::text FROM bookings
        WHERE organization_id = ${input.orgId}
          AND created_at::date = ${input.date}::date
          AND status IN ('confirmed','checked_in','checked_out')) AS new_revenue,
      (SELECT COUNT(*)::text FROM bookings
        WHERE organization_id = ${input.orgId}
          AND status = 'cancelled'
          AND updated_at::date = ${input.date}::date) AS cancellations
  `);
  const agg = rowsOf<{
    check_ins: string;
    check_outs: string;
    new_bookings: string;
    new_revenue: string;
    cancellations: string;
  }>(aggRows)[0];

  const notable = await db.execute<{
    booking_code: string;
    villa_code: string;
    guest_name: string | null;
    nights: string;
    gross_amount: string;
  }>(sql`
    SELECT b.booking_code, v.unit_code AS villa_code, b.notes AS guest_name,
           b.nights::text AS nights, b.gross_amount::text AS gross_amount
      FROM bookings b
      JOIN villas v ON v.id = b.villa_id
     WHERE b.organization_id = ${input.orgId}
       AND b.check_in::date = ${input.date}::date
       AND b.status IN ('confirmed','checked_in','checked_out')
     ORDER BY b.gross_amount DESC
     LIMIT 3
  `);
  const notableArrivals = rowsOf<{
    booking_code: string;
    villa_code: string;
    guest_name: string | null;
    nights: string;
    gross_amount: string;
  }>(notable).map((r) => ({
    bookingCode: r.booking_code,
    villaCode: r.villa_code,
    guestName: r.guest_name?.replace(/^\[DEMO2\] /, "").trim() || null,
    nights: Number(r.nights),
    grossUsd: Number(r.gross_amount),
  }));

  // Net revenue = new bookings revenue − cancellation refunds (simplified:
  // count cancellations × avg gross). Good enough for digest copy.
  const newRevenue = Number(agg?.new_revenue ?? "0");
  return {
    date: input.date,
    checkInsCount: Number(agg?.check_ins ?? "0"),
    checkOutsCount: Number(agg?.check_outs ?? "0"),
    newBookingsCount: Number(agg?.new_bookings ?? "0"),
    newBookingsRevenueUsd: newRevenue,
    cancellationsCount: Number(agg?.cancellations ?? "0"),
    netRevenueUsd: newRevenue, // refinement deferred — see comment above
    notableArrivals,
  };
}
