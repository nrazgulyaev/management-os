import "server-only";

import { unstable_cache } from "next/cache";
import { sql } from "drizzle-orm";
import { getDb, rowsOf } from "@/lib/db/client";

/**
 * Sprint INVESTOR-CABINET — Investor portal read aggregates.
 *
 * All queries investor-scoped via investorId. Cross-org leakage
 * impossible because the investor row itself is org-scoped, and
 * every join hops through capital_commitments which carries the
 * same organization_id.
 *
 * Distribution per-investor share is computed at read time as
 * (commitment.committed_amount_usd_minor / project total committed)
 * × distribution.total_amount_usd_minor — distribution_allocations
 * is not seeded.
 *
 * SHAPE-BUG-SWEEP-1 (fix #1): all `db.execute()` reads unpack via
 * `rowsOf<T>()` (postgres-js returns a tagged Array, not `{ rows }`).
 * Query SQL and row→DTO mapping are unchanged; only the result
 * accessor was converted.
 */

export interface InvestorDashboardKpis {
  totalCommittedUsdMinor: bigint;
  totalDrawnUsdMinor: bigint;
  totalDistributedUsdMinor: bigint;
  currentNavExposureUsdMinor: bigint;
  projectsCount: number;
  averageProfitSharePct: number;
}

export async function getInvestorDashboard(
  investorId: string,
): Promise<InvestorDashboardKpis> {
  const db = getDb();
  if (!db) {
    return {
      totalCommittedUsdMinor: 0n,
      totalDrawnUsdMinor: 0n,
      totalDistributedUsdMinor: 0n,
      currentNavExposureUsdMinor: 0n,
      projectsCount: 0,
      averageProfitSharePct: 0,
    };
  }
  // PERF (Phase 4): investorId is already resolved from the session by the
  // page (OUTSIDE this fn), so it's the correct per-investor cache key-part —
  // the cache callback never touches cookies. Only the raw `::text` row is
  // cached (every money column is cast to ::text → no bigint); all
  // BigInt()/Number() conversions run live below, outside the cache.
  const r = await unstable_cache(
    async () => {
      const cdb = getDb();
      if (!cdb) return null;
      const row = await cdb.execute<{
        total_committed: string;
        total_drawn: string;
        total_distributed: string;
        current_nav: string;
        projects_count: string;
        avg_profit_share: string;
      }>(sql`
    WITH my_commitments AS (
      SELECT c.id, c.project_id, c.committed_amount_usd_minor,
             c.profit_share_percent
        FROM capital_commitments c
       WHERE c.investor_id = ${investorId}::uuid
         AND c.status = 'active'
    ),
    project_totals AS (
      SELECT project_id,
             SUM(committed_amount_usd_minor) AS project_total
        FROM capital_commitments
       WHERE status = 'active' AND project_id IS NOT NULL
       GROUP BY project_id
    ),
    latest_nav AS (
      SELECT DISTINCT ON (project_id) project_id, nav_total_minor
        FROM investor_nav_snapshots
       ORDER BY project_id, quarter_end_date DESC
    ),
    my_distributions AS (
      SELECT (d.total_amount_usd_minor * mc.committed_amount_usd_minor / pt.project_total) AS share
        FROM distributions d
        JOIN my_commitments mc ON mc.project_id = d.project_id
        JOIN project_totals pt ON pt.project_id = d.project_id
       WHERE d.status = 'completed'
    )
    SELECT
      COALESCE((SELECT SUM(committed_amount_usd_minor)::text FROM my_commitments), '0') AS total_committed,
      COALESCE((SELECT SUM(dr.amount_usd_minor)::text
         FROM capital_drawdowns dr
        WHERE dr.commitment_id IN (SELECT id FROM my_commitments)
          AND dr.status = 'received'), '0') AS total_drawn,
      COALESCE((SELECT SUM(share)::text FROM my_distributions), '0') AS total_distributed,
      COALESCE((SELECT SUM(ln.nav_total_minor * mc.committed_amount_usd_minor / pt.project_total)::text
         FROM latest_nav ln
         JOIN my_commitments mc ON mc.project_id = ln.project_id
         JOIN project_totals pt ON pt.project_id = ln.project_id), '0') AS current_nav,
      COALESCE((SELECT COUNT(DISTINCT project_id)::text FROM my_commitments), '0') AS projects_count,
      COALESCE((SELECT AVG(profit_share_percent)::text FROM my_commitments), '0') AS avg_profit_share
  `);
      return (
        rowsOf<{
          total_committed: string;
          total_drawn: string;
          total_distributed: string;
          current_nav: string;
          projects_count: string;
          avg_profit_share: string;
        }>(row)[0] ?? null
      );
    },
    ["investor", "dashboard-kpis", investorId],
    { revalidate: 300 },
  )();
  return {
    totalCommittedUsdMinor: BigInt(r?.total_committed ?? "0"),
    totalDrawnUsdMinor: BigInt(r?.total_drawn ?? "0"),
    totalDistributedUsdMinor: BigInt(Math.round(Number(r?.total_distributed ?? "0"))),
    currentNavExposureUsdMinor: BigInt(Math.round(Number(r?.current_nav ?? "0"))),
    projectsCount: Number(r?.projects_count ?? "0"),
    averageProfitSharePct: Math.round(Number(r?.avg_profit_share ?? "0") * 100) / 100,
  };
}

