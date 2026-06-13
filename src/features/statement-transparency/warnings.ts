import "server-only";

import { and, eq, isNull, or } from "drizzle-orm";
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
  /**
   * TENANCY (write-flow IDOR): caller org. This helper is shared with the
   * cron sweep, so scoping is opt-in. statement_reconciliation_warnings has a
   * NULLABLE org anchor (migration 0151, backfilled, not query-threaded), so
   * we keep NULL (pre-threading) rows mutable but reject a warning anchored to
   * a different tenant. Request actions pass the caller org; cron passes null.
   */
  organizationId: string | null = null,
): Promise<{ ok: boolean }> {
  const db = getDb();
  if (!db) return { ok: false };
  const now = new Date();
  const update: Record<string, unknown> = { status, updatedAt: now };
  if (status === "acknowledged") update.acknowledgedAt = now;
  if (status === "resolved") update.resolvedAt = now;
  const rows = await db
    .update(statementReconciliationWarnings)
    .set(update)
    .where(
      organizationId
        ? and(
            eq(statementReconciliationWarnings.id, warningId),
            or(
              isNull(statementReconciliationWarnings.organizationId),
              eq(statementReconciliationWarnings.organizationId, organizationId),
            ),
          )
        : eq(statementReconciliationWarnings.id, warningId),
    )
    .returning({ id: statementReconciliationWarnings.id });
  return { ok: rows.length > 0 };
}

export const acknowledgeStatementWarning = (
  id: string,
  organizationId: string | null = null,
) => setWarningStatus(id, "acknowledged", organizationId);

export const resolveStatementWarning = (
  id: string,
  organizationId: string | null = null,
) => setWarningStatus(id, "resolved", organizationId);

export const dismissStatementWarning = (
  id: string,
  organizationId: string | null = null,
) => setWarningStatus(id, "dismissed", organizationId);
