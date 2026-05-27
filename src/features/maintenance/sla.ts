/**
 * Phase 2.2 mgmt-04 — Maintenance SLA computation.
 *
 * Pure function. Compares the age of an open ticket against its
 * priority's target window:
 *
 *   P0 → 2 hours
 *   P1 → 8 hours
 *   P2 → 48 hours
 *   P3 → 14 days
 *
 * Status mapping:
 *   on-track  age < 60% of target
 *   at-risk   60–99% of target
 *   breached  ≥ 100% of target
 *
 * `sla_breaches` row is created when a ticket crosses the breached
 * threshold (data PR).
 */

export type SlaStatus = "on-track" | "at-risk" | "breached";
export type TicketPriority = "P0" | "P1" | "P2" | "P3";

export const SLA_TARGET_MS: Record<TicketPriority, number> = {
  P0: 2 * 60 * 60 * 1000, // 2h
  P1: 8 * 60 * 60 * 1000, // 8h
  P2: 48 * 60 * 60 * 1000, // 48h
  P3: 14 * 24 * 60 * 60 * 1000, // 14d
};

export interface SlaInput {
  priority: TicketPriority;
  /** ISO timestamp when the ticket was opened. */
  openedAt: string;
  /** ISO timestamp when the ticket was resolved (closes the SLA). */
  resolvedAt?: string | null;
  /** Override "now" for testing. */
  now?: Date;
}

export interface SlaResult {
  status: SlaStatus;
  /** Age in ms (capped to target if resolved on time). */
  ageMs: number;
  /** Target window in ms. */
  targetMs: number;
  /** 0..n — pct of target consumed. */
  pct: number;
  /** ms remaining until breach (negative if already breached). */
  remainingMs: number;
}

export function computeSlaStatus(input: SlaInput): SlaResult {
  const target = SLA_TARGET_MS[input.priority];
  const now = input.now ?? new Date();
  const opened = new Date(input.openedAt).getTime();
  const end = input.resolvedAt ? new Date(input.resolvedAt).getTime() : now.getTime();
  const ageMs = end - opened;
  const pct = (ageMs / target) * 100;
  const remainingMs = target - ageMs;
  let status: SlaStatus = "on-track";
  if (pct >= 100) status = "breached";
  else if (pct >= 60) status = "at-risk";
  return { status, ageMs, targetMs: target, pct, remainingMs };
}