export interface CapitalLedgerEvent {
  id: string;
  eventType: "commitment" | "drawdown" | "distribution";
  date: string;
  amountUsdMinor: bigint;
  projectName: string | null;
  narrative: string;
}

export async function getCapitalLedger(
  investorId: string,
  limit = 30,
): Promise<CapitalLedgerEvent[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db.execute<{
    id: string;
    event_type: string;
    event_date: string;
    amount_usd: string;
    project_name: string | null;
    narrative: string;
  }>(sql`
    SELECT id, event_type, event_date, amount_usd, project_name, narrative
    FROM (
      SELECT c.id::text                              AS id,
             'commitment'                             AS event_type,
             COALESCE(c.signed_at::text, c.created_at::text) AS event_date,
             c.committed_amount_usd_minor::text       AS amount_usd,
             p.name                                   AS project_name,
             ('Commitment · ' || c.commitment_code)   AS narrative
        FROM capital_commitments c
        LEFT JOIN projects p ON p.id = c.project_id
       WHERE c.investor_id = ${investorId}::uuid

      UNION ALL

      SELECT dr.id::text                             AS id,
             'drawdown'                               AS event_type,
             COALESCE(dr.received_at::text, dr.requested_at::text) AS event_date,
             dr.amount_usd_minor::text                AS amount_usd,
             p.name                                   AS project_name,
             ('Drawdown #' || dr.drawdown_number || ' · ' || dr.trigger_reason) AS narrative
        FROM capital_drawdowns dr
        JOIN capital_commitments c ON c.id = dr.commitment_id
        LEFT JOIN projects p ON p.id = c.project_id
       WHERE c.investor_id = ${investorId}::uuid
         AND dr.status = 'received'

      UNION ALL

      SELECT d.id::text                              AS id,
             'distribution'                           AS event_type,
             COALESCE(d.completed_at::text, d.effective_date::text) AS event_date,
             (d.total_amount_usd_minor * c.committed_amount_usd_minor /
              (SELECT SUM(committed_amount_usd_minor) FROM capital_commitments
                WHERE project_id = d.project_id AND status = 'active'))::text AS amount_usd,
             p.name                                   AS project_name,
             ('Distribution · ' || d.distribution_type) AS narrative
        FROM distributions d
        JOIN capital_commitments c ON c.project_id = d.project_id AND c.investor_id = ${investorId}::uuid
        LEFT JOIN projects p ON p.id = d.project_id
       WHERE d.status = 'completed'
    ) ledger
    ORDER BY event_date DESC NULLS LAST
    LIMIT ${limit}
  `);
  return rowsOf<{
    id: string;
    event_type: string;
    event_date: string;
    amount_usd: string;
    project_name: string | null;
    narrative: string;
  }>(rows).map((r) => ({
    id: r.id,
    eventType: r.event_type as CapitalLedgerEvent["eventType"],
    date: r.event_date?.slice(0, 10) ?? "",
    amountUsdMinor: BigInt(Math.round(Number(r.amount_usd || 0))),
    projectName: r.project_name?.replace(/^\[DEMO\] /, "") ?? null,
    narrative: r.narrative,
  }));
}

