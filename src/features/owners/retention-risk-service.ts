import "server-only";

/**
 * Owner retention-risk service — gathers the real signals and runs the pure
 * computeRetentionRisk engine (both shipped orphaned: the engine + RiskPill
 * existed but nothing ever computed a score). Renders on the owner detail.
 *
 * Signals computed from live data:
 *  - payoutDriftPct      latest statement net vs trailing-3 average
 *  - statementRevisions  disputed/superseded statements in the last 3 months
 *  - hasUnreadAnomaly    unresolved statement_anomalies on this owner (the
 *                        detector shipped in the anomaly-detector PR)
 *  - openMaintenance     tickets on the owner's villas open > 14 days
 *  - occupancyYoyPct     latest statement occupancy vs ~12 periods earlier
 *
 * Conservative defaults (documented): daysSincePortalSignIn = 0 (no sign-in
 * log wired yet) so portal-disengagement never false-flags; occupancyYoyPct
 * = 0 when < 12 statements exist.
 */

import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { statementAnomalies } from "@/lib/db/schema/statement-anomalies";
import { maintenanceTickets } from "@/lib/db/schema/operations";
import { listOwnerStatements } from "@/features/finance/services";
import {
  computeRetentionRisk,
  type RetentionRiskResult,
} from "./retention-risk";

export async function getOwnerRetentionRisk(
  ownerId: string,
  villaIds: string[],
): Promise<RetentionRiskResult | null> {
  const db = getDb();
  if (!db) return null;

  // Statements, newest period first.
  const statements = await listOwnerStatements({ ownerId });
  if (statements.length === 0) {
    return { level: "ok", signals: [] };
  }

  const nets = statements.map((s) => Number(s.netPayoutMinor));

  // 1. Payout drift — latest vs trailing-3 average.
  let payoutDriftPct = 0;
  if (nets.length >= 4) {
    const avg3 = (nets[1] + nets[2] + nets[3]) / 3;
    if (avg3 > 0) payoutDriftPct = Math.round(((nets[0] - avg3) / avg3) * 100);
  }

  // 2. Occupancy YoY — latest vs ~12 periods earlier.
  let occupancyYoyPct = 0;
  const latestOcc = statements[0].occupancyRate;
  const yearAgoOcc = statements[11]?.occupancyRate ?? null;
  if (latestOcc != null && yearAgoOcc != null && yearAgoOcc > 0) {
    occupancyYoyPct = Math.round(((latestOcc - yearAgoOcc) / yearAgoOcc) * 100);
  }

  // 4. Statement revisions — disputed/superseded in the last 3 months.
  const cutoff3mo = new Date();
  cutoff3mo.setMonth(cutoff3mo.getMonth() - 3);
  const cutoff3moIso = cutoff3mo.toISOString().slice(0, 10);
  const statementRevisions3mo = statements.filter(
    (s) =>
      s.periodStart >= cutoff3moIso &&
      (s.ownerState === "disputed" || s.ownerState === "superseded"),
  ).length;

  // 3 (partial). Unread anomaly on any of this owner's statements.
  const statementIds = statements.map((s) => s.id);
  const [anomalyRow] = statementIds.length
    ? await db
        .select({ c: sql<number>`count(*)` })
        .from(statementAnomalies)
        .where(
          and(
            inArray(statementAnomalies.statementId, statementIds),
            isNull(statementAnomalies.resolvedAt),
          ),
        )
    : [{ c: 0 }];
  const hasUnreadAnomaly = Number(anomalyRow?.c ?? 0) > 0;

  // 5. Maintenance escalation — tickets on owner villas open > 14 days.
  let openMaintenanceTickets = 0;
  if (villaIds.length > 0) {
    const cutoff14 = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const [mtRow] = await db
      .select({ c: sql<number>`count(*)` })
      .from(maintenanceTickets)
      .where(
        and(
          inArray(maintenanceTickets.villaId, villaIds),
          sql`${maintenanceTickets.status} NOT IN ('resolved','closed','cancelled')`,
          lt(maintenanceTickets.createdAt, cutoff14),
        ),
      );
    openMaintenanceTickets = Number(mtRow?.c ?? 0);
  }

  return computeRetentionRisk({
    payoutDriftPct,
    occupancyYoyPct,
    monthIndex: new Date().getMonth() + 1,
    daysSincePortalSignIn: 0, // no sign-in log wired — conservative
    hasUnreadAnomaly,
    statementRevisions3mo,
    openMaintenanceTickets,
  });
}
