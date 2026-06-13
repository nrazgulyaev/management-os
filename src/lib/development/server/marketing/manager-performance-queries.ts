import "server-only";

import { sql } from "drizzle-orm";
import { getDb, rowsOf } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";

/**
 * dev-marketing gap close — per-rep performance scoreboard for
 * `/development-os/marketing/performance` (mock variant C). Additive
 * helpers over the existing `manager_performance_metrics` snapshots
 * (written by the Mon 04:00 weekly cron + the manual recompute action).
 *
 *   - loadRepScoreboard:    one row per rep, snapshots aggregated WITHOUT
 *     double counting — snapshots are grouped per (manager, period_type)
 *     in SQL, then the most granular period type with data is chosen per
 *     rep in TS (weekly > monthly > quarterly).
 *   - loadRepSnapshots:     raw period snapshots (optionally one rep),
 *     joined to app_users for the display name.
 *
 * Both are org-scoped via requireOrgId() (manager_performance_metrics
 * carries organization_id since migration 0072) and fail soft ([]).
 * No revenue column exists on these snapshots, so the scoreboard
 * deliberately surfaces conversion counts/rates instead of revenue.
 */

const PERIOD_TYPE_PRIORITY = ["weekly", "monthly", "quarterly"] as const;

export interface RepScoreboardRow {
  managerId: string;
  managerName: string;
  /** Period type the aggregation ran over (most granular with data). */
  periodType: string;
  snapshotCount: number;
  firstPeriodStart: string | null;
  lastPeriodEnd: string | null;
  leadsAssigned: number;
  conversationsActive: number;
  messagesSent: number;
  callsMade: number;
  reservations: number;
  contracts: number;
  leadsLost: number;
  /** reservations / leadsAssigned, 0..100, null when no leads. */
  winRatePct: number | null;
  avgResponseMinutes: number | null;
  avgQualityScore: number | null;
}

type RawScoreboardRow = {
  manager_id: string;
  full_name: string | null;
  period_type: string;
  snapshot_count: string;
  first_period_start: string | null;
  last_period_end: string | null;
  leads_assigned: string;
  conversations_active: string;
  messages_sent: string;
  calls_made: string;
  reservations: string;
  contracts: string;
  leads_lost: string;
  avg_response_minutes: string | null;
  avg_quality: string | null;
};

export async function loadRepScoreboard(): Promise<RepScoreboardRow[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();

  const result = await db.execute<RawScoreboardRow>(sql`
    SELECT
      m.manager_id,
      u.full_name,
      m.period_type,
      COUNT(*)::text                                   AS snapshot_count,
      MIN(m.period_start)::text                        AS first_period_start,
      MAX(m.period_end)::text                          AS last_period_end,
      COALESCE(SUM(m.total_leads_assigned), 0)::text   AS leads_assigned,
      COALESCE(SUM(m.total_conversations_active), 0)::text AS conversations_active,
      COALESCE(SUM(m.total_messages_sent), 0)::text    AS messages_sent,
      COALESCE(SUM(m.total_calls_made), 0)::text       AS calls_made,
      COALESCE(SUM(m.reservations_secured), 0)::text   AS reservations,
      COALESCE(SUM(m.contracts_signed), 0)::text       AS contracts,
      COALESCE(SUM(m.leads_lost), 0)::text             AS leads_lost,
      AVG(m.average_response_time_minutes)::text       AS avg_response_minutes,
      AVG(m.ai_quality_score)::text                    AS avg_quality
    FROM manager_performance_metrics m
    LEFT JOIN app_users u ON u.id = m.manager_id
    WHERE m.organization_id = ${organizationId}
    GROUP BY m.manager_id, u.full_name, m.period_type
  `);
  const raw = rowsOf<RawScoreboardRow>(result);

  // Pick ONE period type per rep (most granular with data) so weekly and
  // monthly snapshots of the same activity are never summed together.
  const byManager = new Map<string, RawScoreboardRow>();
  const rank = (t: string) => {
    const i = PERIOD_TYPE_PRIORITY.indexOf(
      t as (typeof PERIOD_TYPE_PRIORITY)[number],
    );
    return i === -1 ? PERIOD_TYPE_PRIORITY.length : i;
  };
  for (const r of raw) {
    const prev = byManager.get(r.manager_id);
    if (!prev || rank(r.period_type) < rank(prev.period_type)) {
      byManager.set(r.manager_id, r);
    }
  }

  return [...byManager.values()]
    .map((r) => {
      const leadsAssigned = Number(r.leads_assigned ?? "0");
      const reservations = Number(r.reservations ?? "0");
      return {
        managerId: r.manager_id,
        managerName: r.full_name ?? `${r.manager_id.slice(0, 8)}…`,
        periodType: r.period_type,
        snapshotCount: Number(r.snapshot_count ?? "0"),
        firstPeriodStart: r.first_period_start,
        lastPeriodEnd: r.last_period_end,
        leadsAssigned,
        conversationsActive: Number(r.conversations_active ?? "0"),
        messagesSent: Number(r.messages_sent ?? "0"),
        callsMade: Number(r.calls_made ?? "0"),
        reservations,
        contracts: Number(r.contracts ?? "0"),
        leadsLost: Number(r.leads_lost ?? "0"),
        winRatePct:
          leadsAssigned > 0
            ? Math.round((reservations / leadsAssigned) * 1000) / 10
            : null,
        avgResponseMinutes:
          r.avg_response_minutes != null
            ? Math.round(Number(r.avg_response_minutes) * 10) / 10
            : null,
        avgQualityScore:
          r.avg_quality != null
            ? Math.round(Number(r.avg_quality) * 10) / 10
            : null,
      };
    })
    .sort(
      (a, b) =>
        b.leadsAssigned - a.leadsAssigned ||
        a.managerName.localeCompare(b.managerName),
    );
}

