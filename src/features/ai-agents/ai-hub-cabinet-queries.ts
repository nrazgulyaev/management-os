import "server-only";

import { sql } from "drizzle-orm";
import { getDb, rowsOf } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";

/**
 * Sprint TASK-6-DATA-PART-2 — Mgmt OS AI Hub cabinet reads.
 *
 * `org_ai_agent_config` is seeded by DEMO-1 (5 agents). The
 * `agent_invocation_log` / `agent_outputs` tables exist but are
 * empty until agents actually run — cabinet renders empty states.
 *
 * All reads org-scoped via requireOrgId() (TENANT-1).
 */

/** Canonical Mgmt-side agent set. Overlaid with org_ai_agent_config
 *  rows so disabled-by-default agents still surface as "Planned". */
const MGMT_AGENT_REGISTRY: Array<{
  agentKey: string;
  displayName: string;
  tone: "emerald" | "gold" | "sage" | "stone" | "terracotta" | "ink";
  target: string;
  phase: string;
  description: string;
}> = [
  {
    agentKey: "executive_business",
    displayName: "Investor Assistant",
    tone: "emerald",
    target: "Investor · Owner · Delegate",
    phase: "v3",
    description: "Explains owner statements with line-by-line citations. Never invents a number.",
  },
  {
    agentKey: "tax_assistant",
    displayName: "Finance Analyst",
    tone: "gold",
    target: "Finance Manager · Director · Accountant",
    phase: "v3",
    description: "GOP, NOI, ADR, RevPAR, variance detection and narrative drafting across the portfolio.",
  },
  {
    agentKey: "daily_digest",
    displayName: "Operations Copilot",
    tone: "sage",
    target: "Ops Manager · Property Manager · Housekeeping",
    phase: "v4",
    description: "Today's turnovers, SLA risk, task reassignment, complaint summaries.",
  },
  {
    agentKey: "weekly_plan",
    displayName: "Maintenance Assistant",
    tone: "stone",
    target: "Ops Manager · Technician",
    phase: "v4",
    description: "Draft resolutions, lookup warranty documents, propose purchase requests.",
  },
  {
    agentKey: "marketing_assistant",
    displayName: "Marketing Assistant",
    tone: "terracotta",
    target: "Marketing · Sales",
    phase: "v3",
    description: "Per-villa launch copy, channel briefs, agent decks — tuned weekly.",
  },
  {
    agentKey: "procurement_analyst",
    displayName: "Procurement Assistant",
    tone: "emerald",
    target: "Procurement Manager · Ops",
    phase: "v5",
    description: "Low-stock forecasts, supplier scoring, draft POs — never auto-sent.",
  },
  {
    agentKey: "inbox",
    displayName: "Inbox Aggregator",
    tone: "ink",
    target: "Director · Operator",
    phase: "v4",
    description: "Aggregates agent suggestions into one human-review queue.",
  },
  {
    agentKey: "memory",
    displayName: "Project Memory",
    tone: "sage",
    target: "All agents",
    phase: "v6",
    description: "Shared semantic memory. Every fact written once, recalled by everyone.",
  },
];

export interface AiAgentCard {
  agentKey: string;
  displayName: string;
  tone: string;
  target: string;
  phase: string;
  description: string;
  isLive: boolean;
  provider: string | null;
  model: string | null;
  /** P5.6 — present iff this agent is wired through the new
   *  platform_agent_configs system. UI uses this to link to the
   *  chat surface vs the legacy v3 placeholders. */
  platformAgentId: string | null;
  platformAgentCode: string | null;
}

/**
 * P5.6.1 — joined read across the new platform_agent_configs +
 * org_agent_subscriptions tables (preferred) AND the legacy
 * `org_ai_agent_config` flags (still active for unmigrated agents).
 *
 * Liveness rule for the "N of M live" counter:
 *   · Platform-managed: is_active AND subscription.is_enabled AND
 *     vault_secret_name IS NOT NULL (i.e. has an API key).
 *   · Legacy: org_ai_agent_config.is_enabled = TRUE.
 *
 * Agents present in `platform_agent_configs` win when both sources
 * agree on the agent_code — the new path has a real Vault key + budget
 * gate; the legacy path was just a boolean checkbox.
 */
