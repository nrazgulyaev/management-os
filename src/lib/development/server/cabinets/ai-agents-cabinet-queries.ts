import "server-only";

import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";

/**
 * Sprint TASK-7-DATA-PART-2 — Dev OS AI Agents cabinet queries.
 *
 * Reads:
 *   - getDevAgentConfigs() → org_ai_agent_config rows for this tenant
 *     joined against the canonical agent_key set, so disabled-by-
 *     default agents still surface as "Not configured" cards.
 *   - getRecentAgentOutputs() → agent_outputs cross-agent inbox
 *     (global table, gated by agent_key set).
 *
 * Both org-scoped where applicable via requireOrgId() (TENANT-1).
 */

/** Canonical dev-side agent keys ordered for display. */
const DEV_AGENT_KEYS = [
  "qs_cost_analyst",
  "procurement_analyst",
  "daily_digest",
  "weekly_plan",
  "tax_assistant",
  "marketing_assistant",
  "executive_business",
  "inbox",
  "memory",
] as const;

export type DevAgentKey = (typeof DEV_AGENT_KEYS)[number];

export const AGENT_DISPLAY_NAME: Record<DevAgentKey, string> = {
  qs_cost_analyst: "QS Cost Analyst",
  procurement_analyst: "Procurement Analyst",
  daily_digest: "Daily Construction Digest",
  weekly_plan: "Weekly Plan Generator",
  tax_assistant: "Tax Assistant",
  marketing_assistant: "Marketing Assistant",
  executive_business: "Executive Business",
  inbox: "Inbox Agent",
  memory: "Project Memory",
};

export const AGENT_DESCRIPTION: Record<DevAgentKey, string> = {
  qs_cost_analyst:
    "Catches unit-cost outliers before they ship to PO. Reads against historical baselines + flags drift.",
  procurement_analyst:
    "Compares quotations side-by-side, picks the right vendor, flags price drifts.",
  daily_digest:
    "Yesterday's exceptions, today's plan. Filed at 06:00 to your PM inbox.",
  weekly_plan:
    "Forward-looking week plan with resource calls, risk callouts, schedule pivots.",
  tax_assistant:
    "Auto-categorises every transaction, splits VAT, drafts journal entries.",
  marketing_assistant:
    "Per-villa launch copy, channel briefs, agent decks — tuned weekly.",
  executive_business:
    "Board-ready snapshot. Multi-project. Owner-stay forecast included.",
  inbox: "Aggregates agent suggestions into one human-review queue.",
  memory: "Shared semantic memory. Every fact written once, recalled by everyone.",
};

export interface DevAgentConfigRow {
  agentKey: DevAgentKey;
  displayName: string;
  description: string;
  isEnabled: boolean;
  provider: string | null;
  model: string | null;
  hasKey: boolean;
  lastTestStatus: string | null;
  /** True when no `org_ai_agent_config` row exists for this org+agent
   *  combo. Cabinet renders these as "Not configured" instead of "Live". */
  notConfigured: boolean;
}

export async function getDevAgentConfigs(): Promise<DevAgentConfigRow[]> {
  const db = getDb();
  if (!db) {
    return DEV_AGENT_KEYS.map((k) => ({
      agentKey: k,
      displayName: AGENT_DISPLAY_NAME[k],
      description: AGENT_DESCRIPTION[k],
      isEnabled: false,
      provider: null,
      model: null,
      hasKey: false,
      lastTestStatus: null,
      notConfigured: true,
    }));
  }
  const orgId = await requireOrgId();
  const rows = await db.execute<{
    agent_key: string;
    is_enabled: boolean;
    provider: string | null;
    model: string | null;
    api_key_set_at: string | null;
    last_test_status: string | null;
  }>(sql`
    SELECT agent_key, is_enabled, provider, model,
           api_key_set_at::text AS api_key_set_at,
           last_test_status
      FROM org_ai_agent_config
     WHERE organization_id = ${orgId}
  `);
  const byKey = new Map<
    string,
    {
      isEnabled: boolean;
      provider: string | null;
      model: string | null;
      hasKey: boolean;
      lastTestStatus: string | null;
    }
  >();
  for (const r of (rows as unknown as { rows: Array<{
    agent_key: string;
    is_enabled: boolean;
    provider: string | null;
    model: string | null;
    api_key_set_at: string | null;
    last_test_status: string | null;
  }> }).rows ?? []) {
    byKey.set(r.agent_key, {
      isEnabled: r.is_enabled,
      provider: r.provider,
      model: r.model,
      hasKey: r.api_key_set_at !== null,
      lastTestStatus: r.last_test_status,
    });
  }
  return DEV_AGENT_KEYS.map((k) => {
    const cfg = byKey.get(k);
    return {
      agentKey: k,
      displayName: AGENT_DISPLAY_NAME[k],
      description: AGENT_DESCRIPTION[k],
      isEnabled: cfg?.isEnabled ?? false,
      provider: cfg?.provider ?? null,
      model: cfg?.model ?? null,
      hasKey: cfg?.hasKey ?? false,
      lastTestStatus: cfg?.lastTestStatus ?? null,
      notConfigured: !cfg,
    };
  });
}

export interface AgentInboxRow {
  outputCode: string;
  agentKey: string;
  title: string;
  summary: string;
  status: string;
  createdAt: string;
}

export async function getRecentAgentOutputs(limit = 8): Promise<AgentInboxRow[]> {
  const db = getDb();
  if (!db) return [];
  // agent_outputs is the cross-agent inbox source. Gate by the dev-
  // side agent_key set so guest-concierge etc. don't leak through.
  const rows = await db.execute<{
    output_code: string;
    agent_key: string;
    title: string;
    summary: string;
    status: string;
    created_at: string;
  }>(sql`
    SELECT output_code, agent_key, title, summary, status, created_at::text
      FROM agent_outputs
     WHERE agent_key IN (
       'qs_cost_analyst','procurement_analyst','daily_digest','weekly_plan',
       'tax_assistant','marketing_assistant','executive_business','inbox','memory'
     )
     ORDER BY created_at DESC
     LIMIT ${limit}
  `);
  return (
    (rows as unknown as { rows: Array<{
      output_code: string;
      agent_key: string;
      title: string;
      summary: string;
      status: string;
      created_at: string;
    }> }).rows ?? []
  ).map((r) => ({
    outputCode: r.output_code,
    agentKey: r.agent_key,
    title: r.title,
    summary: r.summary,
    status: r.status,
    createdAt: r.created_at,
  }));
}
