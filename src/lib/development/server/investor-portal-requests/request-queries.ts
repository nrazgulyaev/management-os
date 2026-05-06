import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import { investorPortalRequests } from "@/lib/db/schema/investor-portal-requests";

export async function listInvestorPortalRequests(filters?: {
  investorId?: string;
  status?: string;
  requestType?: string;
}) {
  const db = requireDb();
  const conditions = [] as Array<ReturnType<typeof eq>>;
  if (filters?.investorId) {
    conditions.push(eq(investorPortalRequests.investorId, filters.investorId));
  }
  if (filters?.status) {
    conditions.push(eq(investorPortalRequests.status, filters.status));
  }
  if (filters?.requestType) {
    conditions.push(
      eq(investorPortalRequests.requestType, filters.requestType),
    );
  }
  return db
    .select()
    .from(investorPortalRequests)
    .where(conditions.length === 0 ? undefined : and(...conditions))
    .orderBy(desc(investorPortalRequests.submittedAt));
}

export async function getInvestorPortalRequestByCode(requestCode: string) {
  const db = requireDb();
  const [row] = await db
    .select()
    .from(investorPortalRequests)
    .where(eq(investorPortalRequests.requestCode, requestCode))
    .limit(1);
  return row ?? null;
}

export async function getInvestorPortalRequest(id: string) {
  const db = requireDb();
  const [row] = await db
    .select()
    .from(investorPortalRequests)
    .where(eq(investorPortalRequests.id, id))
    .limit(1);
  return row ?? null;
}