export interface InvestorProjectInterest {
  projectId: string;
  projectName: string;
  fundClass: string;
  committedUsdMinor: bigint;
  drawnUsdMinor: bigint;
  profitSharePct: number;
  ownershipPct: number;
  currentNavShareUsdMinor: bigint;
}

export async function getYourInterest(
  investorId: string,
): Promise<InvestorProjectInterest[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db.execute<{
    project_id: string;
    project_name: string;
    fund_class: string;
    committed_usd: string;
    drawn_usd: string;
    profit_share_pct: string;
    project_total_committed: string;
    latest_nav: string | null;
  }>(sql`
    SELECT c.project_id::text                         AS project_id,
           p.name                                      AS project_name,
           CASE WHEN c.profit_share_percent >= 12 THEN 'mezzanine'
                WHEN c.profit_share_percent >= 8  THEN 'preferred'
                WHEN c.profit_share_percent >= 5  THEN 'common'
                ELSE 'debt' END                         AS fund_class,
           c.committed_amount_usd_minor::text          AS committed_usd,
           COALESCE((SELECT SUM(amount_usd_minor)::text FROM capital_drawdowns
                      WHERE commitment_id = c.id AND status = 'received'), '0') AS drawn_usd,
           c.profit_share_percent::text                AS profit_share_pct,
           COALESCE((SELECT SUM(committed_amount_usd_minor)::text
                       FROM capital_commitments
                      WHERE project_id = c.project_id AND status = 'active'), '0') AS project_total_committed,
           (SELECT nav_total_minor::text FROM investor_nav_snapshots
             WHERE project_id = c.project_id
             ORDER BY quarter_end_date DESC LIMIT 1) AS latest_nav
      FROM capital_commitments c
      LEFT JOIN projects p ON p.id = c.project_id
     WHERE c.investor_id = ${investorId}::uuid
       AND c.status = 'active'
     ORDER BY p.name ASC
  `);
  return rowsOf<{
    project_id: string;
    project_name: string;
    fund_class: string;
    committed_usd: string;
    drawn_usd: string;
    profit_share_pct: string;
    project_total_committed: string;
    latest_nav: string | null;
  }>(rows).map((r) => {
    const committed = BigInt(r.committed_usd);
    const projTotal = Number(r.project_total_committed || "1");
    const ownershipPct = projTotal > 0 ? (Number(committed) / projTotal) * 100 : 0;
    const nav = r.latest_nav ? Number(r.latest_nav) : 0;
    const navShare = projTotal > 0 ? Math.round(nav * (Number(committed) / projTotal)) : 0;
    return {
      projectId: r.project_id,
      projectName: r.project_name?.replace(/^\[DEMO\] /, "") ?? "Project",
      fundClass: r.fund_class,
      committedUsdMinor: committed,
      drawnUsdMinor: BigInt(r.drawn_usd),
      profitSharePct: Math.round(Number(r.profit_share_pct) * 100) / 100,
      ownershipPct: Math.round(ownershipPct * 10) / 10,
      currentNavShareUsdMinor: BigInt(navShare),
    };
  });
}

export interface NavSeriesPoint {
  quarterEndDate: string;
  quarterLabel: string;
  totalNavUsdMinor: bigint;
}

