import "server-only";

import { sql } from "drizzle-orm";
import { getDb, rowsOf } from "@/lib/db/client";
import { getOperationsKpis } from "@/features/operations/operations-cabinet-queries";
import { requireOrgId } from "@/features/auth/require-org";

/**
 * Sprint TASK-6-DATA-PART-1 — Mgmt OS Overview live read aggregates.
 *
 * TENANCY: every read is org-scoped via requireOrgId() (the DB role bypasses
 * RLS, so a fresh tenant would otherwise see every org's — and demo — money).
 * bookings/projects/owner_statements/owner_stay_requests/ownership_shares carry
 * organization_id; villas reach it via their project. Each function degrades to
 * its EMPTY shape if the org context can't be resolved (anonymous probe) so the
 * Overview never 500s. (The earlier header here claimed these tables were
 * "above the multi-tenancy line" — that's no longer true; the org columns
 * landed in mig 0149/0152/0154/0155/0173.)
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
  const orgId = await requireOrgId().catch(() => null);
  if (!orgId) return EMPTY_METRICS;

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
      (SELECT COUNT(*)::text FROM villas
        WHERE status NOT IN ('archived','out_of_service')
          AND project_id IN (SELECT id FROM projects WHERE organization_id = ${orgId})) AS villa_count,
      COALESCE((
        SELECT SUM(nights)::text FROM bookings b, yr
         WHERE b.status IN ('confirmed','checked_in','checked_out')
           AND b.check_in >= yr.year_start
           AND b.organization_id = ${orgId}
      ), '0') AS booked_nights_ytd,
      COALESCE((
        SELECT SUM(gross_amount)::text FROM bookings b, yr
         WHERE b.status IN ('confirmed','checked_in','checked_out')
           AND b.check_in >= yr.year_start
           AND b.organization_id = ${orgId}
      ), '0') AS revenue_ytd_usd,
      COALESCE((
        SELECT SUM(gross_amount)::text FROM bookings b, mt
         WHERE b.status IN ('confirmed','checked_in','checked_out')
           AND b.check_in >= mt.month_start
           AND b.organization_id = ${orgId}
      ), '0') AS revenue_mtd_usd
  `);
  // SHAPE-FIX-1: rowsOf() handles postgres-js's Array return shape. The
  // prior `.rows?.[0]` accessor read `undefined` on this driver, so this
  // query silently returned EMPTY_METRICS even when the DB had data.
  const r = rowsOf<{
    villa_count: string;
    booked_nights_ytd: string;
    revenue_ytd_usd: string;
    revenue_mtd_usd: string;
  }>(row)[0];
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
  const orgId = await requireOrgId().catch(() => null);
  if (!orgId) return [];
  const rows = await db.execute<{
    channel: string;
    total_usd: string;
  }>(sql`
    SELECT COALESCE(bc.name, 'Direct') AS channel,
           SUM(b.gross_amount)::text AS total_usd
      FROM bookings b
      LEFT JOIN booking_channels bc ON bc.id = b.channel_id
     WHERE b.status IN ('confirmed','checked_in','checked_out')
       AND b.organization_id = ${orgId}
       AND b.check_in >= (date_trunc('month', CURRENT_DATE) - (${monthsBack - 1} || ' months')::interval)::date
     GROUP BY 1
     ORDER BY SUM(b.gross_amount) DESC NULLS LAST
     LIMIT 6
  `);
  const data = rowsOf<{ channel: string; total_usd: string }>(rows);
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
  const orgId = await requireOrgId().catch(() => null);
  if (!orgId) return [];
  const rows = await db.execute<{ month_iso: string; total_usd: string }>(sql`
    SELECT to_char(date_trunc('month', b.check_in), 'YYYY-MM') AS month_iso,
           SUM(b.gross_amount)::text AS total_usd
      FROM bookings b
     WHERE b.status IN ('confirmed','checked_in','checked_out')
       AND b.organization_id = ${orgId}
       AND b.check_in >= (date_trunc('month', CURRENT_DATE) - (${months - 1} || ' months')::interval)::date
     GROUP BY 1
     ORDER BY 1 ASC
  `);
  const data = rowsOf<{ month_iso: string; total_usd: string }>(rows);
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
  const orgId = await requireOrgId().catch(() => null);
  if (!orgId) return [];
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
         AND b.organization_id = ${orgId}
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
         AND os.organization_id = ${orgId}
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
  return rowsOf<{
    owner_id: string;
    name: string;
    villas_count: string;
    project_name: string | null;
    payout_usd: string;
    villa_revenue_usd: string;
  }>(rows).map((r) => {
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
  const orgId = await requireOrgId().catch(() => null);
  if (!orgId) return [];
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
       AND p.organization_id = ${orgId}
     GROUP BY p.id, p.name, p.location, p.created_at
     ORDER BY revenue_ytd_usd DESC NULLS LAST,
              COUNT(DISTINCT v.id) DESC,
              p.created_at DESC
     LIMIT 6
  `);
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 1).getTime()) / 86400000,
  ) + 1;
  return rowsOf<{
    project_id: string;
    project_name: string;
    location: string;
    villas_count: string;
    model: string;
    booked_nights_ytd: string;
    revenue_ytd_usd: string;
  }>(rows).map((r) => {
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
  const orgId = await requireOrgId().catch(() => null);
  if (!orgId) return [];
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
       AND b.organization_id = ${orgId}
    UNION ALL
    SELECT 'departure' AS kind,
           v.unit_code AS villa_code,
           b.notes     AS guest_name,
           b.nights::text AS nights
      FROM bookings b
      JOIN villas v ON v.id = b.villa_id
     WHERE b.check_out = ${today}
       AND b.status IN ('checked_in','checked_out')
       AND b.organization_id = ${orgId}
     ORDER BY 1, 2
     LIMIT 12
  `);
  return rowsOf<{
    kind: string;
    villa_code: string;
    guest_name: string | null;
    nights: string;
  }>(rows).map((r) => ({
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

/**
 * Surfaces the owner statement closest to its automated milestone that
 * still awaits operator attention — the Overview's "next action" band.
 *
 * Targets statements still in the owner-side `pending` state that have an
 * `auto_ack_at` deadline set (i.e. they've become "ready for owner" and
 * the scheduler will auto-acknowledge/send on that date). Soonest deadline
 * first. Returns null when nothing is pending — the page renders nothing.
 *
 * `owner_statements` exists since STATEMENT-1 (mig 0104) + the owner-state
 * ALTER (mig 0112); the previous `return null` stub predated those.
 */
