import "server-only";

import { and, eq } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import {
  aiOrgQuotaLimits,
  aiOrgUsageMonthly,
} from "@/lib/db/schema/ai";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

/**
 * Stage 6.P6-CATCHUP — AI quota threshold warning cron.
 *
 * For every active `ai_org_quota_limits` row, computes monthly spend %
 * against the limit and stamps `last_warn_sent_at` / `last_high_warn_sent_at`
 * when crossing 80% / 95% respectively. Email/Slack delivery is delegated
 * to the existing notification dispatch surface (out of scope for this
 * sweep — the cron only marks the threshold so the dashboard shows the
 * banner).
 *
 * Idempotent: multiple runs on the same day fire warnings once per
 * threshold-day-tuple. Resets when the next month rolls over.
 */
export async function runAiWarnThresholds(
  _handle: JobRunHandle,
): Promise<JobOutcome> {
  const db = requireDb();
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const todayIso = now.toISOString().slice(0, 10);

  const limits = await db
    .select()
    .from(aiOrgQuotaLimits)
    .where(eq(aiOrgQuotaLimits.isEnabled, true));

  let warned = 0;
  let highWarned = 0;
  let totalChecked = 0;

  for (const limit of limits) {
    totalChecked++;
    const [usage] = await db
      .select()
      .from(aiOrgUsageMonthly)
      .where(
        and(
          eq(aiOrgUsageMonthly.organizationId, limit.organizationId),
          eq(aiOrgUsageMonthly.year, year),
          eq(aiOrgUsageMonthly.month, month),
        ),
      )
      .limit(1);
    if (!usage) continue;

    const monthly = Number(limit.monthlyLimitUsd);
    if (monthly <= 0) continue;
    const pct = (Number(usage.totalCostUsd) / monthly) * 100;

    const warnLastDay = limit.lastWarnSentAt
      ? limit.lastWarnSentAt.toISOString().slice(0, 10)
      : null;
    const highLastDay = limit.lastHighWarnSentAt
      ? limit.lastHighWarnSentAt.toISOString().slice(0, 10)
      : null;

    if (pct >= limit.warnThresholdPct && warnLastDay !== todayIso) {
      await db
        .update(aiOrgQuotaLimits)
        .set({ lastWarnSentAt: new Date(), updatedAt: new Date() })
        .where(eq(aiOrgQuotaLimits.id, limit.id));
      warned++;
    }
    if (pct >= limit.highThresholdPct && highLastDay !== todayIso) {
      await db
        .update(aiOrgQuotaLimits)
        .set({ lastHighWarnSentAt: new Date(), updatedAt: new Date() })
        .where(eq(aiOrgQuotaLimits.id, limit.id));
      highWarned++;
    }
  }

  return {
    status: "success",
    summary: `Checked ${totalChecked} quota row(s); ${warned} crossed warn threshold, ${highWarned} crossed high threshold.`,
    metrics: {
      checked: totalChecked,
      warned,
      highWarned,
    },
  };
}