export async function getNavSeries(investorId: string): Promise<NavSeriesPoint[]> {
  const db = getDb();
  if (!db) return [];
  // Sum each quarter's NAV across projects, weighted by the investor's
  // commitment share in that project.
  const rows = await db.execute<{ quarter_end: string; nav_share: string }>(sql`
    WITH my_commitments AS (
      SELECT project_id, committed_amount_usd_minor
        FROM capital_commitments
       WHERE investor_id = ${investorId}::uuid AND status = 'active'
    ),
    project_totals AS (
      SELECT project_id, SUM(committed_amount_usd_minor) AS project_total
        FROM capital_commitments WHERE status = 'active' AND project_id IS NOT NULL
       GROUP BY project_id
    )
    SELECT ns.quarter_end_date::text AS quarter_end,
           SUM(ns.nav_total_minor * mc.committed_amount_usd_minor / pt.project_total)::text AS nav_share
      FROM investor_nav_snapshots ns
      JOIN my_commitments mc ON mc.project_id = ns.project_id
      JOIN project_totals pt ON pt.project_id = ns.project_id
     GROUP BY ns.quarter_end_date
     ORDER BY ns.quarter_end_date ASC
  `);
  return rowsOf<{ quarter_end: string; nav_share: string }>(rows).map((r) => {
    const d = new Date(r.quarter_end + "T00:00:00Z");
    const q = Math.ceil((d.getUTCMonth() + 1) / 3);
    const label = `Q${q} '${String(d.getUTCFullYear()).slice(2)}`;
    return {
      quarterEndDate: r.quarter_end,
      quarterLabel: label,
      totalNavUsdMinor: BigInt(Math.round(Number(r.nav_share || 0))),
    };
  });
}

export interface QuarterNarrativeNote {
  projectName: string | null;
  note: string;
}

export interface QuarterNarrative {
  quarterEndDate: string;
  notes: QuarterNarrativeNote[];
}

/**
 * Operator-authored quarter narrative for the brief.
 *
 * Sources the real, per-quarter notes operators write on each project's
 * NAV snapshot (`investor_nav_snapshots.snapshot_notes`) for the LATEST
 * quarter the investor holds a snapshot in. Scoped to the investor's own
 * active commitments — the brief never reads another investor's or
 * another project's notes. Returns null when the latest quarter carries
 * no operator notes (the caller then HIDES the narrative card rather
 * than showing placeholder prose).
 */
export async function getInvestorQuarterNarrative(
  investorId: string,
): Promise<QuarterNarrative | null> {
  const db = getDb();
  if (!db) return null;
  const rows = await db.execute<{
    quarter_end: string;
    project_name: string | null;
    snapshot_notes: string | null;
  }>(sql`
    WITH my_projects AS (
      SELECT DISTINCT project_id
        FROM capital_commitments
       WHERE investor_id = ${investorId}::uuid
         AND status = 'active'
         AND project_id IS NOT NULL
    ),
    latest AS (
      SELECT MAX(ns.quarter_end_date) AS quarter_end
        FROM investor_nav_snapshots ns
        JOIN my_projects mp ON mp.project_id = ns.project_id
    )
    SELECT ns.quarter_end_date::text AS quarter_end,
           p.name AS project_name,
           ns.snapshot_notes AS snapshot_notes
      FROM investor_nav_snapshots ns
      JOIN my_projects mp ON mp.project_id = ns.project_id
      JOIN latest l ON l.quarter_end = ns.quarter_end_date
      LEFT JOIN projects p ON p.id = ns.project_id
     WHERE ns.snapshot_notes IS NOT NULL
       AND length(btrim(ns.snapshot_notes)) > 0
     ORDER BY p.name ASC
  `);
  const all = rowsOf<{
    quarter_end: string;
    project_name: string | null;
    snapshot_notes: string | null;
  }>(rows);
  if (all.length === 0) return null;
  return {
    quarterEndDate: all[0].quarter_end,
    notes: all.map((r) => ({
      projectName: r.project_name,
      note: (r.snapshot_notes ?? "").trim(),
    })),
  };
}

export interface DistributionRecord {
  distributionId: string;
  projectName: string | null;
  distributionType: string;
  effectiveDate: string;
  shareUsdMinor: bigint;
  status: string;
}

