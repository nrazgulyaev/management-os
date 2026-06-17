import "server-only";

import { and, asc, desc, eq, gte, type SQL } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import {
  payrollPeriods,
  teamCapacityTracking,
  projectCycleRecommendations,
} from "@/lib/db/schema/project-cycle";
import { requireOrgId } from "@/features/auth/require-org";

export async function listPayrollPeriods(filters?: {
  status?: string;
  fromDate?: string;
}) {
  const db = requireDb();
  const orgId = await requireOrgId();
  // TENANCY: hard-scope by org — pre-existing NULL-org (demo) rows drop out.
  const conditions: SQL[] = [eq(payrollPeriods.organizationId, orgId)];
  if (filters?.status) {
    conditions.push(eq(payrollPeriods.status, filters.status));
  }
  if (filters?.fromDate) {
    conditions.push(gte(payrollPeriods.periodStart, filters.fromDate));
  }
  return db
    .select()
    .from(payrollPeriods)
    .where(and(...conditions))
    .orderBy(asc(payrollPeriods.periodStart));
}

export async function listTeamCapacityTracking(filters?: {
  roleType?: string;
  fromDate?: string;
}) {
  const db = requireDb();
  const orgId = await requireOrgId();
  // TENANCY: hard-scope by org — pre-existing NULL-org (demo) rows drop out.
  const conditions: SQL[] = [eq(teamCapacityTracking.organizationId, orgId)];
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
    .where(and(...conditions))
    .orderBy(desc(teamCapacityTracking.trackingPeriodStart));
}

export async function listCycleRecommendations(filters?: {
  status?: string;
  limit?: number;
}) {
  const db = requireDb();
  const orgId = await requireOrgId();
  // TENANCY: hard-scope by org — pre-existing NULL-org (demo) rows drop out.
  const conditions: SQL[] = [
    eq(projectCycleRecommendations.organizationId, orgId),
  ];
  if (filters?.status) {
    conditions.push(
      eq(projectCycleRecommendations.operatorStatus, filters.status),
    );
  }
  return db
    .select()
    .from(projectCycleRecommendations)
    .where(and(...conditions))
    .orderBy(desc(projectCycleRecommendations.generatedForDate))
    .limit(filters?.limit ?? 50);
}

export async function getCycleRecommendationByCode(code: string) {
  const db = requireDb();
  const orgId = await requireOrgId();
  // TENANCY: scope by org so a recommendation code from another tenant
  // returns null (→ detail page notFound()s) rather than leaking.
  const [row] = await db
    .select()
    .from(projectCycleRecommendations)
    .where(
      and(
        eq(projectCycleRecommendations.recommendationCode, code),
        eq(projectCycleRecommendations.organizationId, orgId),
      ),
    )
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
