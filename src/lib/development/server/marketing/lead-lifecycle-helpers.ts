/**
 * Marketing `leads` lifecycle FSM helpers — a PLAIN module (no
 * "use server", no server-only) so both the server action and the client
 * lifecycle control can import the transition rules. Distinct from the
 * contact_roles sales funnel; the order mirrors the qualified/reservation
 * buckets in marketing-summary-queries.
 */

export const LEAD_LIFECYCLE_STATUSES = [
  "lead",
  "qualified",
  "hot",
  "reservation",
  "contract",
] as const;

export type LeadLifecycleStatus =
  | (typeof LEAD_LIFECYCLE_STATUSES)[number]
  | "lost"
  | "disqualified";

export const ALL_LEAD_LIFECYCLE_STATUSES = [
  ...LEAD_LIFECYCLE_STATUSES,
  "lost",
  "disqualified",
] as const;

// Forward funnel order; "lost"/"disqualified" are reachable from any
// non-terminal stage.
const ORDER: Record<string, number> = {
  lead: 0,
  qualified: 1,
  hot: 2,
  reservation: 3,
  contract: 4,
};

export function isTerminalLifecycle(status: string): boolean {
  return (
    status === "contract" || status === "lost" || status === "disqualified"
  );
}

/** Valid next states from a given lifecycle status (single forward step
 *  + the two close-out states). */
export function nextLifecycleStatuses(current: string): LeadLifecycleStatus[] {
  if (isTerminalLifecycle(current)) return [];
  const idx = ORDER[current];
  const out: LeadLifecycleStatus[] = [];
  if (idx != null && idx < 4) {
    const forward = (LEAD_LIFECYCLE_STATUSES as readonly string[])[idx + 1];
    if (forward) out.push(forward as LeadLifecycleStatus);
  }
  out.push("lost", "disqualified");
  return out;
}
