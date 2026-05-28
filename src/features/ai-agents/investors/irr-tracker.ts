/**
 * Phase 2.4 dev-03 — irr-tracker agent (stub).
 *
 * Weekly cron. Recomputes gross / net IRR + MOIC / DPI / TVPI per
 * LP and at fund level. Uses src/features/investors/irr-tracker.ts
 * for the XIRR math.
 */

export interface IrrTrackerInput {
  organizationId: string;
  fundId?: string;
}

export interface IrrTrackerOutput {
  positionsRefreshed: number;
}

export async function run(_input: IrrTrackerInput): Promise<IrrTrackerOutput> {
  return { positionsRefreshed: 0 };
}

export const IRR_TRACKER_AGENT = {
  agentCode: "irr-tracker",
  cron: "0 6 * * 1",
  description: "Weekly Mon 06:00 IRR/MOIC/DPI/TVPI refresh per LP + fund.",
} as const;
