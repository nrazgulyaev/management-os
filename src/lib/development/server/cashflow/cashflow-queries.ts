import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import { cashflowForecasts } from "@/lib/db/schema/profitability-cashflow";
import { requireOrgId } from "@/features/auth/require-org";

export async function listCashflowForecasts(filters?: {
  scope?: "project" | "company_wide";
  projectId?: string;
  status?: string;
}) {
  const db = requireDb();
  // TENANCY-FINANCE-DOCS — scope the primary list to the caller's org.
  const organizationId = await requireOrgId();
  const conditions = [eq(cashflowForecasts.organizationId, organizationId)];
  if (filters?.scope) {
    conditions.push(eq(cashflowForecasts.scope, filters.scope));
  }
  if (filters?.projectId) {
    conditions.push(eq(cashflowForecasts.projectId, filters.projectId));
  }
  if (filters?.status) {
    conditions.push(eq(cashflowForecasts.status, filters.status));
  }
  return db
    .select()
    .from(cashflowForecasts)
    .where(and(...conditions))
    .orderBy(desc(cashflowForecasts.createdAt));
}

export async function getCashflowForecast(id: string) {
  const db = requireDb();
  // TENANCY-FINANCE-DOCS — scope the detail read to the caller's org.
  const organizationId = await requireOrgId();
  const [row] = await db
    .select()
    .from(cashflowForecasts)
    .where(
      and(
        eq(cashflowForecasts.id, id),
        eq(cashflowForecasts.organizationId, organizationId),
      ),
    )
    .limit(1);
  return row ?? null;
}
