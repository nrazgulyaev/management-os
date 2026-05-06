import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import {
  buyers,
  buyerUnitAssignments,
  buyerProgressReports,
} from "@/lib/db/schema/buyers";

export async function listBuyers(filters?: { kycStatus?: string }) {
  const db = requireDb();
  const conditions = [] as Array<ReturnType<typeof eq>>;
  if (filters?.kycStatus) {
    conditions.push(eq(buyers.kycStatus, filters.kycStatus));
  }
  return db
    .select()
    .from(buyers)
    .where(conditions.length === 0 ? undefined : and(...conditions))
    .orderBy(desc(buyers.createdAt));
}

export async function getBuyerByCode(buyerCode: string) {
  const db = requireDb();
  const [buyer] = await db
    .select()
    .from(buyers)
    .where(eq(buyers.buyerCode, buyerCode))
    .limit(1);
  if (!buyer) return null;
  const assignments = await db
    .select()
    .from(buyerUnitAssignments)
    .where(eq(buyerUnitAssignments.buyerId, buyer.id))
    .orderBy(desc(buyerUnitAssignments.assignedAt));
  return { buyer, assignments };
}

export async function listBuyerProgressReports(filters: {
  projectId?: string;
  unitId?: string;
  status?: string;
}) {
  const db = requireDb();
  const conditions = [] as Array<ReturnType<typeof eq>>;
  if (filters.projectId) {
    conditions.push(eq(buyerProgressReports.projectId, filters.projectId));
  }
  if (filters.unitId) {
    conditions.push(eq(buyerProgressReports.unitId, filters.unitId));
  }
  if (filters.status) {
    conditions.push(eq(buyerProgressReports.status, filters.status));
  }
  return db
    .select()
    .from(buyerProgressReports)
    .where(conditions.length === 0 ? undefined : and(...conditions))
    .orderBy(desc(buyerProgressReports.reportingPeriodEnd));
}

export async function getBuyerProgressReport(id: string) {
  const db = requireDb();
  const [report] = await db
    .select()
    .from(buyerProgressReports)
    .where(eq(buyerProgressReports.id, id))
    .limit(1);
  return report ?? null;
}
