import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { agentOutputs } from "@/lib/db/schema/ai-agents";
import { requireOrgId } from "@/features/auth/require-org";

/**
 * Sprint MD-5 Phase 7 — Security Co-pilot output loader.
 * Returns the N most-recent `security_copilot` outputs.
 */

const AGENT_KEY = "security_copilot" as const;

export interface SecurityCopilotOutput {
  id: string;
  outputCode: string;
  title: string;
  summary: string;
  status: string;
  createdAt: string;
  recommendedActions: string[];
}

export async function loadSecurityCopilotOutputs(
  options: { limit?: number } = {},
): Promise<SecurityCopilotOutput[]> {
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
