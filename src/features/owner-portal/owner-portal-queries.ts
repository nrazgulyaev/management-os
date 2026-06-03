import "server-only";

import { sql } from "drizzle-orm";
import { getDb, rowsOf } from "@/lib/db/client";

/**
 * Sprint OWNER-PORTAL-1A — Owner portal read aggregates.
 *
 * All queries owner-scoped via the `ownerId` parameter. Tenant scope
 * flows implicitly from the owner ↔ villa chain (an owner sees only
 * their own villas, and an owner only exists within one org via
 * ownership_shares → villas → projects).
 *
 * FX 15,800 IDR/USD pinned consistent with PART-1.
 */

const FX_USD_TO_IDR = 15_800;

function idrMinorToUsdMinor(idrMinor: bigint): bigint {
  return BigInt(Math.round((Number(idrMinor) / 100) / FX_USD_TO_IDR * 100));
}

export interface OwnerVillaRow {
  villaId: string;
  villaCode: string | null;
  villaName: string | null;
  projectName: string | null;
  sharePercent: number;
  mtdNetUsdMinor: bigint;
  occupancyPct: number;
  adrUsdMinor: bigint;
  bedrooms: number;
}

export async function listMyVillas(ownerId: string): Promise<OwnerVillaRow[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db.execute<{
    villa_id: string;
    villa_code: string | null;
    villa_name: string | null;
    project_name: string | null;
    share_percent: string;
    mtd_net_usd: string;
    mtd_nights: string;
    mtd_revenue_usd: string;
    bedrooms: number;
  }>(sql`
    WITH mtd AS (
      SELECT b.villa_id,
             SUM(b.gross_amount) FILTER (WHERE b.currency = 'USD') AS revenue_usd_units,
             SUM(b.nights) AS booked_nights
        FROM bookings b
       WHERE b.status IN ('confirmed','checked_in','checked_out')
         AND b.check_in >= date_trunc('month', CURRENT_DATE)::date
       GROUP BY b.villa_id
    )
    SELECT v.id::text                                     AS villa_id,
           v.unit_code                                      AS villa_code,
           v.name                                           AS villa_name,
           p.name                                           AS project_name,
           os.share_percent::text                           AS share_percent,
           COALESCE(mtd.revenue_usd_units::text, '0')       AS mtd_revenue_usd,
           COALESCE(mtd.booked_nights::text, '0')           AS mtd_nights,
           COALESCE(
             ((mtd.revenue_usd_units * os.share_percent / 100) * 0.8)::text,
             '0'
           ) AS mtd_net_usd,
           COALESCE(v.bedrooms, 0)                          AS bedrooms
      FROM ownership_shares os
      JOIN villas v ON v.id = os.villa_id
      LEFT JOIN projects p ON p.id = v.project_id
      LEFT JOIN mtd ON mtd.villa_id = v.id
     WHERE os.owner_id = ${ownerId}::uuid
       AND os.status = 'active'
     ORDER BY v.unit_code ASC
  `);
  // SHAPE-FIX: postgres-js returns db.execute() as an Array; the old
  // `.rows ?? []` accessor read undefined and silently dropped every row
  // (the "0 villas" bug). rowsOf<T>() handles the real shape.
  const data = rowsOf<{
    villa_id: string;
    villa_code: string | null;
    villa_name: string | null;
    project_name: string | null;
    share_percent: string;
    mtd_net_usd: string;
    mtd_nights: string;
    mtd_revenue_usd: string;
    bedrooms: number;
  }>(rows);

  const dayOfMonth = new Date().getUTCDate();
  return data.map((r) => {
    const sharePct = Number(r.share_percent || 0);
    const nights = Number(r.mtd_nights || 0);
    const revenueUsd = Number(r.mtd_revenue_usd || 0);
    const netUsd = Number(r.mtd_net_usd || 0);
    const occupancy = dayOfMonth > 0 ? Math.min(100, (nights / dayOfMonth) * 100) : 0;
    const adrUsd = nights > 0 ? revenueUsd / nights : 0;
    return {
      villaId: r.villa_id,
      villaCode: r.villa_code,
      villaName: r.villa_name?.replace(/^\[DEMO2\] /, "") ?? null,
      projectName: r.project_name?.replace(/^\[DEMO\] /, "") ?? null,
      sharePercent: sharePct,
      mtdNetUsdMinor: BigInt(Math.round(netUsd * 100)),
      occupancyPct: Math.round(occupancy * 10) / 10,
      adrUsdMinor: BigInt(Math.round(adrUsd * 100)),
      bedrooms: Number(r.bedrooms) || 0,
    };
  });
}

