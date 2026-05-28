/**
 * Phase 2.4 mgmt-03 — turnover-monitor agent (stub).
 *
 * Live agent. Tracks cleaning progress vs next check-in window;
 * fires alert when next check-in < 30min away AND cleaning < 100%.
 *
 * Today: stub. Production wiring will hook a 60s heartbeat into
 * the housekeeping mobile app's progress events.
 */

export interface TurnoverMonitorInput {
  organizationId: string;
  /** Now override for testing. */
  now?: string;
}

export interface TurnoverMonitorOutput {
  alerts: { villaId: string; severity: "warn" | "p1"; message: string }[];
}

export async function run(_input: TurnoverMonitorInput): Promise<TurnoverMonitorOutput> {
  return { alerts: [] };
}

export const TURNOVER_MONITOR_AGENT = {
  agentCode: "turnover-monitor",
  cron: "* * * * *",
  description: "Per-minute scan for cleaning-vs-next-checkin SLA breach.",
} as const;