export interface RepSnapshotRow {
  id: string;
  managerId: string;
  managerName: string;
  periodStart: string;
  periodEnd: string;
  periodType: string;
  totalLeadsAssigned: number;
  totalConversationsActive: number;
  reservationsSecured: number;
  contractsSigned: number;
  leadsLost: number;
  leadToReservationRate: string | null;
  averageResponseTimeMinutes: string | null;
  aiQualityScore: string | null;
}

type RawSnapshotRow = {
  id: string;
  manager_id: string;
  full_name: string | null;
  period_start: string;
  period_end: string;
  period_type: string;
  total_leads_assigned: number;
  total_conversations_active: number;
  reservations_secured: number;
  contracts_signed: number;
  leads_lost: number;
  lead_to_reservation_rate: string | null;
  average_response_time_minutes: string | null;
  ai_quality_score: string | null;
};

export async function loadRepSnapshots(
  opts: { managerId?: string; limit?: number } = {},
): Promise<RepSnapshotRow[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);

  const result = await db.execute<RawSnapshotRow>(sql`
    SELECT
      m.id,
      m.manager_id,
      u.full_name,
      m.period_start::text                 AS period_start,
      m.period_end::text                   AS period_end,
      m.period_type,
      m.total_leads_assigned,
      m.total_conversations_active,
      m.reservations_secured,
      m.contracts_signed,
      m.leads_lost,
      m.lead_to_reservation_rate::text     AS lead_to_reservation_rate,
      m.average_response_time_minutes::text AS average_response_time_minutes,
      m.ai_quality_score::text             AS ai_quality_score
    FROM manager_performance_metrics m
    LEFT JOIN app_users u ON u.id = m.manager_id
    WHERE m.organization_id = ${organizationId}
      ${opts.managerId ? sql`AND m.manager_id = ${opts.managerId}` : sql``}
    ORDER BY m.period_start DESC, m.period_type ASC
    LIMIT ${limit}
  `);

  return rowsOf<RawSnapshotRow>(result).map((r) => ({
    id: r.id,
    managerId: r.manager_id,
    managerName: r.full_name ?? `${r.manager_id.slice(0, 8)}…`,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    periodType: r.period_type,
    totalLeadsAssigned: Number(r.total_leads_assigned ?? 0),
    totalConversationsActive: Number(r.total_conversations_active ?? 0),
    reservationsSecured: Number(r.reservations_secured ?? 0),
    contractsSigned: Number(r.contracts_signed ?? 0),
    leadsLost: Number(r.leads_lost ?? 0),
    leadToReservationRate: r.lead_to_reservation_rate,
    averageResponseTimeMinutes: r.average_response_time_minutes,
    aiQualityScore: r.ai_quality_score,
  }));
}

/**
 * Lead count attributed to one campaign (leads.campaign_id) — powers the
 * "leads" KPI on the campaign detail page. Same counting rule as
 * loadActiveCampaigns' lead_count subquery.
 */
export async function countLeadsForCampaign(
  campaignId: string,
): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const organizationId = await requireOrgId();
  const result = await db.execute<{ lead_count: string }>(sql`
    SELECT COUNT(*)::text AS lead_count
    FROM leads l
    WHERE l.campaign_id = ${campaignId}
      AND l.organization_id = ${organizationId}
  `);
  const rows = rowsOf<{ lead_count: string }>(result);
  return Number(rows[0]?.lead_count ?? "0");
}
