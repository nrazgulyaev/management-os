import "server-only";

import { desc, eq, inArray, gte } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { riskRadarAlerts } from "@/lib/db/schema/executive";

export async function listRecentAlerts(opts: {
  limit?: number;
  status?: Array<"open" | "acknowledged" | "investigating" | "resolved" | "false_positive" | "archived">;
} = {}) {
  const db = getDb();
  if (!db) return [];
  const where = opts.status
    ? inArray(riskRadarAlerts.status, opts.status)
    : undefined;
  const q = db
    .select()
    .from(riskRadarAlerts)
    .orderBy(desc(riskRadarAlerts.detectedAt))
    .limit(opts.limit ?? 100);
  return where ? q.where(where) : q;
}

export async function getAlertByCode(code: string) {
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(riskRadarAlerts)
    .where(eq(riskRadarAlerts.alertCode, code))
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
