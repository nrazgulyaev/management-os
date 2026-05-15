import "server-only";

import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { agentOutputs } from "@/lib/db/schema/ai-agents";

/**
 * Sprint MD-5 Phase 5 — Housekeeping Scheduler output loader.
 * Returns the N most-recent `housekeeping_scheduler` outputs.
 */

const AGENT_KEY = "housekeeping_scheduler" as const;

export interface HousekeepingSchedulerOutput {
  id: string;
  outputCode: string;
  title: string;
  summary: string;
  status: string;
  createdAt: string;
  recommendedActions: string[];
}

export async function loadHousekeepingSchedulerOutputs(
  options: { limit?: number } = {},
): Promise<HousekeepingSchedulerOutput[]> {
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
