/**
 * Phase 2.2 mgmt-04 — turnover-allocator agent (stub).
 *
 * Cron every 90s. Reads today's turnovers + cleaner roster +
 * geographic clusters + workload-to-date, assigns each unassigned
 * turnover to the best-fit cleaner. Writes the assignment + a
 * one-line rationale into the turnover record.
 *
 * Real-world the cron is 90s because turnover state churns
 * quickly during the 10:00–14:00 window — cleaners finish, new
 * arrivals get added, etc.
 */

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

export async function run(_input: TurnoverAllocatorInput): Promise<TurnoverAllocatorOutput> {
  return { assigned: [], unassignable: [] };
}

export const TURNOVER_ALLOCATOR_AGENT = {
  agentCode: "turnover-allocator",
  cron: "*/90 * * * * *",
  description: "Runs every 90s during the turnover window; assigns cleaners by geography + workload.",
} as const;
