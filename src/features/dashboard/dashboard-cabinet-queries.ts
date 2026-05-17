import "server-only";

import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";

/**
 * Sprint TASK-6-DATA-PART-1 — Mgmt OS Overview live read aggregates.
 *
 * Mgmt-side tables (`projects`, `villas`, `owners`, `bookings`,
 * `ownership_shares`) intentionally have NO `organization_id` —
 * they live above the multi-tenancy line in the current schema.
 * Reads below are therefore tenant-wide; this is consistent with the
 * existing `getLiveDashboardCounts()` (commit 95501b1).
 *
 * FX: IDR/USD pinned to 15,800 (operator's working rate). Flagged for
 * INTEGRATIONS-1 — real FX provider lands later.
 */

const FX_USD_TO_IDR = 15_800;

/** All amount values exposed by these queries are IDR minor (rupiah × 100). */
type IdrMinor = bigint;

function usdToIdrMinor(usd: number): IdrMinor {
  return BigInt(Math.round(usd * FX_USD_TO_IDR * 100));
}

export interface PortfolioMetrics {
  occupancyYtd: number;        // 0-100
  adrIdrMinor: IdrMinor;
  revparIdrMinor: IdrMinor;
  grossMtdIdrMinor: IdrMinor;
  netToOwnersMtdIdrMinor: IdrMinor;
}

const EMPTY_METRICS: PortfolioMetrics = {
  occupancyYtd: 0,
  adrIdrMinor: 0n,
  revparIdrMinor: 0n,
  grossMtdIdrMinor: 0n,
  netToOwnersMtdIdrMinor: 0n,
};

/** Operator's typical commission (20%) — net-to-owners = gross × 0.8. */
const OPERATOR_COMMISSION = 0.2;

export async function getPortfolioMetrics(): Promise<PortfolioMetrics> {
  const db = getDb();
  if (!db) return EMPTY_METRICS;

  const row = await db.execute<{
    villa_count: string;
    booked_nights_ytd: string;
    revenue_ytd_usd: string;
    revenue_mtd_usd: string;
  }>(sql`
    WITH yr AS (
      SELECT date_trunc('year', CURRENT_DATE)::date AS year_start
    ),
    mt AS (
      SELECT date_trunc('month', CURRENT_DATE)::date AS month_start
    )
    SELECT
      (SELECT COUNT(*)::text FROM villas WHERE status NOT IN ('archived','out_of_service')) AS villa_count,
      COALESCE((
        SELECT SUM(nights)::text FROM bookings b, yr
         WHERE b.status IN ('confirmed','checked_in','checked_out')
           AND b.check_in >= yr.year_start
      ), '0') AS booked_nights_ytd,
      COALESCE((
        SELECT SUM(gross_amount)::text FROM bookings b, yr
         WHERE b.status IN ('confirmed','checked_in','checked_out')
           AND b.check_in >= yr.year_start
      ), '0') AS revenue_ytd_usd,
      COALESCE((
        SELECT SUM(gross_amount)::text FROM bookings b, mt
         WHERE b.status IN ('confirmed','checked_in','checked_out')
           AND b.check_in >= mt.month_start
      ), '0') AS revenue_mtd_usd
  `);
  const r = (row as unknown as { rows: Array<{
    villa_count: string;
    booked_nights_ytd: string;
    revenue_ytd_usd: string;
    revenue_mtd_usd: string;
  }> }).rows?.[0];
  if (!r) return EMPTY_METRICS;

  const villaCount = Number(r.villa_count || "0");
  const nights = Number(r.booked_nights_ytd || "0");
  const revenueYtdUsd = Number(r.revenue_ytd_usd || "0");
  const revenueMtdUsd = Number(r.revenue_mtd_usd || "0");

  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 1).getTime()) / 86400000,
  ) + 1;
  const villaNightsAvailable = villaCount * dayOfYear;
  const occupancy = villaNightsAvailable > 0 ? (nights / villaNightsAvailable) * 100 : 0;
  const adr = nights > 0 ? revenueYtdUsd / nights : 0;
  const revpar = adr * (occupancy / 100);

  return {
    occupancyYtd: Math.round(occupancy * 10) / 10,
    adrIdrMinor: usdToIdrMinor(adr),
    revparIdrMinor: usdToIdrMinor(revpar),
    grossMtdIdrMinor: usdToIdrMinor(revenueMtdUsd),
    netToOwnersMtdIdrMinor: usdToIdrMinor(revenueMtdUsd * (1 - OPERATOR_COMMISSION)),
  };
}

export interface ChannelMixRow {
  channel: string;
  pctShare: number;
  amountIdrMinor: IdrMinor;
}

