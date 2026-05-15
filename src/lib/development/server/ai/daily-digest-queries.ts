import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { agentOutputs } from "@/lib/db/schema/ai-agents";
import { projects as projectsTable } from "@/lib/db/schema/projects";

/**
 * Sprint MD-3.A — Daily-digest output loader for the inline 3-card
 * grid on the Site Supervisor cabinet apex.
 *
 * Mirrors the Sprint-4.5 CFO tax-assistant recipe: read the N
 * most-recent `agent_outputs` for the daily-construction-digest
 * agent, scoped to either a single project (when `projectId` is
 * supplied) or the whole org (when omitted — the Site Supervisor
 * apex is org-wide today).
 *
 * The agent_key value drifted across migrations (`daily_digest` in
 * the older seed, `daily_construction_digest` in the Mega-Sprint PM
 * cabinet refactor). Both are queried so the grid populates
 * regardless of which key the operator's org seeded with.
 */

const DAILY_DIGEST_AGENT_KEYS = [
  "daily_construction_digest",
  "daily_digest",
] as const;

export interface DailyDigestOutput {
  id: string;
  outputCode: string;
  agentKey: string;
  projectId: string | null;
  projectName: string | null;
  title: string;
  summary: string;
  status: string;
  createdAt: string;
  /** Up to 3 exception bullets extracted from `recommended_actions`. */
  latestExceptions: string[];
}

export async function loadDailyDigestOutputs(
  options: { projectId?: string; limit?: number } = {},
): Promise<DailyDigestOutput[]> {
  const db = getDb();
  if (!db) return [];
  const limit = options.limit ?? 3;

  const agentKeyFilter = inArray(agentOutputs.agentKey, [
    ...DAILY_DIGEST_AGENT_KEYS,
  ]);
  const where = options.projectId
    ? and(eq(agentOutputs.projectId, options.projectId), agentKeyFilter)
    : agentKeyFilter;

  const rows = await db
    .select({
      id: agentOutputs.id,
      outputCode: agentOutputs.outputCode,
      agentKey: agentOutputs.agentKey,
      projectId: agentOutputs.projectId,
      title: agentOutputs.title,
      summary: agentOutputs.summary,
      recommendedActions: agentOutputs.recommendedActions,
      status: agentOutputs.status,
      createdAt: agentOutputs.createdAt,
      projectName: projectsTable.name,
    })
    .from(agentOutputs)
    .leftJoin(projectsTable, eq(projectsTable.id, agentOutputs.projectId))
    .where(where)
    .orderBy(desc(agentOutputs.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    outputCode: r.outputCode,
    agentKey: r.agentKey,
    projectId: r.projectId,
    projectName: r.projectName,
    title: r.title,
    summary: r.summary,
    status: r.status,
    createdAt:
      r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    latestExceptions: (r.recommendedActions ?? []).slice(0, 3),
  }));
}
