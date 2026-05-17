import "server-only";

import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
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
}

export async function listAgentsForCabinet(): Promise<AiAgentCard[]> {
  const db = getDb();
  if (!db) {
    return MGMT_AGENT_REGISTRY.map((a) => ({
      ...a,
      isLive: false,
      provider: null,
      model: null,
    }));
  }
  const orgId = await requireOrgId();
  const rows = await db.execute<{
    agent_key: string;
    is_enabled: boolean;
    provider: string | null;
    model: string | null;
  }>(sql`
    SELECT agent_key, is_enabled, provider, model
      FROM org_ai_agent_config
     WHERE organization_id = ${orgId}
  `);
  const byKey = new Map<
    string,
    { isEnabled: boolean; provider: string | null; model: string | null }
  >();
  for (const r of (rows as unknown as { rows: Array<{
    agent_key: string;
    is_enabled: boolean;
    provider: string | null;
    model: string | null;
  }> }).rows ?? []) {
    byKey.set(r.agent_key, { isEnabled: r.is_enabled, provider: r.provider, model: r.model });
  }
  return MGMT_AGENT_REGISTRY.map((a) => {
    const cfg = byKey.get(a.agentKey);
    return {
      ...a,
      isLive: cfg?.isEnabled ?? false,
      provider: cfg?.provider ?? null,
      model: cfg?.model ?? null,
    };
  });
}

export interface AiHubKpis {
  agentsLive: number;
  agentsTotal: number;
  runs30d: number;
  avgLatencyMs: number | null;
  tokenSpendMtdUsdMinor: bigint;
  refusals30d: number;
}

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
    avg_latency: string;
    token_spend_mtd: string;
    refusals_30d: string;
  }>(sql`
    SELECT
      (SELECT COUNT(*)::text FROM org_ai_agent_config
        WHERE organization_id = ${orgId} AND is_enabled = TRUE) AS agents_live,
      COALESCE((SELECT COUNT(*)::text FROM agent_invocation_log
        WHERE organization_id = ${orgId}
          AND invoked_at >= (CURRENT_DATE - INTERVAL '30 days')), '0') AS runs_30d,
      COALESCE((SELECT AVG(duration_ms)::text FROM agent_invocation_log
        WHERE organization_id = ${orgId}
          AND invoked_at >= (CURRENT_DATE - INTERVAL '30 days')
          AND duration_ms IS NOT NULL), NULL) AS avg_latency,
      COALESCE((SELECT SUM(cost_minor)::text FROM agent_invocation_log
        WHERE organization_id = ${orgId}
          AND invoked_at >= date_trunc('month', CURRENT_DATE)::date), '0') AS token_spend_mtd,
      COALESCE((SELECT COUNT(*)::text FROM agent_invocation_log
        WHERE organization_id = ${orgId}
          AND status IN ('refused','blocked')
          AND invoked_at >= (CURRENT_DATE - INTERVAL '30 days')), '0') AS refusals_30d
  `);
  const r = (rows as unknown as { rows: Array<{
    agents_live: string;
    runs_30d: string;
    avg_latency: string | null;
    token_spend_mtd: string;
    refusals_30d: string;
  }> }).rows?.[0];
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
