"use server";
import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import {
  scheduleBaselines,
  scheduleVariances,
} from "@/lib/db/schema/schedule-sophistication";

const createBaselineSchema = z.object({
  projectId: z.string().uuid(),
  baselineCode: z.string().min(2).max(80),
  name: z.string().min(2).max(200),
  baselineData: z.record(z.unknown()),
  approvedBy: z.string().uuid().optional(),
  approvalNotes: z.string().optional(),
  calendarId: z.string().uuid().optional(),
});

/**
 * Create baseline atomically: supersede any existing current baseline
 * for this project, insert the new row marked is_current_baseline=true.
 */
export async function createBaseline(input: z.input<typeof createBaselineSchema>) {
  const parsed = createBaselineSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message };
  }
  const db = getDb();
  if (!db) return { ok: false as const, error: "DB not configured" };

  try {
    const result = await db.transaction(async (tx) => {
      // Find existing current and supersede.
      const [prior] = await tx
        .select()
        .from(scheduleBaselines)
        .where(
          and(
            eq(scheduleBaselines.projectId, parsed.data.projectId),
            eq(scheduleBaselines.isCurrentBaseline, true),
          ),
        )
        .limit(1);

      const nextVersion = prior ? prior.versionNumber + 1 : 1;

      // Demote prior if any.
      if (prior) {
        await tx
          .update(scheduleBaselines)
          .set({
            isCurrentBaseline: false,
            supersededAt: new Date(),
          })
          .where(eq(scheduleBaselines.id, prior.id));
      }

      const inserted = await tx
        .insert(scheduleBaselines)
        .values({
          projectId: parsed.data.projectId,
          baselineCode: parsed.data.baselineCode,
          name: parsed.data.name,
          baselineData: parsed.data.baselineData as never,
          versionNumber: nextVersion,
          isCurrentBaseline: true,
          approvedBy: parsed.data.approvedBy ?? null,
          approvalNotes: parsed.data.approvalNotes ?? null,
          calendarId: parsed.data.calendarId ?? null,
        })
        .returning({ id: scheduleBaselines.id });

      // Link prior → new via supersededBy
      if (prior) {
        await tx
          .update(scheduleBaselines)
          .set({ supersededBy: inserted[0].id })
          .where(eq(scheduleBaselines.id, prior.id));
      }

      return inserted[0].id;
    });

    return { ok: true as const, baselineId: result };
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "unknown error",
    };
  }
}

const upsertVarianceSchema = z.object({
  baselineId: z.string().uuid(),
  taskId: z.string().uuid(),
  baselinePlannedStart: z.string(),
  baselinePlannedFinish: z.string(),
  baselineDurationDays: z.number().int(),
  baselineWasCritical: z.boolean().default(false),
  currentPlannedStart: z.string().optional(),
  currentPlannedFinish: z.string().optional(),
  currentDurationDays: z.number().int().optional(),
  currentActualStart: z.string().optional(),
  currentActualFinish: z.string().optional(),
  varianceStatus: z
    .enum([
      "unchanged",
      "ahead_of_schedule",
      "on_schedule",
      "minor_delay",
      "moderate_delay",
      "major_delay",
      "critical_delay",
    ])
    .default("unchanged"),
});

export async function upsertVariance(input: z.input<typeof upsertVarianceSchema>) {
  const parsed = upsertVarianceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message };
  }
  const db = getDb();
  if (!db) return { ok: false as const, error: "DB not configured" };
  await db
    .insert(scheduleVariances)
    .values({
      baselineId: parsed.data.baselineId,
      taskId: parsed.data.taskId,
      baselinePlannedStart: parsed.data.baselinePlannedStart,
      baselinePlannedFinish: parsed.data.baselinePlannedFinish,
      baselineDurationDays: parsed.data.baselineDurationDays,
      baselineWasCritical: parsed.data.baselineWasCritical,
      currentPlannedStart: parsed.data.currentPlannedStart ?? null,
      currentPlannedFinish: parsed.data.currentPlannedFinish ?? null,
      currentDurationDays: parsed.data.currentDurationDays ?? null,
      currentActualStart: parsed.data.currentActualStart ?? null,
      currentActualFinish: parsed.data.currentActualFinish ?? null,
      varianceStatus: parsed.data.varianceStatus,
    })
    .onConflictDoUpdate({
      target: [scheduleVariances.baselineId, scheduleVariances.taskId],
      set: {
        currentPlannedStart: parsed.data.currentPlannedStart ?? null,
        currentPlannedFinish: parsed.data.currentPlannedFinish ?? null,
        currentDurationDays: parsed.data.currentDurationDays ?? null,
        currentActualStart: parsed.data.currentActualStart ?? null,
        currentActualFinish: parsed.data.currentActualFinish ?? null,
        varianceStatus: parsed.data.varianceStatus,
        computedAt: sql`now()`,
      },
    });
  return { ok: true as const };
}
