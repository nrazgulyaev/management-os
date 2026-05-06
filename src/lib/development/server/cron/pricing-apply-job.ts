import "server-only";

import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { villas } from "@/lib/db/schema/projects";
import {
  pricingRules,
  unitPriceSnapshots,
} from "@/lib/db/schema/sales";
import { unitDevelopmentMeta } from "@/lib/db/schema/development";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";
import { calculatePrice } from "../pricing-helpers";

const FX_FALLBACK_USD_TO_IDR = 16500;

/**
 * For every active pricing rule, compute the current price for every
 * unit in the project and write a snapshot when the price actually
 * changed.
 *
 * Idempotent guarantee: if a snapshot already exists today for the same
 * villa from the same rule (`triggered_by='time_elapsed'` or
 * `'progress_change'`), we skip. The cron can run twice in one day
 * without producing duplicate rows.
 */
export async function runDevOsPricingApply(
  handle: JobRunHandle,
): Promise<JobOutcome> {
  const db = getDb();
  if (!db) {
    return {
      status: "failed",
      summary: "Database is not configured.",
      metrics: { rulesEvaluated: 0 },
      error: "DB unavailable",
    };
  }

  const rules = await db
    .select()
    .from(pricingRules)
    .where(eq(pricingRules.isActive, true));

  let snapshotsWritten = 0;
  let unitsEvaluated = 0;
  let rulesSkippedManual = 0;

  for (const rule of rules) {
    if (rule.ruleType === "manual") {
      rulesSkippedManual += 1;
      continue;
    }

    const projectVillas = await db
      .select({
        id: villas.id,
        meta: unitDevelopmentMeta,
      })
      .from(villas)
      .leftJoin(
        unitDevelopmentMeta,
        eq(unitDevelopmentMeta.villaId, villas.id),
      )
      .where(eq(villas.projectId, rule.projectId));

    const ruleStartedAt = rule.escalationStartValue
      ? new Date(rule.escalationStartValue)
      : (rule.createdAt as Date);

    for (const v of projectVillas) {
      unitsEvaluated += 1;
      const calc = calculatePrice({
        rule: {
          id: rule.id,
          projectId: rule.projectId,
          ruleType: rule.ruleType as "time_based" | "progress_based" | "manual",
          basePriceUsdMinor: rule.basePriceUsdMinor,
          escalationPercent: Number(rule.escalationPercent),
          escalationFrequency:
            rule.escalationFrequency as
              | "monthly"
              | "per_5_progress_pct"
              | "per_10_progress_pct"
              | "per_milestone"
              | null,
          escalationStartTrigger: rule.escalationStartTrigger as
            | "sales_start"
            | "construction_start"
            | "fixed_date",
          escalationStartValue: rule.escalationStartValue,
          ceilingPriceUsdMinor: rule.ceilingPriceUsdMinor,
          isActive: rule.isActive,
          notes: rule.notes,
        },
        locationCoefficient: v.meta?.locationCoefficient
          ? Number(v.meta.locationCoefficient)
          : 1,
        constructionProgressPct: v.meta?.constructionProgressPercent
          ? Number(v.meta.constructionProgressPercent)
          : 0,
        ruleStartedAt,
        now: new Date(),
      });

      // Idempotency: skip if today's snapshot for this villa from this trigger
      // already exists.
      const startOfToday = new Date();
      startOfToday.setUTCHours(0, 0, 0, 0);
      const triggerKind =
        rule.ruleType === "time_based" ? "time_elapsed" : "progress_change";
      const existingToday = await db
        .select({ id: unitPriceSnapshots.id })
        .from(unitPriceSnapshots)
        .where(
          and(
            eq(unitPriceSnapshots.villaId, v.id),
            eq(unitPriceSnapshots.triggeredBy, triggerKind),
            gte(unitPriceSnapshots.snapshotDate, startOfToday),
          ),
        )
        .limit(1);
      if (existingToday.length > 0) continue;

      // Skip if price is unchanged from latest snapshot.
      const latestSnap = await db
        .select({
          priceUsdMinor: unitPriceSnapshots.priceUsdMinor,
        })
        .from(unitPriceSnapshots)
        .where(eq(unitPriceSnapshots.villaId, v.id))
        .orderBy(sql`${unitPriceSnapshots.snapshotDate} desc`)
        .limit(1);
      const lastPrice = latestSnap[0]?.priceUsdMinor;
      if (lastPrice !== undefined && lastPrice === calc.finalPriceUsdMinor) {
        continue;
      }

      const fxRate = FX_FALLBACK_USD_TO_IDR;
      await db.insert(unitPriceSnapshots).values({
        villaId: v.id,
        priceUsdMinor: calc.finalPriceUsdMinor,
        priceIdrMinor: BigInt(
          Math.round(Number(calc.finalPriceUsdMinor) * fxRate),
        ),
        fxRateUsdToIdr: String(fxRate),
        priceBasis: "rule_calculated",
        triggeredBy: triggerKind,
        changeAmountUsdMinor:
          lastPrice !== undefined ? calc.finalPriceUsdMinor - lastPrice : null,
        notes: `Auto from pricing rule (${rule.ruleType}) on ${new Date()
          .toISOString()
          .slice(0, 10)}`,
      });
      snapshotsWritten += 1;

      await handle.event("info", "snapshot_written", {
        villaId: v.id,
        ruleId: rule.id,
        priceUsdMinor: calc.finalPriceUsdMinor.toString(),
      });
    }
  }

  return {
    status: "success",
    summary: `Evaluated ${unitsEvaluated} units across ${rules.length} rules; wrote ${snapshotsWritten} snapshots.`,
    metrics: {
      rulesEvaluated: rules.length,
      rulesSkippedManual,
      unitsEvaluated,
      snapshotsWritten,
    },
  };
}
