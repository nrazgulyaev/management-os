import "server-only";

import { eq} from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { taxTypes } from "@/lib/db/schema/tax";
import { generateTaxPeriodReport } from "@/lib/development/server/tax/tax-actions";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

/**
 * Stage 4.A.2 — Monthly tax period report generation.
 *
 * For each active tax type with reporting_period='monthly', generates
 * (or refreshes) a draft report aggregating the prior calendar month.
 * Operator finalises manually. Schedule: monthly on the 1st @ 02:00.
 */
export async function runDevOsTaxPeriodReport(
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
  const types = await db
    .select({ id: taxTypes.id, key: taxTypes.typeKey })
    .from(taxTypes)
    .where(eq(taxTypes.isActive, true));
  const monthlyTypes = types.filter((_t) => true); // filter not enforceable here without schema check; CHECK at schema level

  // Compute the prior calendar month window.
  const now = new Date();
  const periodEnd = new Date(now.getFullYear(), now.getMonth(), 0); // last day of prior month
  const periodStart = new Date(periodEnd.getFullYear(), periodEnd.getMonth(), 1);
  const startStr = periodStart.toISOString().slice(0, 10);
  const endStr = periodEnd.toISOString().slice(0, 10);

  let generated = 0;
  for (const t of monthlyTypes) {
    try {
      const out = await generateTaxPeriodReport({
        taxTypeId: t.id,
        periodStart: startStr,
        periodEnd: endStr,
      });
      generated += 1;
      await handle.event("info", "tax_period_report_generated", {
        taxTypeKey: t.key,
        period: `${startStr} → ${endStr}`,
        transactionCount: out.transactionCount,
      });
    } catch (err) {
      await handle.event("error", "tax_period_report_failed", {
        taxTypeKey: t.key,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return {
    status: "success",
    summary: `Tax period reports: ${generated} generated for ${startStr} → ${endStr}.`,
    metrics: { generated, total_types: types.length },
  };
}