export async function getRevenueByChannel(monthsBack = 1): Promise<ChannelMixRow[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db.execute<{
    channel: string;
    total_usd: string;
  }>(sql`
    SELECT COALESCE(bc.name, 'Direct') AS channel,
           SUM(b.gross_amount)::text AS total_usd
      FROM bookings b
      LEFT JOIN booking_channels bc ON bc.id = b.channel_id
     WHERE b.status IN ('confirmed','checked_in','checked_out')
       AND b.check_in >= (date_trunc('month', CURRENT_DATE) - (${monthsBack - 1} || ' months')::interval)::date
     GROUP BY 1
     ORDER BY SUM(b.gross_amount) DESC NULLS LAST
     LIMIT 6
  `);
  const data = (rows as unknown as { rows: Array<{ channel: string; total_usd: string }> }).rows ?? [];
  const total = data.reduce((s, r) => s + Number(r.total_usd || 0), 0);
  return data.map((r) => {
    const amt = Number(r.total_usd || 0);
    return {
      channel: r.channel,
      pctShare: total > 0 ? Math.round((amt / total) * 1000) / 10 : 0,
      amountIdrMinor: usdToIdrMinor(amt),
    };
  });
}

export interface MonthlyRevenueRow {
  monthIso: string;
  monthLabel: string;
  amountIdrMinor: IdrMinor;
}

export async function getMonthlyRevenueStrip(months = 6): Promise<MonthlyRevenueRow[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db.execute<{ month_iso: string; total_usd: string }>(sql`
    SELECT to_char(date_trunc('month', b.check_in), 'YYYY-MM') AS month_iso,
           SUM(b.gross_amount)::text AS total_usd
      FROM bookings b
     WHERE b.status IN ('confirmed','checked_in','checked_out')
       AND b.check_in >= (date_trunc('month', CURRENT_DATE) - (${months - 1} || ' months')::interval)::date
     GROUP BY 1
     ORDER BY 1 ASC
  `);
  const data = (rows as unknown as { rows: Array<{ month_iso: string; total_usd: string }> }).rows ?? [];
  return data.map((r) => {
    const [year, month] = r.month_iso.split("-");
    const monthLabel = new Date(Number(year), Number(month) - 1, 1).toLocaleString("en", {
      month: "short",
    });
    return {
      monthIso: r.month_iso,
      monthLabel,
      amountIdrMinor: usdToIdrMinor(Number(r.total_usd || 0)),
    };
  });
}

export interface OwnerPayoutRow {
  ownerId: string;
  name: string;
  villasCount: number;
  projectName: string | null;
  payoutUsdMinor: bigint;
  yieldPct: number; // operator's gross yield indicator
}

export async function getOwnersYtdPayouts(top = 3): Promise<OwnerPayoutRow[]> {
  const db = getDb();
  if (!db) return [];
  // Owner's share of (booking gross × (1 - commission)), aggregated across
  // the villas they own via ownership_shares.share_percent.
  const rows = await db.execute<{
    owner_id: string;
    name: string;
    villas_count: string;
    project_name: string | null;
    payout_usd: string;
    villa_revenue_usd: string;
  }>(sql`
    WITH villa_yr_revenue AS (
      SELECT b.villa_id,
             SUM(b.gross_amount) AS revenue_usd
        FROM bookings b
       WHERE b.status IN ('confirmed','checked_in','checked_out')
         AND b.check_in >= date_trunc('year', CURRENT_DATE)::date
       GROUP BY b.villa_id
    ),
    owner_payout AS (
      SELECT o.id AS owner_id,
             o.display_name AS name,
             COUNT(DISTINCT os.villa_id) AS villas_count,
             SUM(COALESCE(vyr.revenue_usd, 0) * (os.share_percent / 100)) AS villa_revenue_usd,
             SUM(COALESCE(vyr.revenue_usd, 0) * (os.share_percent / 100) * ${1 - OPERATOR_COMMISSION}) AS payout_usd,
             (ARRAY_AGG(p.name ORDER BY p.name))[1] AS project_name
        FROM owners o
        JOIN ownership_shares os ON os.owner_id = o.id
        LEFT JOIN villas v ON v.id = os.villa_id
        LEFT JOIN projects p ON p.id = v.project_id
        LEFT JOIN villa_yr_revenue vyr ON vyr.villa_id = os.villa_id
       WHERE os.status = 'active'
       GROUP BY o.id, o.display_name
    )
    SELECT owner_id::text       AS owner_id,
           name                  AS name,
           villas_count::text    AS villas_count,
           project_name          AS project_name,
           payout_usd::text      AS payout_usd,
           villa_revenue_usd::text AS villa_revenue_usd
      FROM owner_payout
     ORDER BY payout_usd DESC NULLS LAST
     LIMIT ${top}
  `);
  return (
    (rows as unknown as { rows: Array<{
      owner_id: string;
      name: string;
      villas_count: string;
      project_name: string | null;
      payout_usd: string;
      villa_revenue_usd: string;
    }> }).rows ?? []
  ).map((r) => {
    const payout = Number(r.payout_usd || 0);
    const revenue = Number(r.villa_revenue_usd || 0);
    const yieldPct = revenue > 0 ? (payout / revenue) * 100 : 0;
    return {
      ownerId: r.owner_id,
      name: r.name,
      villasCount: Number(r.villas_count || 0),
      projectName: r.project_name,
      payoutUsdMinor: BigInt(Math.round(payout * 100)),
      yieldPct: Math.round(yieldPct * 10) / 10,
    };
  });
}

