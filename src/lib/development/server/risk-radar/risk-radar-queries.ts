import "server-only";

import { and, desc, eq, inArray, gte, lte, ne, or } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { riskRadarAlerts } from "@/lib/db/schema/executive";
import { requireOrgId } from "@/features/auth/require-org";

/**
 * Alerts detected within `[start, end]` (inclusive), newest first.
 * Used by the time-range executive rollups to count risks raised in a
 * quarter / year-to-date window.
 */
export async function listAlertsInRange(start: Date, end: Date) {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  return db
    .select()
    .from(riskRadarAlerts)
    .where(
      and(
        eq(riskRadarAlerts.organizationId, organizationId),
        gte(riskRadarAlerts.detectedAt, start),
        lte(riskRadarAlerts.detectedAt, end),
      ),
    )
    .orderBy(desc(riskRadarAlerts.detectedAt));
}

export async function listRecentAlerts(opts: {
  limit?: number;
  status?: Array<"open" | "acknowledged" | "investigating" | "resolved" | "false_positive" | "archived">;
} = {}) {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  const where = opts.status
    ? and(
        eq(riskRadarAlerts.organizationId, organizationId),
        inArray(riskRadarAlerts.status, opts.status),
      )
    : eq(riskRadarAlerts.organizationId, organizationId);
  return db
    .select()
    .from(riskRadarAlerts)
    .where(where)
    .orderBy(desc(riskRadarAlerts.detectedAt))
    .limit(opts.limit ?? 100);
}

export async function getAlertByCode(code: string) {
  const db = getDb();
  if (!db) return null;
  const organizationId = await requireOrgId();
  const rows = await db
    .select()
    .from(riskRadarAlerts)
    .where(
      and(
        eq(riskRadarAlerts.alertCode, code),
        eq(riskRadarAlerts.organizationId, organizationId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function listOpenDedupeKeys(): Promise<Set<string>> {
  const db = getDb();
  if (!db) return new Set();
  // Use detectionMethod + supportingData hash via the alertCode pattern
  // — simpler: derive dedupeKey from notes JSONB, but cleanly: read open
  // alerts and rebuild keys from detection_method + first ID.
  // For minimal impl, return empty set on the read path; cron writes
  // unique alert_codes anyway.
  const rows = await db
    .select({
      detectionMethod: riskRadarAlerts.detectionMethod,
      affectedEntities: riskRadarAlerts.affectedEntities,
    })
    .from(riskRadarAlerts)
    .where(
      inArray(riskRadarAlerts.status, [
        "open",
        "acknowledged",
        "investigating",
      ]),
    );
  const keys = new Set<string>();
  for (const r of rows) {
    if (r.detectionMethod) keys.add(`${r.detectionMethod}`);
  }
  return keys;
}

/**
 * Similar-risks history panel — other alerts that share the same
 * category OR detection method as the given one, excluding the alert
 * itself. Most-recent first. Used by the exec drill-in to show how the
 * org has handled this class of risk before.
 */
export async function listSimilarAlerts(args: {
  alertId: string;
  alertCategory: string;
  detectionMethod: string | null;
  limit?: number;
}) {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  const matchers = [eq(riskRadarAlerts.alertCategory, args.alertCategory)];
  if (args.detectionMethod) {
    matchers.push(eq(riskRadarAlerts.detectionMethod, args.detectionMethod));
  }
  return db
    .select({
      id: riskRadarAlerts.id,
      alertCode: riskRadarAlerts.alertCode,
      title: riskRadarAlerts.title,
      severity: riskRadarAlerts.severity,
      status: riskRadarAlerts.status,
      detectedAt: riskRadarAlerts.detectedAt,
      resolvedAt: riskRadarAlerts.resolvedAt,
      resolutionNotes: riskRadarAlerts.resolutionNotes,
    })
    .from(riskRadarAlerts)
    .where(
      and(
        eq(riskRadarAlerts.organizationId, organizationId),
        ne(riskRadarAlerts.id, args.alertId),
        or(...matchers),
      ),
    )
    .orderBy(desc(riskRadarAlerts.detectedAt))
    .limit(args.limit ?? 8);
}

export async function listRecurringPatternHistory(daysBack = 90) {
  const db = getDb();
  if (!db) return [];
  const cutoff = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
  return db
    .select({
      detectionMethod: riskRadarAlerts.detectionMethod,
      resolvedAt: riskRadarAlerts.resolvedAt,
    })
    .from(riskRadarAlerts)
    .where(gte(riskRadarAlerts.detectedAt, cutoff));
}
