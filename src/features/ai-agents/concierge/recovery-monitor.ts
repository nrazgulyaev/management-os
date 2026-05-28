/**
 * Phase 2.4 mgmt-04 — recovery-monitor agent (stub).
 *
 * Critical UX rule 3: URGENT-tagged requests must get a human
 * response within 30 minutes. The recovery-monitor walks open
 * URGENT requests every 5 minutes and escalates anything past the
 * SLA threshold into the manager bell + opens a P1 ticket.
 *
 * Reuses evaluateEscalation() from src/features/concierge/escalation.ts.
 */

export interface RecoveryMonitorInput {
  organizationId: string;
  now?: string;
}

export interface RecoveryMonitorOutput {
  escalatedRequestIds: string[];
}

export async function run(_input: RecoveryMonitorInput): Promise<RecoveryMonitorOutput> {
  return { escalatedRequestIds: [] };
}

export const RECOVERY_MONITOR_AGENT = {
  agentCode: "recovery-monitor",
  cron: "*/5 * * * *",
  description: "Every 5 minutes; escalates URGENT requests unresponsive > 30 min.",
} as const;
