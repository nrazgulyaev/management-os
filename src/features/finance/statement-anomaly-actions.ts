"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/features/auth/permissions";
import { getOwnerStatementById } from "@/features/finance/services";
import { scanStatementAnomalies } from "./statement-anomaly-detector";

/**
 * Run the deterministic anomaly detector against a statement and persist the
 * fresh unresolved flags. Permission-gated like the other statement actions.
 */
export async function runStatementAnomalyScanAction(
  statementId: string,
): Promise<{ ok: boolean; count?: number; error?: string }> {
  await requirePermission("finance.issue_statement");
  const statement = await getOwnerStatementById(statementId);
  if (!statement) return { ok: false, error: "Statement not found." };
  const { count } = await scanStatementAnomalies(
    statementId,
    statement.netPayoutMinor,
  );
  revalidatePath(`/dashboard/finance/statements/${statementId}`);
  return { ok: true, count };
}
