import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { statementReconciliationWarnings } from "@/lib/db/schema/statement-transparency";

/**
 * Helpers for changing the status of an existing warning.  Used by
 * the admin actions in `actions.ts` and indirectly by the cron job
 * when it observes that a warning's underlying source has been
 * resolved.
 */

export async function setWarningStatus(
  warningId: string,
  status: "acknowledged" | "resolved" | "dismissed",
): Promise<{ ok: boolean }> {
  const db = getDb();
  if (!db) return { ok: false };
  const now = new Date();
  const update: Record<string, unknown> = { status, updatedAt: now };
  if (status === "acknowledged") update.acknowledgedAt = now;
  if (status === "resolved") update.resolvedAt = now;
  await db
    .update(statementReconciliationWarnings)
    .set(update)
    .where(eq(statementReconciliationWarnings.id, warningId));
  return { ok: true };
}

export const acknowledgeStatementWarning = (id: string) =>
  setWarningStatus(id, "acknowledged");

export const resolveStatementWarning = (id: string) =>
  setWarningStatus(id, "resolved");

export const dismissStatementWarning = (id: string) =>
  setWarningStatus(id, "dismissed");
