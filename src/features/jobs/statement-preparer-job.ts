/**
 * Packet C PR 3 — statement-preparer cron runner.
 *
 * 1st-of-month 06:00 UTC. For each organisation × owner without a
 * statement for the prior month, fire the statement-preparer agent.
 *
 * The agent body lives at src/features/ai-agents/statements/ —
 * `statement-preparer.ts` doesn't exist yet as a runnable module
 * (only the registry stub + the related `statement-anomaly.ts`).
 * Today this job walks the missing-statement set, logs each (org,
 * owner, period) triple, and emits a skipped/awaiting-agent
 * outcome. When the real agent ships, swap the inner branch for
 * its run() call.
 */

import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { owners } from "@/lib/db/schema/ownership";
import { ownerStatements } from "@/lib/db/schema/finance";
import { statementPeriods } from "@/lib/db/schema/finance";
import { withJobLock } from "./locks";
import type { JobOutcome, JobRunHandle } from "./runner";

/** ISO YYYY-MM for the prior calendar month, UTC anchored. */
function priorMonth(now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function runStatementPreparerJob(handle: JobRunHandle): Promise<JobOutcome> {
  const period = priorMonth();
  const lockResult = await withJobLock(`statement-preparer-${period}`, async () => {
    const db = getDb();
    if (!db) {
      await handle.event("warning", "No DB configured; statement-preparer skipped.");
      return { runs: 0, skipped: 0, errors: 0, missing: 0 } as const;
    }

    // Resolve the period row for the prior month.
    const [periodRow] = await db
      .select({ id: statementPeriods.id, label: statementPeriods.label })
      .from(statementPeriods)
      .where(
        and(
          sql`to_char(${statementPeriods.periodStart}, 'YYYY-MM') = ${period}`,
        ),
      )
      .limit(1);

    if (!periodRow) {
      await handle.event("info", `No statement_period for ${period}; nothing to prepare.`);
      return { runs: 0, skipped: 0, errors: 0, missing: 0 } as const;
    }

    // Active owners whose latest statement for this period is missing.
    // LEFT JOIN to owner_statements (period_id) and filter to rows where
    // the join produced NULL.
    const missing = await db
      .select({
        ownerId: owners.id,
        ownerName: owners.displayName,
      })
      .from(owners)
      .leftJoin(
        ownerStatements,
        and(
          eq(ownerStatements.ownerId, owners.id),
          eq(ownerStatements.periodId, periodRow.id),
        ),
      )
      .where(and(eq(owners.status, "active"), isNull(ownerStatements.id)))
      .limit(500);

    // `runs` stays 0 until the real agent body lands; using `const` to keep
    // the lint happy and make intent explicit.
    const runs = 0;
    let skipped = 0;
    let errors = 0;
    for (const m of missing) {
      try {
        // The agent body (runStatementPreparerAgent) doesn't exist as
        // a callable module yet. Log the missing triple so an operator
        // can see what would have been processed; the agent slot opens
        // here once src/features/ai-agents/statements/statement-preparer.ts
        // is implemented.
        await handle.event("info", `Statement missing: owner=${m.ownerName} period=${period}`, {
          ownerId: m.ownerId,
          periodId: periodRow.id,
          periodLabel: periodRow.label,
        });
        skipped += 1;
      } catch (err) {
        errors += 1;
        await handle.event("error", `statement-preparer failure: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return { runs, skipped, errors, missing: missing.length } as const;
  });

  if (!lockResult.ok) {
    const detail = lockResult.reason === "locked"
      ? `Lock held by ${lockResult.lockedBy ?? "another worker"}.`
      : lockResult.reason === "no_db"
        ? "No DB configured."
        : `Lock acquisition error: ${lockResult.error ?? "unknown"}`;
    return {
      status: "skipped",
      summary: detail,
      metrics: { reason: lockResult.reason },
    };
  }

  const m = lockResult.result;
  return {
    status: "success",
    summary: `period=${period} · missing=${m.missing} runs=${m.runs} skipped=${m.skipped} errors=${m.errors}`,
    metrics: { period, missing: m.missing, runs: m.runs, skipped: m.skipped, errors: m.errors },
  };
}
