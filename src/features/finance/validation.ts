import "server-only";

import { and, eq, lte, gte, inArray } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { statementPeriods } from "@/lib/db/schema/finance";

/**
 * Returns the matching closed/locked period for `date` if any. Used by
 * server actions before mutating ledger rows so the UI can refuse early.
 * The DB trigger is the hard line — this is a courtesy guard.
 */
export async function findLockingPeriod(
  db: DB,
  date: string,
): Promise<{ id: string; label: string; status: string } | null> {
  const [row] = await db
    .select({
      id: statementPeriods.id,
      label: statementPeriods.label,
      status: statementPeriods.status,
    })
    .from(statementPeriods)
    .where(
      and(
        inArray(statementPeriods.status, ["closed", "locked"]),
        lte(statementPeriods.periodStart, date),
        gte(statementPeriods.periodEnd, date),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function assertPeriodOpen(db: DB, date: string): Promise<void> {
  const conflict = await findLockingPeriod(db, date);
  if (conflict) {
    throw new Error(
      `Period locked: "${conflict.label}" is ${conflict.status}. Use a finance adjustment instead.`,
    );
  }
}

export interface PeriodLookup {
  id: string;
  periodStart: string;
  periodEnd: string;
  label: string;
  status: string;
}

export async function getPeriodById(db: DB, id: string): Promise<PeriodLookup | null> {
  const [r] = await db
    .select()
    .from(statementPeriods)
    .where(eq(statementPeriods.id, id))
    .limit(1);
  if (!r) return null;
  return {
    id: r.id,
    periodStart: r.periodStart,
    periodEnd: r.periodEnd,
    label: r.label,
    status: r.status,
  };
}
