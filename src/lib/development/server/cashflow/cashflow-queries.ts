import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import { cashflowForecasts } from "@/lib/db/schema/profitability-cashflow";

export async function listCashflowForecasts(filters?: {
  scope?: "project" | "company_wide";
  projectId?: string;
  status?: string;
}) {
  const db = requireDb();
  const conditions = [] as Array<ReturnType<typeof eq>>;
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
    .where(conditions.length === 0 ? undefined : and(...conditions))
    .orderBy(desc(cashflowForecasts.createdAt));
}

export async function getCashflowForecast(id: string) {
  const db = requireDb();
  const [row] = await db
    .select()
    .from(cashflowForecasts)
    .where(eq(cashflowForecasts.id, id))
    .limit(1);
  return row ?? null;
}
