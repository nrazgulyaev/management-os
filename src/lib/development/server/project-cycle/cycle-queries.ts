import "server-only";

import { and, asc, desc, eq, gte } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import {
  payrollPeriods,
  teamCapacityTracking,
  projectCycleRecommendations,
} from "@/lib/db/schema/project-cycle";

export async function listPayrollPeriods(filters?: {
  status?: string;
  fromDate?: string;
}) {
  const db = requireDb();
  const conditions = [] as Array<ReturnType<typeof eq>>;
  if (filters?.status) {
    conditions.push(eq(payrollPeriods.status, filters.status));
  }
  if (filters?.fromDate) {
    conditions.push(gte(payrollPeriods.periodStart, filters.fromDate));
  }
  return db
    .select()
    .from(payrollPeriods)
    .where(conditions.length === 0 ? undefined : and(...conditions))
    .orderBy(asc(payrollPeriods.periodStart));
}

export async function listTeamCapacityTracking(filters?: {
  roleType?: string;
  fromDate?: string;
}) {
  const db = requireDb();
  const conditions = [] as Array<ReturnType<typeof eq>>;
  if (filters?.roleType) {
    conditions.push(eq(teamCapacityTracking.roleType, filters.roleType));
  }
  if (filters?.fromDate) {
    conditions.push(
      gte(teamCapacityTracking.trackingPeriodStart, filters.fromDate),
    );
  }
  return db
    .select()
    .from(teamCapacityTracking)
    .where(conditions.length === 0 ? undefined : and(...conditions))
    .orderBy(desc(teamCapacityTracking.trackingPeriodStart));
}

export async function listCycleRecommendations(filters?: {
  status?: string;
  limit?: number;
}) {
  const db = requireDb();
  const conditions = [] as Array<ReturnType<typeof eq>>;
  if (filters?.status) {
    conditions.push(
      eq(projectCycleRecommendations.operatorStatus, filters.status),
    );
  }
  return db
    .select()
    .from(projectCycleRecommendations)
    .where(conditions.length === 0 ? undefined : and(...conditions))
    .orderBy(desc(projectCycleRecommendations.generatedForDate))
    .limit(filters?.limit ?? 50);
}

export async function getCycleRecommendationByCode(code: string) {
  const db = requireDb();
  const [row] = await db
    .select()
    .from(projectCycleRecommendations)
    .where(eq(projectCycleRecommendations.recommendationCode, code))
    .limit(1);
  return row ?? null;
}

export async function getLatestCycleRecommendation() {
  const db = requireDb();
  const [row] = await db
    .select()
    .from(projectCycleRecommendations)
    .orderBy(desc(projectCycleRecommendations.generatedForDate))
    .limit(1);
  return row ?? null;
}