export interface OwnerStatementRow {
  statementId: string;
  statementCode: string;
  villaCode: string | null;
  periodMonth: string;
  monthLabel: string;
  netToOwnerIdrMinor: bigint;
  netToOwnerUsdMinor: bigint;
  status: string;
  approvedAt: string | null;
  sentAt: string | null;
  sentToEmail: string | null;
  contentHash: string | null;
  /** Owner-side lifecycle state (FC-OWNER-STATEMENTS). Optional: only the list query populates these. */
  ownerState?: string;
  lineCount?: number;
  ownerAckedAt?: string | null;
  autoAckAt?: string | null;
}

export async function listMyStatements(
  ownerId: string,
  opts?: { statusFilter?: string; limit?: number },
): Promise<OwnerStatementRow[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db.execute<{
    id: string;
    statement_code: string;
    villa_code: string | null;
    period_month: string;
    net_idr_minor: string;
    net_usd_minor: string | null;
    status: string;
    approved_at: string | null;
    sent_at: string | null;
    sent_to_email: string | null;
    content_hash: string | null;
    owner_state: string;
    owner_acked_at: string | null;
    auto_ack_at: string | null;
    line_count: string;
  }>(sql`
    SELECT s.id::text                         AS id,
           s.statement_code                    AS statement_code,
           v.unit_code                          AS villa_code,
           s.period_month::text                AS period_month,
           s.net_payout_minor::text            AS net_idr_minor,
           s.net_to_owner_usd_minor::text      AS net_usd_minor,
           s.status                            AS status,
           s.approved_at::text                 AS approved_at,
           s.sent_at::text                     AS sent_at,
           s.sent_to_email                     AS sent_to_email,
           s.content_hash                      AS content_hash,
           s.owner_state                       AS owner_state,
           s.owner_acked_at::text              AS owner_acked_at,
           s.auto_ack_at::text                 AS auto_ack_at,
           (SELECT count(*) FROM statement_lines sl WHERE sl.statement_id = s.id)::text AS line_count
      FROM owner_statements s
      LEFT JOIN villas v ON v.id = s.villa_id
     WHERE s.owner_id = ${ownerId}::uuid
       AND (${opts?.statusFilter ?? null}::text IS NULL OR s.status = ${opts?.statusFilter ?? null})
     ORDER BY s.period_month DESC NULLS LAST, s.created_at DESC
     LIMIT ${opts?.limit ?? 24}
  `);
  return rowsOf<{
    id: string;
    statement_code: string;
    villa_code: string | null;
    period_month: string;
    net_idr_minor: string;
    net_usd_minor: string | null;
    status: string;
    approved_at: string | null;
    sent_at: string | null;
    sent_to_email: string | null;
    content_hash: string | null;
    owner_state: string;
    owner_acked_at: string | null;
    auto_ack_at: string | null;
    line_count: string;
  }>(rows).map((r) => {
    const [y, m] = r.period_month.split("-").map(Number);
    const monthLabel = new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en", {
      month: "long",
      year: "numeric",
    });
    return {
      statementId: r.id,
      statementCode: r.statement_code,
      villaCode: r.villa_code,
      periodMonth: r.period_month,
      monthLabel,
      netToOwnerIdrMinor: BigInt(r.net_idr_minor ?? "0"),
      netToOwnerUsdMinor: BigInt(r.net_usd_minor ?? "0"),
      status: r.status,
      approvedAt: r.approved_at,
      sentAt: r.sent_at,
      sentToEmail: r.sent_to_email,
      contentHash: r.content_hash,
      ownerState: r.owner_state,
      ownerAckedAt: r.owner_acked_at,
      autoAckAt: r.auto_ack_at,
      lineCount: Number(r.line_count ?? "0"),
    };
  });
}

export interface OwnerStatementDetail extends OwnerStatementRow {
  villaName: string | null;
  ownerName: string;
  commissionPct: number;
  grossIdrMinor: bigint;
  lines: Array<{
    id: string;
    lineType: string;
    category: string;
    description: string;
    amountIdrMinor: bigint;
  }>;
}

