/**
 * Phase 2.4 dev-02 — stage-stale-watcher agent (stub).
 *
 * Daily scan: any lead stuck in a non-terminal stage > 14d gets
 * a "stuck" badge on the kanban + a suggested action (call /
 * tour / re-qualify). Hard cap 30d → auto-move to lost (still
 * audit-logged with reason "stale").
 */

export interface StageStaleWatcherInput {
  organizationId: string;
}

export interface StageStaleWatcherOutput {
  flagged: number;
  autoLost: number;
}

export async function run(_input: StageStaleWatcherInput): Promise<StageStaleWatcherOutput> {
  return { flagged: 0, autoLost: 0 };
}

export const STAGE_STALE_WATCHER_AGENT = {
  agentCode: "stage-stale-watcher",
  cron: "0 5 * * *",
  description: "Daily 05:00 scan for leads stuck > 14d in non-terminal stages.",
} as const;
