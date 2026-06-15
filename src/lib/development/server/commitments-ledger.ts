import "server-only";

import { eq, sql, and } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { devCommitmentsLedger } from "@/lib/db/schema/dev-finance";
import { requireOrgId } from "@/features/auth/require-org";

export type CommitmentLedgerRow = typeof devCommitmentsLedger.$inferSelect;

export interface CommitmentLedgerFilters {
  projectId?: string;
  categoryId?: string;
  vendorContactId?: string;
  status?: "open" | "partially_paid" | "completed" | "cancelled";
}

export async function getCommitmentsLedger(
  filters: CommitmentLedgerFilters = {},
): Promise<CommitmentLedgerRow[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  const conditions = [
    eq(devCommitmentsLedger.organizationId, organizationId),
  ];
  if (filters.projectId)
    conditions.push(eq(devCommitmentsLedger.projectId, filters.projectId));
  if (filters.categoryId)
    conditions.push(eq(devCommitmentsLedger.categoryId, filters.categoryId));
  if (filters.vendorContactId)
    conditions.push(
      eq(devCommitmentsLedger.vendorContactId, filters.vendorContactId),
    );
  if (filters.status)
    conditions.push(eq(devCommitmentsLedger.status, filters.status));
  return await db
    .select()
    .from(devCommitmentsLedger)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(devCommitmentsLedger.committedDate);
}

export interface OpenCommitmentByCategory {
  categoryId: string;
  totalUsdMinor: string;
  count: number;
}

export async function getOpenCommitmentsByCategory(
  projectId: string,
): Promise<OpenCommitmentByCategory[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  const rows = await db.execute(sql`
    SELECT
      category_id,
      sum(amount_usd_minor)::bigint AS total,
      count(*)::int AS count
    FROM dev_commitments_ledger
    WHERE project_id = ${projectId}
      AND organization_id = ${organizationId}
      AND status IN ('open','partially_paid')
    GROUP BY category_id
  `);
  return (rows as Record<string, unknown>[]).map((r) => ({
    categoryId: String(r.category_id),
    totalUsdMinor: String(r.total ?? "0"),
    count: Number(r.count ?? 0),
  }));
}