export async function listAgentsForCabinet(): Promise<AiAgentCard[]> {
  const db = getDb();
  if (!db) {
    return MGMT_AGENT_REGISTRY.map((a) => ({
      ...a,
      isLive: false,
      provider: null,
      model: null,
      platformAgentId: null,
      platformAgentCode: null,
    }));
  }
  const orgId = await requireOrgId();

  // Legacy org_ai_agent_config
  const legacyRows = await db.execute<{
    agent_key: string;
    is_enabled: boolean;
    provider: string | null;
    model: string | null;
  }>(sql`
    SELECT agent_key, is_enabled, provider, model
      FROM org_ai_agent_config
     WHERE organization_id = ${orgId}
  `);
  const legacyByKey = new Map<
    string,
    { isEnabled: boolean; provider: string | null; model: string | null }
  >();
  // SHAPE-FIX-1: rowsOf() handles postgres-js's Array return shape.
  for (const r of rowsOf<{
    agent_key: string;
    is_enabled: boolean;
    provider: string | null;
    model: string | null;
  }>(legacyRows)) {
    legacyByKey.set(r.agent_key, {
      isEnabled: r.is_enabled,
      provider: r.provider,
      model: r.model,
    });
  }

  // New platform_agent_configs + subscription
  const platformRows = await db.execute<{
    id: string;
    agent_code: string;
    display_name: string;
    description: string | null;
    provider: string;
    model: string;
    is_active: boolean;
    has_key: boolean;
    sub_enabled: boolean | null;
  }>(sql`
    SELECT pa.id::text                  AS id,
           pa.agent_code                 AS agent_code,
           pa.display_name               AS display_name,
           pa.description                AS description,
           pa.provider                   AS provider,
           pa.model                      AS model,
           pa.is_active                  AS is_active,
           (pa.vault_secret_name IS NOT NULL) AS has_key,
           oas.is_enabled                AS sub_enabled
      FROM platform_agent_configs pa
      LEFT JOIN org_agent_subscriptions oas
             ON oas.agent_id = pa.id
            AND oas.organization_id = ${orgId}
     WHERE pa.is_active = TRUE
  `);
  const platformByCode = new Map<
    string,
    {
      id: string;
      displayName: string;
      description: string | null;
      provider: string;
      model: string;
      hasKey: boolean;
      subEnabled: boolean;
    }
  >();
  // SHAPE-FIX-1: rowsOf() handles postgres-js's Array return shape.
  for (const r of rowsOf<{
    id: string;
    agent_code: string;
    display_name: string;
    description: string | null;
    provider: string;
    model: string;
    is_active: boolean;
    has_key: boolean;
    sub_enabled: boolean | null;
  }>(platformRows)) {
    platformByCode.set(r.agent_code, {
      id: r.id,
      displayName: r.display_name,
      description: r.description,
      provider: r.provider,
      model: r.model,
      hasKey: r.has_key,
      subEnabled: r.sub_enabled === true,
    });
  }

  // Merge registry rows with platform/legacy overrides.
  const registryCards: AiAgentCard[] = MGMT_AGENT_REGISTRY.map((a) => {
    const platform = platformByCode.get(a.agentKey);
    const legacy = legacyByKey.get(a.agentKey);
    if (platform) {
      return {
        ...a,
        // Prefer the platform-managed displayName so the "tax_assistant"
        // registry slot picks up "Tax Assistant" instead of the older
        // "Finance Analyst" label once seeded.
        displayName: platform.displayName,
        description: platform.description ?? a.description,
        provider: platform.provider,
        model: platform.model,
        isLive: platform.subEnabled && platform.hasKey,
        platformAgentId: platform.id,
        platformAgentCode: a.agentKey,
      };
    }
    return {
      ...a,
      provider: legacy?.provider ?? null,
      model: legacy?.model ?? null,
      isLive: legacy?.isEnabled ?? false,
      platformAgentId: null,
      platformAgentCode: null,
    };
  });

  // Add platform-managed agents that are NOT in the legacy registry
  // (new agents seeded after the registry was frozen).
  const registryCodes = new Set(MGMT_AGENT_REGISTRY.map((a) => a.agentKey));
  const platformOnly: AiAgentCard[] = [];
  for (const [code, p] of platformByCode) {
    if (registryCodes.has(code)) continue;
    platformOnly.push({
      agentKey: code,
      displayName: p.displayName,
      tone: "ink",
      target: "Subscribed organizations",
      phase: "platform",
      description: p.description ?? "",
      provider: p.provider,
      model: p.model,
      isLive: p.subEnabled && p.hasKey,
      platformAgentId: p.id,
      platformAgentCode: code,
    });
  }

  return [...registryCards, ...platformOnly];
}

