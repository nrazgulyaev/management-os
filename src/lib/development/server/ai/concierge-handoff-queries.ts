import "server-only";

import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { agentOutputs } from "@/lib/db/schema/ai-agents";

/**
 * Sprint MD-5 Phase 6 — Concierge Handoff output loader.
 * Returns the N most-recent `concierge_handoff` outputs.
 */

const AGENT_KEY = "concierge_handoff" as const;

export interface ConciergeHandoffOutput {
  id: string;
  outputCode: string;
  title: string;
  summary: string;
  status: string;
  createdAt: string;
  recommendedActions: string[];
}

export async function loadConciergeHandoffOutputs(
  options: { limit?: number } = {},
): Promise<ConciergeHandoffOutput[]> {
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
