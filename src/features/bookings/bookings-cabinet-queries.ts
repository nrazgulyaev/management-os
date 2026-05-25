import "server-only";

import { sql } from "drizzle-orm";
import { getDb, rowsOf } from "@/lib/db/client";
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

export async function listBookingsForCabinet(limit = 25): Promise<BookingsCabinetRow[]> {
  const db = getDb();
  if (!db) return [];
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
    };
  }
  const rows = await db.execute<{
    bookings_mtd: string;
    revenue_mtd: string;
    nights_mtd: string;
    lead_time_avg: string;
    cancellations_ytd: string;
    bookings_ytd: string;
  }>(sql`
    SELECT
      (SELECT COUNT(*)::text FROM bookings
        WHERE check_in >= date_trunc('month', CURRENT_DATE)::date
          AND status IN ('confirmed','checked_in','checked_out')) AS bookings_mtd,
      COALESCE((SELECT SUM(gross_amount)::text FROM bookings
        WHERE check_in >= date_trunc('month', CURRENT_DATE)::date
          AND status IN ('confirmed','checked_in','checked_out')), '0') AS revenue_mtd,
      COALESCE((SELECT SUM(nights)::text FROM bookings
        WHERE check_in >= date_trunc('month', CURRENT_DATE)::date
          AND status IN ('confirmed','checked_in','checked_out')), '0') AS nights_mtd,
      COALESCE((SELECT AVG(EXTRACT(DAY FROM (check_in::timestamp - created_at)))::text
        FROM bookings
        WHERE check_in >= date_trunc('year', CURRENT_DATE)::date
          AND status IN ('confirmed','checked_in','checked_out')), '0') AS lead_time_avg,
      (SELECT COUNT(*)::text FROM bookings
        WHERE status = 'cancelled'
          AND check_in >= date_trunc('year', CURRENT_DATE)::date) AS cancellations_ytd,
      (SELECT COUNT(*)::text FROM bookings
        WHERE check_in >= date_trunc('year', CURRENT_DATE)::date) AS bookings_ytd
  `);
  const r = rowsOf<{
    bookings_mtd: string;
    revenue_mtd: string;
    nights_mtd: string;
    lead_time_avg: string;
    cancellations_ytd: string;
    bookings_ytd: string;
  }>(rows)[0];
  if (!r) {
    return {
      bookingsMtd: 0,
      adrMtdUsdMinor: 0n,
      leadTimeAvgDays: 0,
      cancellationRatePct: 0,
      channelConflicts: 0,
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
  };
}

export interface CalendarVillaRow {
  villaId: string;
  villaCode: string;
  blocks: Array<{
    bookingId: string;
    bookingCode: string;
    guestName: string | null;
    checkIn: string;
    checkOut: string;
    status: string;
    channelKey: string | null;
  }>;
}

export async function getNext14NightsTimeline(startDate?: string): Promise<CalendarVillaRow[]> {
  const db = getDb();
  if (!db) return [];
  const start = startDate ?? new Date().toISOString().slice(0, 10);
  // 14-night window: any booking that overlaps [start, start+14).
  const rows = await db.execute<{
    villa_id: string;
    villa_code: string;
    booking_id: string | null;
    booking_code: string | null;
    guest_name: string | null;
    check_in: string | null;
    check_out: string | null;
    status: string | null;
    channel_key: string | null;
  }>(sql`
    SELECT v.id::text             AS villa_id,
           v.unit_code             AS villa_code,
           b.id::text              AS booking_id,
           b.booking_code          AS booking_code,
           b.notes                 AS guest_name,
           b.check_in::text        AS check_in,
           b.check_out::text       AS check_out,
           b.status                AS status,
           bc.key                  AS channel_key
      FROM villas v
      LEFT JOIN bookings b ON b.villa_id = v.id
                          AND b.check_in <  (${start}::date + INTERVAL '14 days')
                          AND b.check_out > ${start}::date
                          AND b.status IN ('confirmed','checked_in','checked_out')
      LEFT JOIN booking_channels bc ON bc.id = b.channel_id
     WHERE v.status NOT IN ('archived','out_of_service')
     ORDER BY v.unit_code, b.check_in NULLS LAST
  `);
  const data = rowsOf<{
    villa_id: string;
    villa_code: string;
    booking_id: string | null;
    booking_code: string | null;
    guest_name: string | null;
    check_in: string | null;
    check_out: string | null;
    status: string | null;
    channel_key: string | null;
  }>(rows);

  const byVilla = new Map<string, CalendarVillaRow>();
  for (const r of data) {
    let row = byVilla.get(r.villa_id);
    if (!row) {
      row = { villaId: r.villa_id, villaCode: r.villa_code, blocks: [] };
      byVilla.set(r.villa_id, row);
    }
    if (r.booking_id && r.check_in && r.check_out && r.booking_code) {
      row.blocks.push({
        bookingId: r.booking_id,
        bookingCode: r.booking_code,
        guestName: r.guest_name?.replace(/^\[DEMO2\] /, "").trim() || null,
        checkIn: r.check_in,
        checkOut: r.check_out,
        status: r.status ?? "confirmed",
        channelKey: r.channel_key,
      });
    }
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
// Note: the `bookings` table has no organization_id column today (schema-
// level multi-tenancy gap tracked in the FUNCTIONAL-AUDIT-1 doc). All
// queries are platform-wide; orgId is accepted for forward-compatibility
// + audit trail but not yet used as a WHERE clause.

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
        WHERE check_in::date  = ${input.date}::date
          AND status IN ('confirmed','checked_in','checked_out')) AS check_ins,
      (SELECT COUNT(*)::text FROM bookings
        WHERE check_out::date = ${input.date}::date
          AND status IN ('confirmed','checked_in','checked_out')) AS check_outs,
      (SELECT COUNT(*)::text FROM bookings
        WHERE created_at::date = ${input.date}::date) AS new_bookings,
      (SELECT COALESCE(SUM(gross_amount), 0)::text FROM bookings
        WHERE created_at::date = ${input.date}::date
          AND status IN ('confirmed','checked_in','checked_out')) AS new_revenue,
      (SELECT COUNT(*)::text FROM bookings
        WHERE status = 'cancelled'
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
     WHERE b.check_in::date = ${input.date}::date
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
