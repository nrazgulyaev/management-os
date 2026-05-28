/**
 * Phase 2.4 mgmt-03 — visa-watcher agent (stub).
 *
 * Daily cron. Walks `guest_ids` + active bookings; emits a
 * `visa_flags` row for:
 *   - VOA expiring within 30d
 *   - Detected overstay (today > visa_until)
 *   - KITAS missing for long-stay non-Indonesian
 *
 * Severity heuristic: overstay = p1, everything else = warn.
 */

export interface VisaWatcherInput {
  organizationId: string;
}

export interface VisaWatcherOutput {
  flagsCreated: number;
  flagsResolved: number;
}

export async function run(_input: VisaWatcherInput): Promise<VisaWatcherOutput> {
  return { flagsCreated: 0, flagsResolved: 0 };
}

export const VISA_WATCHER_AGENT = {
  agentCode: "visa-watcher",
  cron: "0 7 * * *",
  description: "Daily 07:00 scan; flags VOA-expiring, overstay, KITAS gaps.",
} as const;
