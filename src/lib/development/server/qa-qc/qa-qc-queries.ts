import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import {
  qaQcCategories,
  qaQcIssues,
  qaQcInspections,
  qaQcIssuePhotos,
} from "@/lib/db/schema/qa-qc";
import { requireOrgId } from "@/features/auth/require-org";

export async function listQaQcCategories() {
  const db = requireDb();
  return db
    .select()
    .from(qaQcCategories)
    .where(eq(qaQcCategories.isActive, true))
    .orderBy(qaQcCategories.displayOrder);
}

export async function listQaQcIssues(filters?: {
  projectId?: string;
  villaId?: string;
  status?: string;
  severity?: string;
  assignedTo?: string;
}) {
  const db = requireDb();
  const conditions = [] as Array<ReturnType<typeof eq>>;
  if (filters?.projectId) {
    conditions.push(eq(qaQcIssues.projectId, filters.projectId));
  }
  if (filters?.villaId) {
    conditions.push(eq(qaQcIssues.villaId, filters.villaId));
  }
  if (filters?.status) {
    conditions.push(eq(qaQcIssues.status, filters.status));
  }
  if (filters?.severity) {
    conditions.push(eq(qaQcIssues.severity, filters.severity));
  }
  if (filters?.assignedTo) {
    conditions.push(eq(qaQcIssues.assignedTo, filters.assignedTo));
  }
  return db
    .select()
    .from(qaQcIssues)
    .where(conditions.length === 0 ? undefined : and(...conditions))
    .orderBy(desc(qaQcIssues.reportedAt))
    .limit(200);
}

export async function getQaQcIssueByCode(issueCode: string) {
  const db = requireDb();
  // TENANCY — issueCode is globally unique; without the org filter a tenant
  // could open another tenant's QA/QC issue (and its photos/inspections) by
  // code. Org mismatch returns null so the page notFound()s.
  const organizationId = await requireOrgId();
  const [issue] = await db
    .select()
    .from(qaQcIssues)
    .where(
      and(
        eq(qaQcIssues.issueCode, issueCode),
        eq(qaQcIssues.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!issue) return null;
  const [photos, inspections] = await Promise.all([
    db
      .select()
      .from(qaQcIssuePhotos)
      .where(
        and(
          eq(qaQcIssuePhotos.issueId, issue.id),
          eq(qaQcIssuePhotos.organizationId, organizationId),
        ),
      )
      .orderBy(desc(qaQcIssuePhotos.uploadedAt)),
    db
      .select()
      .from(qaQcInspections)
      .where(
        and(
          eq(qaQcInspections.issueId, issue.id),
          eq(qaQcInspections.organizationId, organizationId),
        ),
      )
      .orderBy(qaQcInspections.inspectionNumber),
  ]);
  return { issue, photos, inspections };
}

/**
 * Per-villa severity heatmap data. Returns issues only — caller can run
 * `computeVillaSeverityScore` from the helper module to aggregate.
 */
export async function getProjectQaQcHeatmapData(projectId: string) {
  const db = requireDb();
  return db
    .select({
      villaId: qaQcIssues.villaId,
      severity: qaQcIssues.severity,
      status: qaQcIssues.status,
    })
    .from(qaQcIssues)
    .where(eq(qaQcIssues.projectId, projectId));
}

export async function countOpenIssuesByProject(projectId: string) {
  const db = requireDb();
  const [{ c }] = await db
    .select({ c: sql<string>`COUNT(*)::text` })
    .from(qaQcIssues)
    .where(
      and(
        eq(qaQcIssues.projectId, projectId),
        sql`${qaQcIssues.status} NOT IN ('accepted', 'closed')`,
      ),
    );
  return Number(c ?? "0");
}