export interface AiHubKpis {
  agentsLive: number;
  agentsTotal: number;
  runs30d: number;
  avgLatencyMs: number | null;
  tokenSpendMtdUsdMinor: bigint;
  refusals30d: number;
}

/**
 * P5.6.2 — dual-source KPIs covering BOTH the legacy
 * `agent_invocation_log` AND the new `agent_runs` table so the cabinet
 * counts every invocation regardless of which path wrote it. Once all
 * legacy callers migrate, the agent_invocation_log subqueries will be
 * dropped.
 *
 * Liveness counts platform-managed (subscribed + has key) PLUS any
 * legacy org_ai_agent_config rows still flipped on.
 */
export async function getAiHubKpis(): Promise<AiHubKpis> {
  const db = getDb();
  if (!db) {
    return {
      agentsLive: 0,
      agentsTotal: MGMT_AGENT_REGISTRY.length,
      runs30d: 0,
      avgLatencyMs: null,
      tokenSpendMtdUsdMinor: 0n,
      refusals30d: 0,
    };
  }
  const orgId = await requireOrgId();
  const rows = await db.execute<{
    agents_live: string;
    runs_30d: string;
    avg_latency: string | null;
    token_spend_mtd: string;
    refusals_30d: string;
  }>(sql`
    SELECT
      -- live = platform-managed + key + subscribed, plus legacy flagged
      (
        SELECT COUNT(*)::text FROM (
          SELECT pa.id
            FROM platform_agent_configs pa
            JOIN org_agent_subscriptions oas
              ON oas.agent_id = pa.id
             AND oas.organization_id = ${orgId}
           WHERE pa.is_active = TRUE
             AND oas.is_enabled = TRUE
             AND pa.vault_secret_name IS NOT NULL
          UNION
          SELECT o.id
            FROM org_ai_agent_config o
           WHERE o.organization_id = ${orgId}
             AND o.is_enabled = TRUE
             AND o.agent_key NOT IN (
               SELECT agent_code FROM platform_agent_configs WHERE is_active = TRUE
             )
        ) live_union
      ) AS agents_live,

      -- runs (last 30d) — UNION ALL of both tables
      (
        SELECT COUNT(*)::text FROM (
          SELECT 1 FROM agent_runs
           WHERE organization_id = ${orgId}
             AND started_at >= (CURRENT_DATE - INTERVAL '30 days')
          UNION ALL
          SELECT 1 FROM agent_invocation_log
           WHERE organization_id = ${orgId}
             AND invoked_at >= (CURRENT_DATE - INTERVAL '30 days')
        ) all_runs
      ) AS runs_30d,

      -- avg latency — weighted across both tables
      (
        SELECT AVG(ms)::text FROM (
          SELECT latency_ms AS ms FROM agent_runs
           WHERE organization_id = ${orgId}
             AND started_at >= (CURRENT_DATE - INTERVAL '30 days')
             AND latency_ms IS NOT NULL
          UNION ALL
          SELECT duration_ms AS ms FROM agent_invocation_log
           WHERE organization_id = ${orgId}
             AND invoked_at >= (CURRENT_DATE - INTERVAL '30 days')
             AND duration_ms IS NOT NULL
        ) all_lat
      ) AS avg_latency,

      -- MTD cost — sum across both
      (
        SELECT COALESCE(SUM(cents), 0)::text FROM (
          SELECT cost_usd_minor AS cents FROM agent_runs
           WHERE organization_id = ${orgId}
             AND started_at >= date_trunc('month', CURRENT_DATE)::date
          UNION ALL
          SELECT cost_minor AS cents FROM agent_invocation_log
           WHERE organization_id = ${orgId}
             AND invoked_at >= date_trunc('month', CURRENT_DATE)::date
        ) all_cost
      ) AS token_spend_mtd,

      -- refusals 30d
      (
        SELECT COUNT(*)::text FROM (
          SELECT 1 FROM agent_runs
           WHERE organization_id = ${orgId}
             AND status IN ('error','budget_exceeded','rate_limited')
             AND started_at >= (CURRENT_DATE - INTERVAL '30 days')
          UNION ALL
          SELECT 1 FROM agent_invocation_log
           WHERE organization_id = ${orgId}
             AND status IN ('refused','blocked')
             AND invoked_at >= (CURRENT_DATE - INTERVAL '30 days')
        ) all_refusals
      ) AS refusals_30d
  `);
  // SHAPE-FIX-1: rowsOf() handles postgres-js's Array return shape.
  const r = rowsOf<{
    agents_live: string;
    runs_30d: string;
    avg_latency: string | null;
    token_spend_mtd: string;
    refusals_30d: string;
  }>(rows)[0];

  return {
    agentsLive: Number(r?.agents_live ?? "0"),
    agentsTotal: MGMT_AGENT_REGISTRY.length,
    runs30d: Number(r?.runs_30d ?? "0"),
    avgLatencyMs: r?.avg_latency ? Math.round(Number(r.avg_latency)) : null,
    tokenSpendMtdUsdMinor: BigInt(r?.token_spend_mtd ?? "0"),
    refusals30d: Number(r?.refusals_30d ?? "0"),
  };
}

