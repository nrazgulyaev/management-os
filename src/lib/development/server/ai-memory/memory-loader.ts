import "server-only";

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { projectAiMemory } from "@/lib/db/schema/ai-agents";
import {
  rankMemoryByRelevance,
  summarizeMemoryForAgent,
  type MemoryItem,
  type MemoryType,
} from "./memory-helpers";

/**
 * Load + format memory items as a markdown context block ready to be
 * prepended to an agent's prompt. Each of the 12 agents calls this once
 * before its provider invocation.
 *
 * Returns:
 *   - `context`: markdown block (empty if no memories or DB unavailable)
 *   - `idsUsed`: UUIDs of the items included (for invocation log)
 */
export async function loadMemoryContext(args: {
  projectId: string;
  memoryTypes?: MemoryType[];
  limit?: number;
  maxTokens?: number;
}): Promise<{ context: string; idsUsed: string[] }> {
  const db = getDb();
  if (!db) return { context: "", idsUsed: [] };

  const limit = args.limit ?? 20;
  const maxTokens = args.maxTokens ?? 1500;

  const conditions = [
    eq(projectAiMemory.projectId, args.projectId),
    eq(projectAiMemory.isActive, true),
  ];
  if (args.memoryTypes && args.memoryTypes.length > 0) {
    conditions.push(inArray(projectAiMemory.memoryType, args.memoryTypes));
  }

  const rows = await db
    .select()
    .from(projectAiMemory)
    .where(and(...conditions))
    .orderBy(desc(projectAiMemory.lastObservedAt))
    .limit(limit * 2); // fetch extra so ranking has headroom

  const items: MemoryItem[] = rows.map((r) => ({
    id: r.id,
    type: r.memoryType as MemoryType,
    title: r.title,
    summary: r.summary,
    detail: r.detail ?? undefined,
    confidenceLevel: (r.confidenceLevel ?? "medium") as MemoryItem["confidenceLevel"],
    observedCount: r.observedCount,
    tags: r.tags ?? [],
    lastObservedAt: r.lastObservedAt ? new Date(r.lastObservedAt) : null,
  }));
  const ranked = rankMemoryByRelevance(items).slice(0, limit);
  const context = summarizeMemoryForAgent(ranked, maxTokens);
  return { context, idsUsed: ranked.map((m) => m.id) };
}

export async function bumpMemoryObservation(args: {
  memoryId: string;
}): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db
    .update(projectAiMemory)
    .set({
      observedCount: sql`${projectAiMemory.observedCount} + 1`,
      lastObservedAt: new Date().toISOString().slice(0, 10),
    })
    .where(eq(projectAiMemory.id, args.memoryId));
}
