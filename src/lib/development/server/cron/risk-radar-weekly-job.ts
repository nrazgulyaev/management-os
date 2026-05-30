import "server-only";

import { sql } from "drizzle-orm";
import { getDb, rowsOf } from "@/lib/db/client";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";
import {
  ruleTransactionMissingTax,
  ruleScheduleTaskOverdue,
  dedupeAgainstOpen,
  type DetectedAlert,
} from "../risk-radar/risk-radar-detector";
import { listOpenDedupeKeys } from "../risk-radar/risk-radar-queries";
import { persistDetectedAlert } from "../risk-radar/risk-radar-actions";
import { runAiRiskRadar } from "../risk-radar/risk-radar-ai-agent";

/**
 * Stage 5.C — Weekly risk radar scan (Monday 07:00).
 *
 * Runs the rule-based detector first; AI agent layered on top in
 * non-dry-run mode. Persists each *new* alert (deduped against open).
 *
 * Idempotent — same patterns won't re-create open alerts.
 */
export async function runDevOsRiskRadarWeekly(
  handle: JobRunHandle,
): Promise<JobOutcome> {
  const db = getDb();
  if (!db) {
    return {
      status: "failed",
      summary: "Database is not configured.",
      metrics: { detected: 0, persisted: 0 },
      error: "DB unavailable",
    };
  }

  // Gather rule-based inputs.
  const txRows = await db.execute<{
    transaction_id: string;
    amount_minor: string;
    age_days: string;
    has_tax: string;
  }>(sql`
    SELECT id::text AS transaction_id,
           ABS(amount_usd_minor)::text AS amount_minor,
           EXTRACT(DAY FROM (now() - transaction_date))::text AS age_days,
           CASE WHEN tax_classification IS NOT NULL THEN '1' ELSE '0' END AS has_tax
      FROM dev_transactions
     WHERE transaction_date >= now() - INTERVAL '60 days'
     LIMIT 500
  `);
  const txInputs =
    rowsOf<{
        transaction_id: string;
        amount_minor: string;
        age_days: string;
        has_tax: string;
      }>(txRows).map((r) => ({
      transactionId: r.transaction_id,
      amountMinor: Number(r.amount_minor),
      ageDays: Number(r.age_days),
      hasTaxClassification: r.has_tax === "1",
    })) ?? [];

  const ruleAlerts: DetectedAlert[] = [
    ...ruleTransactionMissingTax(txInputs),
    // Schedule overdue rule deferred — schema lookups for dev_schedule_tasks
    // covered separately in 4.C.2; here we keep cron lightweight.
    ...ruleScheduleTaskOverdue([]),
  ];

  const aiResult = await runAiRiskRadar({
    ruleBasedAlerts: ruleAlerts,
    snapshotSummary: {
      cashOnHandIdr: 0,
      payrollRunwayWeeks: 0,
      activeProjectCount: 0,
      openQaQcCritical: 0,
    },
  });

  const allAlerts = [...ruleAlerts, ...aiResult.augmentedAlerts];

  const openKeys = await listOpenDedupeKeys();
  const newAlerts = dedupeAgainstOpen(allAlerts, openKeys);

  // Persist each new alert with a generated alert_code.
  const yyyy = new Date().getUTCFullYear();
  const seqRow = await db.execute<{ n: string }>(sql`
    SELECT COUNT(*)::text AS n FROM risk_radar_alerts
     WHERE alert_code LIKE ${`ALERT-${yyyy}-%`}
  `);
  let seq = Number(
    rowsOf<{ n: string }>(seqRow)[0]?.n ?? "0",
  );

  let persisted = 0;
  for (const a of newAlerts) {
    seq++;
    const code = `ALERT-${yyyy}-${String(seq).padStart(4, "0")}`;
    const r = await persistDetectedAlert({ detected: a, alertCode: code });
    if (r.ok) persisted++;
  }

  await handle.event(
    "info",
    `risk radar — ${ruleAlerts.length} rule, ${aiResult.augmentedAlerts.length} AI, ${persisted} persisted`,
    {
      ruleCount: ruleAlerts.length,
      aiCount: aiResult.augmentedAlerts.length,
      persisted,
    },
  );

  return {
    status: "success",
    summary: `Detected ${allAlerts.length}, persisted ${persisted} new alert(s).`,
    metrics: {
      ruleCount: ruleAlerts.length,
      aiCount: aiResult.augmentedAlerts.length,
      persisted,
    },
  };
}
