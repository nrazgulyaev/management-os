"use server";
import "server-only";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { projectAiMemory } from "@/lib/db/schema/ai-agents";
import {
  detectMemoryConflict,
  type MemoryItem,
  type MemoryType,
} from "./memory-helpers";
import { bumpMemoryObservation } from "./memory-loader";

const createSchema = z.object({
  projectId: z.string().uuid(),
  type: z.string(),
  title: z.string().min(2).max(200),
  summary: z.string().min(2).max(2000),
  detail: z.string().optional(),
  confidenceLevel: z.enum(["low", "medium", "high"]).optional(),
  sourceType: z.enum([
    "manual_entry",
    "ai_generated",
    "auto_aggregated",
    "imported_from_decision_log",
    "imported_from_risk_register",
  ]),
  tags: z.array(z.string()).optional(),
});

/**
 * Insert a memory item, but first run conflict detection — if the
 * incoming memory matches an existing one, we either bump the
 * observation count or supersede the prior item rather than duplicate.
 */
export async function ingestMemoryItem(input: z.input<typeof createSchema>) {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message };
  }
  const db = getDb();
  if (!db) return { ok: false as const, error: "DB not configured" };

  // Pull existing same-type items for conflict check.
  const existingRows = await db
    .select()
    .from(projectAiMemory)
    .where(eq(projectAiMemory.projectId, parsed.data.projectId));
  const existing: MemoryItem[] = existingRows
    .filter((r) => r.isActive)
    .map((r) => ({
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

  const verdict = detectMemoryConflict(
    {
      type: parsed.data.type as MemoryType,
      title: parsed.data.title,
      summary: parsed.data.summary,
    },
    existing,
  );

  if (verdict.suggestion === "increment_count" && verdict.conflictsWith[0]) {
    await bumpMemoryObservation({ memoryId: verdict.conflictsWith[0] });
    return {
      ok: true as const,
      verdict: verdict.suggestion,
      memoryId: verdict.conflictsWith[0],
    };
  }

  if (verdict.suggestion === "supersede_existing" && verdict.conflictsWith[0]) {
    // Insert the new item, mark old as superseded.
    const inserted = await db
      .insert(projectAiMemory)
      .values({
        projectId: parsed.data.projectId,
        memoryType: parsed.data.type,
        title: parsed.data.title,
        summary: parsed.data.summary,
        detail: parsed.data.detail ?? null,
        sourceType: parsed.data.sourceType,
        confidenceLevel: parsed.data.confidenceLevel ?? "medium",
        tags: parsed.data.tags ?? [],
        lastObservedAt: new Date().toISOString().slice(0, 10),
      })
      .returning({ id: projectAiMemory.id });
    await db
      .update(projectAiMemory)
      .set({
        isActive: false,
        supersededBy: inserted[0].id,
        archivedAt: new Date(),
        archiveReason: "superseded by newer observation",
      })
      .where(eq(projectAiMemory.id, verdict.conflictsWith[0]));
    return {
      ok: true as const,
      verdict: verdict.suggestion,
      memoryId: inserted[0].id,
    };
  }

  // Default: create_new or update_existing — either way insert a new row.
  const inserted = await db
    .insert(projectAiMemory)
    .values({
      projectId: parsed.data.projectId,
      memoryType: parsed.data.type,
      title: parsed.data.title,
      summary: parsed.data.summary,
      detail: parsed.data.detail ?? null,
      sourceType: parsed.data.sourceType,
      confidenceLevel: parsed.data.confidenceLevel ?? "medium",
      tags: parsed.data.tags ?? [],
      lastObservedAt: new Date().toISOString().slice(0, 10),
    })
    .returning({ id: projectAiMemory.id });
  return {
    ok: true as const,
    verdict: verdict.suggestion,
    memoryId: inserted[0].id,
  };
}

export async function archiveMemoryItem(args: {
  memoryId: string;
  reason: string;
}) {
  const db = getDb();
  if (!db) return { ok: false as const, error: "DB not configured" };
  await db
    .update(projectAiMemory)
    .set({
      isActive: false,
      archivedAt: new Date(),
      archiveReason: args.reason,
    })
    .where(eq(projectAiMemory.id, args.memoryId));
  return { ok: true as const };
}