export async function getMyStatementDetail(
  ownerId: string,
  statementId: string,
): Promise<OwnerStatementDetail | null> {
  const db = getDb();
  if (!db) return null;
  const sRows = await db.execute<{
    id: string;
    statement_code: string;
    villa_code: string | null;
    villa_name: string | null;
    owner_name: string;
    period_month: string;
    net_idr_minor: string;
    net_usd_minor: string | null;
    status: string;
    approved_at: string | null;
    sent_at: string | null;
    sent_to_email: string | null;
    content_hash: string | null;
    commission_pct: string | null;
    gross_minor: string;
  }>(sql`
    SELECT s.id::text                         AS id,
           s.statement_code                    AS statement_code,
           v.unit_code                          AS villa_code,
           v.name                               AS villa_name,
           o.display_name                       AS owner_name,
           s.period_month::text                AS period_month,
           s.net_payout_minor::text            AS net_idr_minor,
           s.net_to_owner_usd_minor::text      AS net_usd_minor,
           s.status                            AS status,
           s.approved_at::text                 AS approved_at,
           s.sent_at::text                     AS sent_at,
           s.sent_to_email                     AS sent_to_email,
           s.content_hash                      AS content_hash,
           s.operator_commission_pct::text     AS commission_pct,
           s.gross_revenue_minor::text         AS gross_minor
      FROM owner_statements s
      LEFT JOIN villas v ON v.id = s.villa_id
      LEFT JOIN owners o ON o.id = s.owner_id
     WHERE s.id = ${statementId}::uuid
       AND s.owner_id = ${ownerId}::uuid
     LIMIT 1
  `);
  const sr = rowsOf<{
    id: string;
    statement_code: string;
    villa_code: string | null;
    villa_name: string | null;
    owner_name: string;
    period_month: string;
    net_idr_minor: string;
    net_usd_minor: string | null;
    status: string;
    approved_at: string | null;
    sent_at: string | null;
    sent_to_email: string | null;
    content_hash: string | null;
    commission_pct: string | null;
    gross_minor: string;
  }>(sRows)[0];
  if (!sr) return null;

  const lRows = await db.execute<{
    id: string;
    line_type: string;
    category: string;
    description: string;
    amount_minor: string;
  }>(sql`
    SELECT id::text          AS id,
           line_type          AS line_type,
           category           AS category,
           description        AS description,
           amount_minor::text AS amount_minor
      FROM statement_lines
     WHERE statement_id = ${statementId}::uuid
     ORDER BY sort_order ASC
  `);
  const lines = rowsOf<{
    id: string; line_type: string; category: string; description: string; amount_minor: string;
  }>(lRows).map((l) => ({
    id: l.id,
    lineType: l.line_type,
    category: l.category,
    description: l.description,
    amountIdrMinor: BigInt(l.amount_minor ?? "0"),
  }));

  const [y, m] = sr.period_month.split("-").map(Number);
  const monthLabel = new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en", {
    month: "long",
    year: "numeric",
  });

  return {
    statementId: sr.id,
    statementCode: sr.statement_code,
    villaCode: sr.villa_code,
    villaName: sr.villa_name?.replace(/^\[DEMO2\] /, "") ?? null,
    ownerName: sr.owner_name,
    periodMonth: sr.period_month,
    monthLabel,
    netToOwnerIdrMinor: BigInt(sr.net_idr_minor ?? "0"),
    netToOwnerUsdMinor: BigInt(sr.net_usd_minor ?? "0"),
    status: sr.status,
    approvedAt: sr.approved_at,
    sentAt: sr.sent_at,
    sentToEmail: sr.sent_to_email,
    contentHash: sr.content_hash,
    commissionPct: Number(sr.commission_pct ?? "0.2") * 100,
    grossIdrMinor: BigInt(sr.gross_minor ?? "0"),
    lines,
  };
}

export interface TwelveMonthBucket {
  monthIso: string;
  monthLabel: string;
  netUsdMinor: bigint;
}

export async function getTwelveMonthNetSeries(ownerId: string): Promise<TwelveMonthBucket[]> {
  const db = getDb();
  if (!db) return [];
  const today = new Date();
  const buckets: TwelveMonthBucket[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1));
    const monthIso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
    buckets.push({
      monthIso,
      monthLabel: d.toLocaleString("en", { month: "short", year: "2-digit" }),
      netUsdMinor: 0n,
    });
  }
  const start = buckets[0].monthIso;
  const rows = await db.execute<{
    period_month: string;
    net_usd_minor: string | null;
    net_idr_minor: string;
  }>(sql`
    SELECT s.period_month::text             AS period_month,
           s.net_to_owner_usd_minor::text   AS net_usd_minor,
           s.net_payout_minor::text         AS net_idr_minor
      FROM owner_statements s
     WHERE s.owner_id = ${ownerId}::uuid
       AND s.period_month IS NOT NULL
       AND s.period_month >= ${start}::date
  `);
  const data = rowsOf<{
    period_month: string; net_usd_minor: string | null; net_idr_minor: string;
  }>(rows);
  const byMonth = new Map(buckets.map((b) => [b.monthIso, b]));
  for (const r of data) {
    const b = byMonth.get(r.period_month);
    if (!b) continue;
    const usdMinor = r.net_usd_minor
      ? BigInt(r.net_usd_minor)
      : idrMinorToUsdMinor(BigInt(r.net_idr_minor ?? "0"));
    b.netUsdMinor += usdMinor;
  }
  return buckets;
}

