import "server-only";

import { and, desc, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { agentOutputs } from "@/lib/db/schema/ai-agents";

/**
 * Sprint MD-3.B — Marketing-assistant draft loader for the inline
 * 3-card grid on the Sales Manager cabinet apex.
 *
 * Mirrors the Sprint-4.5 CFO tax-assistant recipe: read the N
 * most-recent `agent_outputs` for the `marketing_assistant` agent.
 * The Sales apex currently surfaces drafts org-wide; future RLS by
 * `managerId` can filter via `agent_invocation_log.user_id` once
 * the join is wired (out of scope this sprint).
 *
 * Each row maps to a {channel, draftType, headline, snippet,
 * status} shape consumed by the cabinet apex's 3-card grid:
 *   - draftType is inferred from `output_category` (post / email /
 *     script / caption / followup) — falls back to "draft" when the
 *     agent didn't set one.
 *   - channel is parsed from `detailed_output.channel` JSONB key
 *     when present; falls back to the inferred draftType label.
 */

const MARKETING_AGENT_KEYS = ["marketing_assistant"] as const;

export interface MarketingAssistantDraft {
  id: string;
  outputCode: string;
  draftType: string;
  channel: string;
  headline: string;
  snippet: string;
  status: string;
  createdAt: string;
}

function pickChannel(detailedOutput: unknown): string | null {
  if (typeof detailedOutput !== "object" || detailedOutput === null) {
    return null;
  }
  const obj = detailedOutput as Record<string, unknown>;
  const channel = obj.channel ?? obj.platform ?? obj.medium;
  return typeof channel === "string" ? channel : null;
}

export async function loadMarketingAssistantDrafts(
  options: { managerId?: string; limit?: number } = {},
): Promise<MarketingAssistantDraft[]> {
  const db = getDb();
  if (!db) return [];
  const limit = options.limit ?? 3;

  const agentKeyFilter = inArray(agentOutputs.agentKey, [
    ...MARKETING_AGENT_KEYS,
  ]);
  // managerId filtering is reserved for a future invocation-log join.
  // For now the loader returns org-wide drafts; the apex consumes
  // them as "recent across the team" which matches the Sprint-4.5
  // CFO pattern.
  const where = options.managerId
    ? and(agentKeyFilter)
    : agentKeyFilter;

  const rows = await db
    .select({
      id: agentOutputs.id,
      outputCode: agentOutputs.outputCode,
      title: agentOutputs.title,
      summary: agentOutputs.summary,
      detailedOutput: agentOutputs.detailedOutput,
      outputCategory: agentOutputs.outputCategory,
      status: agentOutputs.status,
      createdAt: agentOutputs.createdAt,
    })
    .from(agentOutputs)
    .where(where)
    .orderBy(desc(agentOutputs.createdAt))
    .limit(limit);

  return rows.map((r) => {
    const draftType = r.outputCategory ?? "draft";
    const channel = pickChannel(r.detailedOutput) ?? draftType;
    return {
      id: r.id,
      outputCode: r.outputCode,
      draftType,
      channel,
      headline: r.title,
      snippet: r.summary,
      status: r.status,
      createdAt:
        r.createdAt instanceof Date
          ? r.createdAt.toISOString()
          : String(r.createdAt),
    };
  });
}