export interface AgentInboxItem {
  id: string;
  agentKey: string;
  subject: string;
  severity: "info" | "warn";
  invokedAt: string;
  status: string;
  isRead: boolean;
}

export async function listAgentInbox(limit = 8): Promise<AgentInboxItem[]> {
  const db = getDb();
  if (!db) return [];
  const orgId = await requireOrgId();
  const rows = await db.execute<{
    id: string;
    agent_key: string;
    subject: string;
    status: string;
    invoked_at: string;
    review_status: string | null;
  }>(sql`
    SELECT id::text                                   AS id,
           agent_key                                   AS agent_key,
           COALESCE(output_summary, agent_key)         AS subject,
           status                                      AS status,
           invoked_at::text                            AS invoked_at,
           operator_review_status                      AS review_status
      FROM agent_invocation_log
     WHERE organization_id = ${orgId}
       AND status IN ('completed','requires_review','refused','blocked')
     ORDER BY invoked_at DESC
     LIMIT ${limit}
  `);
  return (
    (rows as unknown as { rows: Array<{
      id: string;
      agent_key: string;
      subject: string;
      status: string;
      invoked_at: string;
      review_status: string | null;
    }> }).rows ?? []
  ).map((r) => ({
    id: r.id,
    agentKey: r.agent_key,
    subject: r.subject,
    severity: r.status === "refused" || r.status === "blocked" ? "warn" : "info",
    invokedAt: r.invoked_at,
    status: r.status,
    isRead: r.review_status !== null,
  }));
}

export interface AgentRun {
  id: string;
  agentKey: string;
  model: string | null;
  status: string;
  durationMs: number | null;
  costMinor: bigint;
  invokedAt: string;
}

export async function listRecentRuns(limit = 8): Promise<AgentRun[]> {
  const db = getDb();
  if (!db) return [];
  const orgId = await requireOrgId();
  const rows = await db.execute<{
    id: string;
    agent_key: string;
    model: string | null;
    status: string;
    duration_ms: number | null;
    cost_minor: string | null;
    invoked_at: string;
  }>(sql`
    SELECT id::text                  AS id,
           agent_key                  AS agent_key,
           model_used                 AS model,
           status                     AS status,
           duration_ms                AS duration_ms,
           cost_minor::text           AS cost_minor,
           invoked_at::text           AS invoked_at
      FROM agent_invocation_log
     WHERE organization_id = ${orgId}
     ORDER BY invoked_at DESC
     LIMIT ${limit}
  `);
  return (
    (rows as unknown as { rows: Array<{
      id: string;
      agent_key: string;
      model: string | null;
      status: string;
      duration_ms: number | null;
      cost_minor: string | null;
      invoked_at: string;
    }> }).rows ?? []
  ).map((r) => ({
    id: r.id,
    agentKey: r.agent_key,
    model: r.model,
    status: r.status,
    durationMs: r.duration_ms,
    costMinor: BigInt(r.cost_minor ?? "0"),
    invokedAt: r.invoked_at,
  }));
}
