import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { requireDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import { investorPortalRequests } from "@/lib/db/schema/investor-portal-requests";
import { investors } from "@/lib/db/schema/investor-capital";
import { projects } from "@/lib/db/schema/projects";

/**
 * Investor-portal request readers.
 *
 * The list + by-code readers LEFT JOIN investors and the source/target
 * projects so the operator inbox and the execution detail page can render
 * legal names (deep-linked) instead of raw UUID slices. The wallet movement
 * is executed off this detail page, so the names matter for correctness.
 */

const sourceProject = alias(projects, "source_project");
const targetProject = alias(projects, "target_project");

export async function listInvestorPortalRequests(filters?: {
  investorId?: string;
  status?: string;
  requestType?: string;
}) {
  const db = requireDb();
  const organizationId = await requireOrgId();
  const conditions = [
    eq(investorPortalRequests.organizationId, organizationId),
  ] as Array<ReturnType<typeof eq>>;
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
    .select({
      ...requestColumns,
      investorCode: investors.investorCode,
      investorLegalName: investors.legalName,
    })
    .from(investorPortalRequests)
    .leftJoin(investors, eq(investors.id, investorPortalRequests.investorId))
    .where(and(...conditions))
    .orderBy(desc(investorPortalRequests.submittedAt));
}

export async function getInvestorPortalRequestByCode(requestCode: string) {
  const db = requireDb();
  const organizationId = await requireOrgId();
  const [row] = await db
    .select({
      ...requestColumns,
      investorCode: investors.investorCode,
      investorLegalName: investors.legalName,
      sourceProjectName: sourceProject.name,
      sourceProjectSlug: sourceProject.slug,
      targetProjectName: targetProject.name,
      targetProjectSlug: targetProject.slug,
    })
    .from(investorPortalRequests)
    .leftJoin(investors, eq(investors.id, investorPortalRequests.investorId))
    .leftJoin(
      sourceProject,
      eq(sourceProject.id, investorPortalRequests.sourceProjectId),
    )
    .leftJoin(
      targetProject,
      eq(targetProject.id, investorPortalRequests.targetProjectId),
    )
    .where(
      and(
        eq(investorPortalRequests.requestCode, requestCode),
        eq(investorPortalRequests.organizationId, organizationId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Explicit column map so the joined selects return every base-table field
 * the pages already consume (id, requestType, amounts, status, timestamps,
 * project ids, notes, wallet movement id, …) alongside the joined names.
 */
const requestColumns = {
  id: investorPortalRequests.id,
  organizationId: investorPortalRequests.organizationId,
  investorId: investorPortalRequests.investorId,
  requestCode: investorPortalRequests.requestCode,
  requestType: investorPortalRequests.requestType,
  requestedAmountMinor: investorPortalRequests.requestedAmountMinor,
  currency: investorPortalRequests.currency,
  sourceProjectId: investorPortalRequests.sourceProjectId,
  targetProjectId: investorPortalRequests.targetProjectId,
  relatedDistributionId: investorPortalRequests.relatedDistributionId,
  relatedCommitmentId: investorPortalRequests.relatedCommitmentId,
  investorNotes: investorPortalRequests.investorNotes,
  preferredExecutionDate: investorPortalRequests.preferredExecutionDate,
  status: investorPortalRequests.status,
  submittedAt: investorPortalRequests.submittedAt,
  reviewedAt: investorPortalRequests.reviewedAt,
  reviewedBy: investorPortalRequests.reviewedBy,
  approvalNotes: investorPortalRequests.approvalNotes,
  rejectionReason: investorPortalRequests.rejectionReason,
  executedAt: investorPortalRequests.executedAt,
  relatedWalletMovementId: investorPortalRequests.relatedWalletMovementId,
  createdAt: investorPortalRequests.createdAt,
  updatedAt: investorPortalRequests.updatedAt,
} as const;

export async function getInvestorPortalRequest(id: string) {
  const db = requireDb();
  const organizationId = await requireOrgId();
  const [row] = await db
    .select()
    .from(investorPortalRequests)
    .where(
      and(
        eq(investorPortalRequests.id, id),
        eq(investorPortalRequests.organizationId, organizationId),
      ),
    )
    .limit(1);
  return row ?? null;
}
