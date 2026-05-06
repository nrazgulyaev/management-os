import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  scheduleBaselines,
  scheduleVariances,
} from "@/lib/db/schema/schedule-sophistication";

export async function listProjectBaselines(projectId: string) {
  const db = getDb();
  if (!db) return [];
  return db
    .select()
    .from(scheduleBaselines)
    .where(eq(scheduleBaselines.projectId, projectId))
    .orderBy(desc(scheduleBaselines.versionNumber));
}

export async function getCurrentBaseline(projectId: string) {
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(scheduleBaselines)
    .where(
      and(
        eq(scheduleBaselines.projectId, projectId),
        eq(scheduleBaselines.isCurrentBaseline, true),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function getBaselineByCode(code: string) {
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(scheduleBaselines)
    .where(eq(scheduleBaselines.baselineCode, code))
    .limit(1);
  return rows[0] ?? null;
}

export async function listBaselineVariances(baselineId: string) {
  const db = getDb();
  if (!db) return [];
  return db
    .select()
    .from(scheduleVariances)
    .where(eq(scheduleVariances.baselineId, baselineId))
    .orderBy(desc(scheduleVariances.finishVarianceDays));
}
