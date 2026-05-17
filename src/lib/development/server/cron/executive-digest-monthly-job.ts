import "server-only";

import {} from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";
import { generateDigest } from "../executive-digest/digest-actions";
import { getLatestCompanySnapshot } from "../executive/metrics-queries";

/**
 * Stage 5.C — Monthly executive digest (1st of month 06:00).
 *
 * Reads the latest company-wide snapshot, builds a digest skeleton
 * via the pure helper, and saves as `status='draft'` for CEO review.
 *
 * Idempotent — `digest_code` is UNIQUE per month, so a second run is
 * a no-op (insert ... on conflict do nothing).
 */
export async function runDevOsExecutiveDigestMonthly(
  handle: JobRunHandle,
): Promise<JobOutcome> {
  const db = getDb();
  if (!db) {
    return {
      status: "failed",
      summary: "Database is not configured.",
      metrics: { generated: 0 },
      error: "DB unavailable",
    };
  }

  const now = new Date();
  // Month "for" the digest = the month that just ended.
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  const periodStart = new Date(
    Date.UTC(periodEnd.getUTCFullYear(), periodEnd.getUTCMonth(), 1),
  );
  const periodLabel = `${periodStart.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}`;

  const snapshot = await getLatestCompanySnapshot();

  // Build a context using the snapshot if present, else zero-filled.
  const result = await generateDigest({
    digestType: "monthly",
    metricsSnapshotId: snapshot?.id,
    context: {
      periodLabel,
      periodStart,
      periodEnd,
      baseCurrency: "IDR",
      snapshot: {
        totalCashOnHandMinor: snapshot ? Number(snapshot.totalCashOnHandMinor) : 0,
        activeProjectsCount: snapshot?.activeProjectsCount ?? 0,
        projectsOnTrack: snapshot?.projectsOnTrack ?? 0,
        projectsAtRisk: snapshot?.projectsAtRisk ?? 0,
        projectsDelayed: snapshot?.projectsDelayed ?? 0,
        activeLeadsCount: snapshot?.activeLeadsCount ?? 0,
        contractsSignedThisMonth: snapshot?.contractsSignedThisMonth ?? 0,
        totalCommittedCapitalMinor: snapshot
          ? Number(snapshot.totalCommittedCapitalMinor)
          : 0,
        totalDrawnCapitalMinor: snapshot
          ? Number(snapshot.totalDrawnCapitalMinor)
          : 0,
        openQaQcIssues: snapshot?.openQaQcIssues ?? 0,
        criticalQaQcIssues: snapshot?.criticalQaQcIssues ?? 0,
        highRiskItemsCount: snapshot?.highRiskItemsCount ?? 0,
        payrollRunwayWeeks: snapshot?.payrollRunwayWeeks
          ? Number(snapshot.payrollRunwayWeeks)
          : 0,
      },
    },
  });

  if (!result.ok) {
    return {
      status: "failed",
      summary: `digest generation failed: ${result.error}`,
      metrics: { generated: 0 },
      error: result.error,
    };
  }

  await handle.event("info", `digest ${result.code} created (draft)`, {
    code: result.code,
  });

  return {
    status: "success",
    summary: `Digest ${result.code} generated as draft.`,
    metrics: { generated: 1, code: result.code },
  };
}
