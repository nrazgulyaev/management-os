import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { agentOutputs } from "@/lib/db/schema/ai-agents";
import { requireOrgId } from "@/features/auth/require-org";

/**
 * Sprint MD-5 Phase 4 — Front Office Co-pilot output loader.
 *
 * Returns the N most-recent `agent_outputs` rows for the
 * `front_office_copilot` agent. Used by the Front Office cabinet
 * apex's inline 3-card grid (or the empty-state CTA when no runs
 * have happened yet).
 */

const AGENT_KEY = "front_office_copilot" as const;

export interface FrontOfficeCopilotOutput {
  id: string;
  outputCode: string;
  title: string;
  summary: string;
  status: string;
  createdAt: string;
  recommendedActions: string[];
}

export async function loadFrontOfficeCopilotOutputs(
  options: { limit?: number } = {},
): Promise<FrontOfficeCopilotOutput[]> {
  const db = getDb();
  if (!db) return [];
  const limit = options.limit ?? 3;
  // TENANT: agent_outputs is BYPASSRLS-shared; scope to the caller's org.
  // Strict eq(org) mirrors the canonical sibling output-review-actions.ts.
  const organizationId = await requireOrgId();

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
    .where(
      and(
        eq(agentOutputs.agentKey, AGENT_KEY),
        eq(agentOutputs.organizationId, organizationId),
      ),
    )
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
