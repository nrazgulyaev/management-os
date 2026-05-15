import "server-only";

import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { agentOutputs } from "@/lib/db/schema/ai-agents";

/**
 * Sprint MD-5 Phase 3.4 — Investor co-pilot output loader.
 *
 * Mirrors loadDailyDigestOutputs shape: returns the N most-recent
 * `agent_outputs` for the `investor_copilot` agent. Scoping by
 * investor is left as a follow-up — the agent_outputs table doesn't
 * carry an investor_id column today; the calling page filters as
 * needed via `scope_entity_id` JSONB if present.
 */

const AGENT_KEY = "investor_copilot" as const;

export interface InvestorCopilotOutput {
  id: string;
  outputCode: string;
  title: string;
  summary: string;
  status: string;
  createdAt: string;
  recommendedActions: string[];
}

export async function loadInvestorCopilotOutputs(
  options: { investorId?: string; limit?: number } = {},
): Promise<InvestorCopilotOutput[]> {
  const db = getDb();
  if (!db) return [];
  const limit = options.limit ?? 3;

  const rows = await db
    .select({
      id: agentOutputs.id,
      outputCode: agentOutputs.outputCode,
      title: agentOutputs.title,
      summary: agentOutputs.summary,
      recommendedActions: agentOutputs.recommendedActions,
      status: agentOutputs.status,
      createdAt: agentOutputs.createdAt,
    })
    .from(agentOutputs)
    .where(eq(agentOutputs.agentKey, AGENT_KEY))
    .orderBy(desc(agentOutputs.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    outputCode: r.outputCode,
    title: r.title,
    summary: r.summary,
    status: r.status,
    createdAt:
      r.createdAt instanceof Date
        ? r.createdAt.toISOString()
        : String(r.createdAt),
    recommendedActions: r.recommendedActions ?? [],
  }));
}