export interface OwnerDashboardKpis {
  netToYouLatestUsdMinor: bigint;
  latestPeriodLabel: string | null;
  occupancy30DayPct: number;
  adrUsdMinor: bigint;
  directPct: number;
  otaPct: number;
}

export async function getOwnerDashboardKpis(ownerId: string): Promise<OwnerDashboardKpis> {
  const db = getDb();
  const empty: OwnerDashboardKpis = {
    netToYouLatestUsdMinor: 0n,
    latestPeriodLabel: null,
    occupancy30DayPct: 0,
    adrUsdMinor: 0n,
    directPct: 0,
    otaPct: 0,
  };
  if (!db) return empty;
  const latestStmtRow = await db.execute<{
    period_month: string;
    net_usd_minor: string | null;
    net_idr_minor: string;
  }>(sql`
    SELECT period_month::text             AS period_month,
           net_to_owner_usd_minor::text   AS net_usd_minor,
           net_payout_minor::text         AS net_idr_minor
      FROM owner_statements
     WHERE owner_id = ${ownerId}::uuid
     ORDER BY period_month DESC NULLS LAST, created_at DESC
     LIMIT 1
  `);
  const ls = rowsOf<{
    period_month: string; net_usd_minor: string | null; net_idr_minor: string;
  }>(latestStmtRow)[0];

  // 30-day occupancy + ADR + channel mix across owner's villas.
  const opsRow = await db.execute<{
    bookings_30d: string;
    nights_30d: string;
    revenue_30d_usd: string;
    villa_count: string;
    direct_units: string;
    ota_units: string;
  }>(sql`
    WITH my_villas AS (
      SELECT villa_id FROM ownership_shares
       WHERE owner_id = ${ownerId}::uuid AND status = 'active'
    ),
    last30 AS (
      SELECT b.id, b.villa_id, b.nights,
             b.gross_amount,
             b.currency,
             CASE WHEN bc.key = 'demo2-direct' OR bc.key = 'direct' THEN 'direct' ELSE 'ota' END AS channel_class
        FROM bookings b
        LEFT JOIN booking_channels bc ON bc.id = b.channel_id
       WHERE b.villa_id IN (SELECT villa_id FROM my_villas)
         AND b.status IN ('confirmed','checked_in','checked_out')
         AND b.check_in >= (CURRENT_DATE - INTERVAL '30 days')
    )
    SELECT
      COALESCE(COUNT(*)::text, '0')                                                 AS bookings_30d,
      COALESCE(SUM(nights)::text, '0')                                              AS nights_30d,
      COALESCE(SUM(CASE WHEN currency = 'USD' THEN gross_amount ELSE 0 END)::text,'0') AS revenue_30d_usd,
      (SELECT COUNT(*)::text FROM my_villas)                                        AS villa_count,
      COALESCE(SUM(CASE WHEN channel_class = 'direct' AND currency = 'USD' THEN gross_amount ELSE 0 END)::text,'0') AS direct_units,
      COALESCE(SUM(CASE WHEN channel_class = 'ota'    AND currency = 'USD' THEN gross_amount ELSE 0 END)::text,'0') AS ota_units
      FROM last30
  `);
  const r = rowsOf<{
    bookings_30d: string;
    nights_30d: string;
    revenue_30d_usd: string;
    villa_count: string;
    direct_units: string;
    ota_units: string;
  }>(opsRow)[0];

  const villaCount = Number(r?.villa_count ?? "0");
  const nights = Number(r?.nights_30d ?? "0");
  const revenue = Number(r?.revenue_30d_usd ?? "0");
  const direct = Number(r?.direct_units ?? "0");
  const ota = Number(r?.ota_units ?? "0");
  const totalChannel = direct + ota;
  const occupancy = villaCount > 0 ? Math.min(100, (nights / (villaCount * 30)) * 100) : 0;
  const adr = nights > 0 ? revenue / nights : 0;
  const latestUsd = ls?.net_usd_minor
    ? BigInt(ls.net_usd_minor)
    : ls?.net_idr_minor
      ? idrMinorToUsdMinor(BigInt(ls.net_idr_minor))
      : 0n;
  let latestLabel: string | null = null;
  if (ls?.period_month) {
    const [y, m] = ls.period_month.split("-").map(Number);
    latestLabel = new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en", {
      month: "long",
      year: "numeric",
    });
  }

  return {
    netToYouLatestUsdMinor: latestUsd,
    latestPeriodLabel: latestLabel,
    occupancy30DayPct: Math.round(occupancy * 10) / 10,
    adrUsdMinor: BigInt(Math.round(adr * 100)),
    directPct: totalChannel > 0 ? Math.round((direct / totalChannel) * 1000) / 10 : 0,
    otaPct: totalChannel > 0 ? Math.round((ota / totalChannel) * 1000) / 10 : 0,
  };
}