export async function getInvestorDistributions(
  investorId: string,
): Promise<DistributionRecord[]> {
  const db = getDb();
  if (!db) return [];
  // INVESTOR-2: prefer the audit-locked share from distribution_allocations
  // when available; fall back to the on-the-fly computation for distributions
  // that pre-date the INVESTOR-2 ledger backfill.
  const rows = await db.execute<{
    id: string;
    project_name: string | null;
    distribution_type: string;
    effective_date: string;
    share_usd: string;
    status: string;
  }>(sql`
    SELECT d.id::text                              AS id,
           p.name                                   AS project_name,
           d.distribution_type                     AS distribution_type,
           d.effective_date::text                  AS effective_date,
           COALESCE(
             a.total_amount_usd_minor::text,
             (d.total_amount_usd_minor * c.committed_amount_usd_minor /
              (SELECT SUM(committed_amount_usd_minor) FROM capital_commitments
                WHERE project_id = d.project_id AND status = 'active'))::text
           )                                       AS share_usd,
           d.status                                 AS status
      FROM distributions d
      JOIN capital_commitments c ON c.project_id = d.project_id
       AND c.investor_id = ${investorId}::uuid
       AND c.status = 'active'
      LEFT JOIN projects p ON p.id = d.project_id
      LEFT JOIN distribution_allocations a
             ON a.distribution_id = d.id
            AND a.commitment_id = c.id
     ORDER BY d.effective_date DESC
  `);
  return rowsOf<{
    id: string;
    project_name: string | null;
    distribution_type: string;
    effective_date: string;
    share_usd: string;
    status: string;
  }>(rows).map((r) => ({
    distributionId: r.id,
    projectName: r.project_name?.replace(/^\[DEMO\] /, "") ?? null,
    distributionType: r.distribution_type,
    effectiveDate: r.effective_date,
    shareUsdMinor: BigInt(Math.round(Number(r.share_usd || 0))),
    status: r.status,
  }));
}

export interface InvestorConstructionRow {
  projectId: string;
  projectName: string;
  workPackagesCount: number;
  siteReportsCount: number;
  qaInspectionsCount: number;
  latestReportDate: string | null;
}

export async function getConstructionProgress(
  investorId: string,
): Promise<InvestorConstructionRow[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db.execute<{
    project_id: string;
    project_name: string;
    wp_count: string;
    report_count: string;
    qa_count: string;
    latest_report: string | null;
  }>(sql`
    SELECT p.id::text                AS project_id,
           p.name                     AS project_name,
           (SELECT COUNT(*)::text FROM work_packages WHERE project_id = p.id) AS wp_count,
           (SELECT COUNT(*)::text FROM site_reports WHERE project_id = p.id) AS report_count,
           (SELECT COUNT(*)::text FROM qa_qc_issues WHERE project_id = p.id) AS qa_count,
           (SELECT MAX(report_date)::text FROM site_reports WHERE project_id = p.id) AS latest_report
      FROM projects p
     WHERE p.id IN (
       SELECT DISTINCT project_id FROM capital_commitments
        WHERE investor_id = ${investorId}::uuid AND status = 'active'
          AND project_id IS NOT NULL
     )
     ORDER BY p.name
  `);
  return rowsOf<{
    project_id: string;
    project_name: string;
    wp_count: string;
    report_count: string;
    qa_count: string;
    latest_report: string | null;
  }>(rows).map((r) => ({
    projectId: r.project_id,
    projectName: r.project_name?.replace(/^\[DEMO\] /, "") ?? "Project",
    workPackagesCount: Number(r.wp_count || 0),
    siteReportsCount: Number(r.report_count || 0),
    qaInspectionsCount: Number(r.qa_count || 0),
    latestReportDate: r.latest_report,
  }));
}

// =============================================================================
// STORAGE-1-WIRE — investor-facing documents reader.
// Pulls documents with visibility ∈ {'investor_visible','public'} scoped to
// project entities the investor has committed capital to.
// =============================================================================

export interface InvestorDocumentRow {
  id: string;
  title: string;
  documentType: string;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string;
  visibility: string;
}

export async function listMyInvestorDocuments(
  investorId: string,
): Promise<InvestorDocumentRow[]> {
  const db = getDb();
  if (!db) return [];
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
    SELECT d.id::text                    AS id,
           d.title                        AS title,
           d.document_type                AS document_type,
           d.file_name                    AS file_name,
           d.mime_type                    AS mime_type,
           d.size_bytes                   AS size_bytes,
           d.created_at::text             AS created_at,
           d.visibility                   AS visibility
      FROM documents d
     WHERE d.status = 'active'
       AND d.visibility IN ('investor_visible','public')
       AND d.entity_type = 'project'
       AND d.entity_id IN (
         SELECT DISTINCT project_id FROM capital_commitments
          WHERE investor_id = ${investorId}::uuid
            AND status = 'active'
            AND project_id IS NOT NULL
       )
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
