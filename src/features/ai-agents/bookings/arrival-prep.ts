/**
 * Phase 2.2 mgmt-01 — arrival-prep agent (stub).
 *
 * Hourly cron. Walks bookings with check-in within the next 24h
 * and writes an `arrival_prep_checklist` row (room ready / chef
 * notified / driver assigned / welcome message sent). The booking
 * detail's Stay Details card reads from this table to surface the
 * prep status next to the check-in time.
 */

export interface ArrivalPrepInput {
  organizationId: string;
}

export interface ArrivalPrepFlag {
  bookingId: string;
  flag: "room" | "chef" | "driver" | "welcome";
  /** "pending" | "ready" | "blocked". */
  status: "pending" | "ready" | "blocked";
  note?: string;
}

export interface ArrivalPrepOutput {
  scanned: number;
  flags: ArrivalPrepFlag[];
}

export async function run(_input: ArrivalPrepInput): Promise<ArrivalPrepOutput> {
  return { scanned: 0, flags: [] };
}

export const ARRIVAL_PREP_AGENT = {
  agentCode: "arrival-prep",
  cron: "0 * * * *",
  description: "Hourly scan of upcoming arrivals; writes room/chef/driver/welcome flags into the prep checklist.",
} as const;
