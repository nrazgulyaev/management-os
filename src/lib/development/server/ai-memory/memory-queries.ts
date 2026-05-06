import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { projectAiMemory } from "@/lib/db/schema/ai-agents";

export async function listProjectMemory(
  projectId: string,
  limit = 100,
) {
  const db = getDb();
  if (!db) return [];
  return db
    .select()
    .from(projectAiMemory)
    .where(
      and(
        eq(projectAiMemory.projectId, projectId),
        eq(projectAiMemory.isActive, true),
      ),
    )
    .orderBy(desc(projectAiMemory.lastObservedAt))
    .limit(limit);
}

export async function getMemoryById(id: string) {
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(projectAiMemory)
    .where(eq(projectAiMemory.id, id))
    .limit(1);
  return rows[0] ?? null;
}