export async function getCurrentStatementNudge(): Promise<StatementNudge | null> {
  const db = getDb();
  if (!db) return null;
  const orgId = await requireOrgId().catch(() => null);
  if (!orgId) return null;
  const rows = await db.execute<{
    statement_id: string;
    owner_name: string | null;
    villa_code: string | null;
    period_month: string | null;
    auto_ack_at: string;
  }>(sql`
    SELECT s.id::text                          AS statement_id,
           o.display_name                       AS owner_name,
           v.unit_code                          AS villa_code,
           to_char(s.period_month, 'YYYY-MM')   AS period_month,
           s.auto_ack_at::text                  AS auto_ack_at
      FROM owner_statements s
      JOIN owners o ON o.id = s.owner_id
      LEFT JOIN villas v ON v.id = s.villa_id
     WHERE s.owner_state = 'pending'
       AND s.auto_ack_at IS NOT NULL
       AND s.organization_id = ${orgId}
     ORDER BY s.auto_ack_at ASC
     LIMIT 1
  `);
  const r = rowsOf<{
    statement_id: string;
    owner_name: string | null;
    villa_code: string | null;
    period_month: string | null;
    auto_ack_at: string;
  }>(rows)[0];
  if (!r) return null;

  let monthLabel = "—";
  if (r.period_month) {
    const [y, m] = r.period_month.split("-");
    monthLabel = new Date(Number(y), Number(m) - 1, 1).toLocaleString("en", {
      month: "long",
      year: "numeric",
    });
  }
  const autoSendAt = new Date(r.auto_ack_at).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });

  return {
    ownerName: (r.owner_name ?? "Owner").replace(/^\[DEMO\] /, "").trim(),
    villaCode: r.villa_code ?? "Portfolio",
    monthLabel,
    autoSendAt,
    statementId: r.statement_id,
  };
}

export interface OperationalHealthTiles {
  /** Maintenance tickets not yet resolved/closed/cancelled. */
  openMaintenance: number;
  /** Today's check-outs — the turnover/housekeeping workload for today. */
  housekeepingTurnoversToday: number;
  /** Owner-stay requests still awaiting an operator decision. */
  ownerStayRequestsPending: number;
}

/**
 * The Overview's operational-health tile row. Reuses the live ops cabinet
 * aggregate (`getOperationsKpis`) for maintenance + turnovers, and counts
 * owner-stay requests awaiting a decision. These tiles previously rendered
 * a hardcoded "—".
 */