export interface DistributionsSummary {
  ytdDistributedUsdMinor: bigint;
  statementsCount: number;
  rows: OwnerStatementRow[];
}

export async function listMyDistributions(ownerId: string): Promise<DistributionsSummary> {
  const rows = await listMyStatements(ownerId, { statusFilter: "sent", limit: 50 });
  const yearStart = new Date(new Date().getUTCFullYear(), 0, 1)
    .toISOString()
    .slice(0, 10);
  const ytd = rows
    .filter((r) => r.periodMonth >= yearStart)
    .reduce((s, r) => s + r.netToOwnerUsdMinor, 0n);
  return {
    ytdDistributedUsdMinor: ytd,
    statementsCount: rows.length,
    rows,
  };
}

// =============================================================================
// Sprint OWNER-PORTAL-1B — Owner stay quota tracking.
// Reads from existing owner_stay_policies + owner_stay_requests schema.
// No new table needed (audit confirmed: free_nights_per_year + peak_season_rules
// jsonb already live on owner_stay_policies).
// =============================================================================

export interface OwnerStayQuota {
  policyName: string;
  freeNightsPerYear: number;
  freeNightsApplyToPeak: boolean;
  year: number;
  usedNights: number;
  remainingNights: number;
  peakSeasonStart: string | null;
  peakSeasonEnd: string | null;
  hasPolicy: boolean;
  requestsCount: number;
}

export async function getOwnerStayQuota(
  ownerId: string,
  year: number = new Date().getUTCFullYear(),
): Promise<OwnerStayQuota> {
  const db = getDb();
  const fallback: OwnerStayQuota = {
    policyName: "No policy",
    freeNightsPerYear: 14,
    freeNightsApplyToPeak: false,
    year,
    usedNights: 0,
    remainingNights: 14,
    peakSeasonStart: null,
    peakSeasonEnd: null,
    hasPolicy: false,
    requestsCount: 0,
  };
  if (!db) return fallback;

  // Pick the most-specific applicable policy: villa-level (any of the
  // owner's villas) → project-level → first active policy.
  const policyRows = await db.execute<{
    policy_name: string;
    free_nights: string;
    apply_to_peak: boolean;
    peak_rules: unknown;
  }>(sql`
    WITH owner_villas AS (
      SELECT villa_id, project_id
        FROM ownership_shares os
        JOIN villas v ON v.id = os.villa_id
       WHERE os.owner_id = ${ownerId}::uuid
         AND os.status = 'active'
    )
    SELECT p.policy_name           AS policy_name,
           p.free_nights_per_year::text AS free_nights,
           p.free_nights_apply_to_peak AS apply_to_peak,
           p.peak_season_rules      AS peak_rules
      FROM owner_stay_policies p
     WHERE p.status = 'active'
       AND (
         p.villa_id IN (SELECT villa_id FROM owner_villas)
         OR p.project_id IN (SELECT project_id FROM owner_villas WHERE project_id IS NOT NULL)
         OR (p.villa_id IS NULL AND p.project_id IS NULL)
       )
     ORDER BY (p.villa_id IS NOT NULL) DESC,
              (p.project_id IS NOT NULL) DESC
     LIMIT 1
  `);
  const policy = rowsOf<{
    policy_name: string;
    free_nights: string;
    apply_to_peak: boolean;
    peak_rules: unknown;
  }>(policyRows)[0];

  // Sum allowance_nights_applied for the year. Includes approved +
  // confirmed/relocated. Drafts/rejected excluded.
  const usageRows = await db.execute<{
    used_nights: string;
    requests_count: string;
  }>(sql`
    SELECT COALESCE(SUM(allowance_nights_applied)::text, '0') AS used_nights,
           COUNT(*)::text                                       AS requests_count
      FROM owner_stay_requests
     WHERE owner_id = ${ownerId}::uuid
       AND allowance_year = ${year}
       AND status NOT IN ('rejected','cancelled','withdrawn')
  `);
  const usage = rowsOf<{
    used_nights: string;
    requests_count: string;
  }>(usageRows)[0];

  const freeNights = policy ? Number(policy.free_nights || 14) : 14;
  const used = Number(usage?.used_nights ?? "0");
  const requestsCount = Number(usage?.requests_count ?? "0");
  const remaining = Math.max(0, freeNights - used);

  // Peak season rules — first range entry if shape is { start: 'MM-DD', end: 'MM-DD' }
  // or { ranges: [{ start, end }, ...] }. Defensively probe.
  let peakStart: string | null = null;
  let peakEnd: string | null = null;
  if (policy?.peak_rules) {
    const r = policy.peak_rules as
      | { start?: string; end?: string; ranges?: Array<{ start?: string; end?: string }> };
    if (r.ranges && r.ranges.length > 0) {
      peakStart = r.ranges[0].start ?? null;
      peakEnd = r.ranges[0].end ?? null;
    } else if (r.start) {
      peakStart = r.start;
      peakEnd = r.end ?? null;
    }
  }

  return {
    policyName: policy?.policy_name ?? "Default allowance (14 nights/yr)",
    freeNightsPerYear: freeNights,
    freeNightsApplyToPeak: policy?.apply_to_peak ?? false,
    year,
    usedNights: used,
    remainingNights: remaining,
    peakSeasonStart: peakStart,
    peakSeasonEnd: peakEnd,
    hasPolicy: !!policy,
    requestsCount,
  };
}

