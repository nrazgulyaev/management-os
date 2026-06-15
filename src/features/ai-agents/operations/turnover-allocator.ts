import "server-only";

/**
 * W4 mgmt-04 — turnover-allocator agent.
 *
 * Cron every 90s during the turnover window. Reads today's UNASSIGNED
 * turnovers + the cleaner roster (with each cleaner's load-to-date),
 * then assigns each turnover to the least-loaded cleaner and writes the
 * assignment + a one-line rationale back onto the turnover row.
 *
 * The who-gets-what decision lives in the pure, unit-testable
 * `allocateTurnovers()` (turnover-allocation-rules.ts); this module only
 * does the DB read/write around it. Deterministic: a re-run with the same
 * board state produces the same assignments, so the 90s cron is safe to
 * fire repeatedly.
 *
 * Real-world the cron is 90s because turnover state churns quickly during
 * the 10:00–14:00 window — cleaners finish, new arrivals get added, etc.
 */

import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { turnovers } from "@/lib/db/schema/turnovers";
import {
  allocateTurnovers,
  type AllocCleaner,
  type AllocTurnover,
} from "./turnover-allocation-rules";
import { getCleanerWorkloads } from "@/features/operations/turnover-queries";

export interface TurnoverAllocatorInput {
  organizationId: string;
}

export interface TurnoverAllocation {
  turnoverId: string;
  cleanerId: string;
  rationale: string;
}

export interface TurnoverAllocatorOutput {
  assigned: TurnoverAllocation[];
  unassignable: { turnoverId: string; reason: string }[];
}

export async function run(input: TurnoverAllocatorInput): Promise<TurnoverAllocatorOutput> {
  const db = getDb();
  if (!db) return { assigned: [], unassignable: [] };

  // 1) Today's UNASSIGNED turnovers, with next-booking date as the
  //    deadline used only to order ties deterministically.
  const pending = await db
    .select({
      id: turnovers.id,
      deadline: sql<string | null>`${turnovers.turnoverDate}::text`,
    })
    .from(turnovers)
    .where(and(eq(turnovers.turnoverDate, sql`CURRENT_DATE`), isNull(turnovers.assigneeUserId)))
    .orderBy(asc(turnovers.createdAt));

  if (pending.length === 0) return { assigned: [], unassignable: [] };

  // 2) Cleaner roster + load-to-date (reused from the read layer). This is a
  //    cron path with no request context, so pass the agent's explicit org
  //    (getCleanerWorkloads defaults to requireOrgId only for the page path).
  const workloads = await getCleanerWorkloads(input.organizationId);

  const cleaners: AllocCleaner[] = workloads.map((w) => ({
    id: w.id,
    name: w.name,
    currentLoad: w.currentLoad,
  }));
  const queue: AllocTurnover[] = pending.map((p) => ({ id: p.id, deadline: p.deadline }));

  // 3) Deterministic decision (pure).
  const result = allocateTurnovers(queue, cleaners);

  // 4) Persist each assignment + rationale.
  for (const a of result.assigned) {
    await db
      .update(turnovers)
      .set({
        assigneeUserId: a.cleanerId,
        assignmentRationale: a.rationale,
        updatedAt: new Date(),
      })
      .where(eq(turnovers.id, a.turnoverId));
  }

  return { assigned: result.assigned, unassignable: result.unassignable };
}

export const TURNOVER_ALLOCATOR_AGENT = {
  agentCode: "turnover-allocator",
  cron: "*/90 * * * * *",
  description: "Runs every 90s during the turnover window; assigns cleaners by workload (least-loaded).",
} as const;