export async function getOperationalHealthTiles(): Promise<OperationalHealthTiles> {
  const db = getDb();
  if (!db) {
    return {
      openMaintenance: 0,
      housekeepingTurnoversToday: 0,
      ownerStayRequestsPending: 0,
    };
  }

  const orgId = await requireOrgId().catch(() => null);
  const kpis = await getOperationsKpis();

  // Pending = no decision recorded yet. Keyed off the decision timestamps
  // rather than the `status` string so it's robust to status-vocab drift.
  const rows = orgId
    ? await db.execute<{ pending: string }>(sql`
        SELECT COUNT(*)::text AS pending
          FROM owner_stay_requests
         WHERE approved_at IS NULL
           AND rejected_at IS NULL
           AND completed_at IS NULL
           AND organization_id = ${orgId}
      `)
    : [];
  const ownerStayRequestsPending = Number(
    rowsOf<{ pending: string }>(rows)[0]?.pending ?? "0",
  );

  return {
    openMaintenance: kpis.ticketsOpen,
    housekeepingTurnoversToday: kpis.turnoversToday,
    ownerStayRequestsPending,
  };
}

export interface AgentActivityRow {
  agentKey: string;
  /** Total invocations in the lookback window. */
  runs: number;
  /** Most-recent run status, drives the dot colour. */
  lastStatus: string;
  /** ISO of the most-recent run. */
  lastRunAt: string;
}

export interface AgentActivitySummary {
  rows: AgentActivityRow[];
  /** Distinct agents that ran in the window. */
  activeAgents: number;
  /** Total spend (USD minor) across the window — the "$N today" teaser. */
  costMinorUsd: bigint;
}

const EMPTY_AGENT_ACTIVITY: AgentActivitySummary = {
  rows: [],
  activeAgents: 0,
  costMinorUsd: 0n,
};

/**
 * The Overview's "AI agents · live" card. Aggregates the last 24h of
 * `agent_invocation_log` per agent_key into one row each (run count, most
 * recent status + time), plus the active-agent count and total spend for
 * the header teaser. Tenant-scoped via requireOrgId; degrades to empty if
 * the org context can't be resolved (anonymous probe) so the card simply
 * renders its idle/empty state rather than throwing.
 */
export async function getAgentActivity(limit = 6): Promise<AgentActivitySummary> {
  const db = getDb();
  if (!db) return EMPTY_AGENT_ACTIVITY;

  let orgId: string;
  try {
    orgId = await requireOrgId();
  } catch {
    return EMPTY_AGENT_ACTIVITY;
  }

  const rows = await db.execute<{
    agent_key: string;
    runs: string;
    last_status: string;
    last_run_at: string;
  }>(sql`
    WITH recent AS (
      SELECT agent_key, status, invoked_at, cost_minor,
             ROW_NUMBER() OVER (PARTITION BY agent_key ORDER BY invoked_at DESC) AS rn
        FROM agent_invocation_log
       WHERE organization_id = ${orgId}
         AND invoked_at >= now() - interval '24 hours'
    )
    SELECT agent_key                                   AS agent_key,
           COUNT(*)::text                               AS runs,
           (ARRAY_AGG(status ORDER BY invoked_at DESC))[1] AS last_status,
           MAX(invoked_at)::text                        AS last_run_at
      FROM recent
     GROUP BY agent_key
     ORDER BY MAX(invoked_at) DESC
     LIMIT ${limit}
  `);

  const data = rowsOf<{
    agent_key: string;
    runs: string;
    last_status: string;
    last_run_at: string;
  }>(rows).map((r) => ({
    agentKey: r.agent_key,
    runs: Number(r.runs || "0"),
    lastStatus: r.last_status,
    lastRunAt: r.last_run_at,
  }));

  const totals = await db.execute<{ active: string; cost_minor: string }>(sql`
    SELECT COUNT(DISTINCT agent_key)::text       AS active,
           COALESCE(SUM(cost_minor), 0)::text    AS cost_minor
      FROM agent_invocation_log
     WHERE organization_id = ${orgId}
       AND invoked_at >= now() - interval '24 hours'
  `);
  const t = rowsOf<{ active: string; cost_minor: string }>(totals)[0];

  return {
    rows: data,
    activeAgents: Number(t?.active ?? "0"),
    costMinorUsd: BigInt(t?.cost_minor ?? "0"),
  };
}