// =============================================================================
// Sprint STORAGE-1-WIRE — owner-facing documents reader.
// Pulls `documents` rows with visibility ∈ {'owner_visible','owner','public'}
// scoped to the owner's villas/projects via entity_id chain.
// =============================================================================

export interface OwnerDocumentRow {
  id: string;
  title: string;
  documentType: string;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string;
  visibility: string;
}

export async function listMyDocuments(ownerId: string): Promise<OwnerDocumentRow[]> {
  const db = getDb();
  if (!db) return [];
  // Owner-visible documents = documents directly attached to the
  // owner OR to one of their villas/projects (entity_type+entity_id).
  const rows = await db.execute<{
    id: string;
    title: string;
    document_type: string;
    file_name: string | null;
    mime_type: string | null;
    size_bytes: number | null;
    created_at: string;
    visibility: string;
  }>(sql`
    WITH owner_scope AS (
      SELECT 'owner'::text AS entity_type, ${ownerId}::uuid AS entity_id
      UNION ALL
      SELECT 'villa'::text, os.villa_id::uuid
        FROM ownership_shares os
       WHERE os.owner_id = ${ownerId}::uuid AND os.status = 'active'
      UNION ALL
      SELECT 'project'::text, v.project_id::uuid
        FROM ownership_shares os
        JOIN villas v ON v.id = os.villa_id
       WHERE os.owner_id = ${ownerId}::uuid AND os.status = 'active'
         AND v.project_id IS NOT NULL
    )
    SELECT d.id::text                    AS id,
           d.title                        AS title,
           d.document_type                AS document_type,
           d.file_name                    AS file_name,
           d.mime_type                    AS mime_type,
           d.size_bytes                   AS size_bytes,
           d.created_at::text             AS created_at,
           d.visibility                   AS visibility
      FROM documents d
      JOIN owner_scope os
        ON os.entity_type = d.entity_type AND os.entity_id = d.entity_id
     WHERE d.status = 'active'
       AND d.visibility IN ('owner_visible','owner','public','investor_visible')
     ORDER BY d.created_at DESC
     LIMIT 100
  `);
  return rowsOf<{
    id: string;
    title: string;
    document_type: string;
    file_name: string | null;
    mime_type: string | null;
    size_bytes: number | null;
    created_at: string;
    visibility: string;
  }>(rows).map((r) => ({
    id: r.id,
    title: r.title,
    documentType: r.document_type,
    fileName: r.file_name,
    mimeType: r.mime_type,
    sizeBytes: r.size_bytes,
    createdAt: r.created_at,
    visibility: r.visibility,
  }));
}
