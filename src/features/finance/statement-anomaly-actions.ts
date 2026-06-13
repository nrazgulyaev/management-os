"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { requirePermission } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import { getDb } from "@/lib/db/client";
import { ownerStatements } from "@/lib/db/schema/finance";
import { scanStatementAnomalies } from "./statement-anomaly-detector";

/**
 * Run the deterministic anomaly detector against a statement and persist the
 * fresh unresolved flags. Permission-gated like the other statement actions.
 */
export async function runStatementAnomalyScanAction(
  statementId: string,
): Promise<{ ok: boolean; count?: number; error?: string }> {
  await requirePermission("finance.issue_statement");
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  // TENANCY (write-flow IDOR): org-scope the statement load so a foreign id
  // reads as "not found" before scanStatementAnomalies mutates the (org-scoped)
  // statement_anomalies rows. getOwnerStatementById is NOT org-filtered.
  const organizationId = await requireOrgId();
  const [statement] = await db
    .select({ netPayoutMinor: ownerStatements.netPayoutMinor })
    .from(ownerStatements)
    .where(
      and(
        eq(ownerStatements.id, statementId),
        eq(ownerStatements.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!statement) return { ok: false, error: "Statement not found." };
  const { count } = await scanStatementAnomalies(
    statementId,
    statement.netPayoutMinor,
  );
  revalidatePath(`/dashboard/finance/statements/${statementId}`);
  return { ok: true, count };
}
