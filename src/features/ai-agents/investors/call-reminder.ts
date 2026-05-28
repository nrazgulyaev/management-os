/**
 * Phase 2.4 dev-03 — call-reminder agent (stub).
 *
 * D-3 before each capital_calls.due_at, sends a gentle reminder to
 * any LP whose call_allocations.settled_at is still null. Hourly
 * scan so reminders fire close to local-business hours.
 */

export interface CallReminderInput {
  organizationId: string;
}

export interface CallReminderOutput {
  remindersSent: number;
}

export async function run(_input: CallReminderInput): Promise<CallReminderOutput> {
  return { remindersSent: 0 };
}

export const CALL_REMINDER_AGENT = {
  agentCode: "call-reminder",
  cron: "0 * * * *",
  description: "Hourly D-3 reminder for unsettled call_allocations.",
} as const;