export interface PortfolioProjectRow {
  projectId: string;
  projectName: string;
  location: string;
  villasCount: number;
  managementModel: string;
  occYtdPct: number;
  adrIdrMinor: IdrMinor;
  ytdRevenueIdrMinor: IdrMinor;
}

export async function getPortfolioProjects(): Promise<PortfolioProjectRow[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db.execute<{
    project_id: string;
    project_name: string;
    location: string;
    villas_count: string;
    model: string;
    booked_nights_ytd: string;
    revenue_ytd_usd: string;
  }>(sql`
    SELECT p.id::text                AS project_id,
           p.name                     AS project_name,
           p.location                 AS location,
           COUNT(DISTINCT v.id)::text AS villas_count,
           COALESCE(
             (ARRAY_AGG(v.management_model) FILTER (WHERE v.management_model IS NOT NULL))[1],
             'individual'
           ) AS model,
           COALESCE(SUM(
             (SELECT COALESCE(SUM(b.nights), 0)
                FROM bookings b
               WHERE b.villa_id = v.id
                 AND b.status IN ('confirmed','checked_in','checked_out')
                 AND b.check_in >= date_trunc('year', CURRENT_DATE)::date)
           ), 0)::text AS booked_nights_ytd,
           COALESCE(SUM(
             (SELECT COALESCE(SUM(b.gross_amount), 0)
                FROM bookings b
               WHERE b.villa_id = v.id
                 AND b.status IN ('confirmed','checked_in','checked_out')
                 AND b.check_in >= date_trunc('year', CURRENT_DATE)::date)
           ), 0)::text AS revenue_ytd_usd
      FROM projects p
      LEFT JOIN villas v ON v.project_id = p.id
     WHERE p.status NOT IN ('completed','paused','archived')
     GROUP BY p.id, p.name, p.location
     HAVING COUNT(DISTINCT v.id) > 0
     ORDER BY revenue_ytd_usd DESC NULLS LAST
     LIMIT 6
  `);
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 1).getTime()) / 86400000,
  ) + 1;
  return (
    (rows as unknown as { rows: Array<{
      project_id: string;
      project_name: string;
      location: string;
      villas_count: string;
      model: string;
      booked_nights_ytd: string;
      revenue_ytd_usd: string;
    }> }).rows ?? []
  ).map((r) => {
    const villas = Number(r.villas_count || 0);
    const nights = Number(r.booked_nights_ytd || 0);
    const revenue = Number(r.revenue_ytd_usd || 0);
    const occ = villas > 0 && dayOfYear > 0 ? (nights / (villas * dayOfYear)) * 100 : 0;
    const adr = nights > 0 ? revenue / nights : 0;
    return {
      projectId: r.project_id,
      projectName: r.project_name,
      location: r.location ?? "Bali",
      villasCount: villas,
      managementModel: r.model,
      occYtdPct: Math.round(occ * 10) / 10,
      adrIdrMinor: usdToIdrMinor(adr),
      ytdRevenueIdrMinor: usdToIdrMinor(revenue),
    };
  });
}

export interface TodayScheduleRow {
  time: string; // 'HH:MM'
  type: "arrival" | "departure" | "turnover";
  villaCode: string;
  guestName: string | null;
  nights: number;
}

export async function getTodaySchedule(date?: string): Promise<TodayScheduleRow[]> {
  const db = getDb();
  if (!db) return [];
  const today = date ?? new Date().toISOString().slice(0, 10);
  const rows = await db.execute<{
    kind: string;
    villa_code: string;
    guest_name: string | null;
    nights: string;
  }>(sql`
    SELECT 'arrival' AS kind,
           v.unit_code AS villa_code,
           b.notes     AS guest_name,
           b.nights::text AS nights
      FROM bookings b
      JOIN villas v ON v.id = b.villa_id
     WHERE b.check_in = ${today}
       AND b.status IN ('confirmed','checked_in')
    UNION ALL
    SELECT 'departure' AS kind,
           v.unit_code AS villa_code,
           b.notes     AS guest_name,
           b.nights::text AS nights
      FROM bookings b
      JOIN villas v ON v.id = b.villa_id
     WHERE b.check_out = ${today}
       AND b.status IN ('checked_in','checked_out')
     ORDER BY 1, 2
     LIMIT 12
  `);
  return (
    (rows as unknown as { rows: Array<{
      kind: string;
      villa_code: string;
      guest_name: string | null;
      nights: string;
    }> }).rows ?? []
  ).map((r) => ({
    time: r.kind === "arrival" ? "14:00" : "11:00",
    type: r.kind as "arrival" | "departure",
    villaCode: r.villa_code,
    guestName: r.guest_name?.replace(/^\[DEMO2\] /, "").trim() || null,
    nights: Number(r.nights || 0),
  }));
}

export interface StatementNudge {
  ownerName: string;
  villaCode: string;
  monthLabel: string;
  autoSendAt: string;
  statementId: string;
}

/** No `owner_statements` table seeded yet (STATEMENT-1 sprint). */
export async function getCurrentStatementNudge(): Promise<StatementNudge | null> {
  return null;
}
