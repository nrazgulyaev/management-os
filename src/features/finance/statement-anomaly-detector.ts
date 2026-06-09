import "server-only";

/**
 * Statement anomaly detector (real implementation).
 *
 * Phase 2.2 mgmt-02 shipped a stub agent
 * (src/features/ai-agents/statements/statement-anomaly.ts run() → {flags:[]})
 * plus the `statement_anomalies` table, but nothing ever computed or wrote
 * a flag. This is the real, deterministic detector: it walks a generated
 * statement's lines and emits anomaly rows the accountant/Director reviews
 * before approval.
 *
 * Deterministic (not LLM) by design — financial flags must be reproducible
 * and explainable. v1 uses only the statement's own lines + its net payout
 * (sign-agnostic via absolute magnitudes), so it is safe to run on any
 * statement with no history dependency. History-based rules
 * (supplier_cost_spike vs a trailing baseline, occupancy_drop,
 * channel_mix_shift) are a documented follow-up.
 *
 * Emits the persisted `statement_anomalies` taxonomy (the authoritative
 * schema), NOT the stale stub module's vocabulary.
 */

import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { ownerStatements, statementLines } from "@/lib/db/schema/finance";
import { statementAnomalies } from "@/lib/db/schema/statement-anomalies";
import {
  detectStatementAnomalies,
  type AnomalyLine,
} from "./statement-anomaly-rules";

export {
  detectStatementAnomalies,
  type AnomalyLine,
  type AnomalyFinding,
} from "./statement-anomaly-rules";

/**
 * Run the detector against a persisted statement and idempotently refresh its
 * UNRESOLVED anomaly rows (resolved/acknowledged rows are preserved). Returns
 * the new finding count. Never throws on db-down — returns 0.
 */
export async function scanStatementAnomalies(
  statementId: string,
  netPayoutMinor: bigint,
): Promise<{ count: number }> {
  const db = getDb();
  if (!db) return { count: 0 };

  const rows = await db
    .select({
      id: statementLines.id,
      lineType: statementLines.lineType,
      category: statementLines.category,
      description: statementLines.description,
      amountMinor: statementLines.amountMinor,
    })
    .from(statementLines)
    .where(eq(statementLines.statementId, statementId));

  const lines: AnomalyLine[] = rows.map((r) => ({
    id: r.id,
    lineType: r.lineType,
    category: r.category,
    description: r.description,
    amountMinor: BigInt(r.amountMinor),
  }));

  const findings = detectStatementAnomalies(lines, netPayoutMinor);

  // Idempotent: clear prior unresolved flags, then insert the fresh set.
  await db
    .delete(statementAnomalies)
    .where(
      and(
        eq(statementAnomalies.statementId, statementId),
        isNull(statementAnomalies.resolvedAt),
      ),
    );

  if (findings.length > 0) {
    // TENANCY-FINANCE-DOCS — copy the parent statement's org onto each anomaly.
    const [parent] = await db
      .select({ organizationId: ownerStatements.organizationId })
      .from(ownerStatements)
      .where(eq(ownerStatements.id, statementId))
      .limit(1);
    const organizationId = parent?.organizationId ?? null;
    await db.insert(statementAnomalies).values(
      findings.map((f) => ({
        organizationId,
        statementId,
        kind: f.kind,
        severity: f.severity,
        payload: f.payload,
      })),
    );
  }

  return { count: findings.length };
}

export interface StatementAnomalyView {
  id: string;
  kind: string;
  severity: string;
  payload: Record<string, unknown>;
  firedAt: Date;
  resolvedAt: Date | null;
}

/** Read a statement's anomaly rows (newest first) for the review surface. */
export async function listStatementAnomalies(
  statementId: string,
): Promise<StatementAnomalyView[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(statementAnomalies)
    .where(eq(statementAnomalies.statementId, statementId));
  return rows
    .map((r) => ({
      id: r.id,
      kind: r.kind,
      severity: r.severity,
      payload: (r.payload ?? {}) as Record<string, unknown>,
      firedAt: r.firedAt,
      resolvedAt: r.resolvedAt,
    }))
    .sort((a, b) => b.firedAt.getTime() - a.firedAt.getTime());
}
