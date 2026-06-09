/**
 * Lead pipeline stage machine — pure, guarded FSM for the SALES funnel.
 *
 * No `import "server-only"`, no I/O: client components (the Kanban board) and
 * node:test specs can both import it. The server action `moveLeadStage`
 * enforces the same rules server-side; this module is the single source of
 * truth for which stage moves are legal.
 *
 * The funnel order (linear core) is:
 *   new → contacted → qualified → viewing_scheduled → viewing_completed →
 *   negotiation → reservation → contract_pending → contract_signed
 *
 * On top of the linear path we allow:
 *   - ONE step forward or ONE step backward along the core path (no skipping
 *     ahead — a card can't jump new → negotiation in a single drag),
 *   - dropping to `lost` or `cold` from any non-terminal active stage
 *     (off-ramps), and
 *   - re-entering the funnel from `cold` back to `new`/`contacted` (re-warm).
 *
 * `contract_signed` and `lost` are terminal — the existing `updateLeadStatus`
 * action stamps `ended_at`/`end_reason` for those, and the FSM blocks any
 * further moves out of them.
 */

import {
  LEAD_STATUSES,
  type LeadStatus,
} from "./leads-constants";

/**
 * The linear "core" funnel, in order. Off-ramp stages (`lost`, `cold`) are not
 * part of the core path — they're handled by the transition map below.
 */
export const LEAD_FUNNEL_ORDER: LeadStatus[] = [
  "new",
  "contacted",
  "qualified",
  "viewing_scheduled",
  "viewing_completed",
  "negotiation",
  "reservation",
  "contract_pending",
  "contract_signed",
];

/** Off-ramp / re-warm stages that sit outside the linear core. */
export const LEAD_OFFRAMP_STAGES: LeadStatus[] = ["lost", "cold"];

/** Terminal stages — no moves are allowed out of them. */
export const LEAD_TERMINAL_STAGES: LeadStatus[] = ["contract_signed", "lost"];

function coreIndex(status: LeadStatus): number {
  return LEAD_FUNNEL_ORDER.indexOf(status);
}

/**
 * Build the allowed-transition adjacency map once. Kept as a derived constant
 * so the UI can grey-out / reject illegal drops without re-deriving each call.
 */
export const LEAD_STAGE_TRANSITIONS: Record<LeadStatus, LeadStatus[]> =
  buildTransitions();

function buildTransitions(): Record<LeadStatus, LeadStatus[]> {
  const map = {} as Record<LeadStatus, LeadStatus[]>;
  for (const status of LEAD_STATUSES) map[status] = [];

  for (const status of LEAD_FUNNEL_ORDER) {
    const i = coreIndex(status);
    const targets: LeadStatus[] = [];
    // One step forward.
    const next = LEAD_FUNNEL_ORDER[i + 1];
    if (next) targets.push(next);
    // One step backward (re-open / correct a mistaken advance).
    const prev = LEAD_FUNNEL_ORDER[i - 1];
    if (prev) targets.push(prev);
    // Off-ramps from any non-terminal active stage.
    if (status !== "contract_signed") {
      targets.push("lost", "cold");
    }
    map[status] = targets;
  }

  // `cold` can be re-warmed back into the early funnel.
  map.cold = ["new", "contacted", "lost"];
  // `lost` and `contract_signed` are terminal — no outgoing moves.
  map.lost = [];
  map.contract_signed = [];

  return map;
}

export function isValidLeadTransition(
  from: LeadStatus,
  to: LeadStatus,
): boolean {
  if (from === to) return false;
  return LEAD_STAGE_TRANSITIONS[from]?.includes(to) ?? false;
}

export function leadTransitionError(
  from: LeadStatus,
  to: LeadStatus,
): string | null {
  if (from === to) return "Lead is already in that stage.";
  if (LEAD_TERMINAL_STAGES.includes(from)) {
    return `'${from}' is a closed stage — re-open the lead before moving it.`;
  }
  if (!isValidLeadTransition(from, to)) {
    return `Cannot move a lead from '${from}' to '${to}'. Stages advance one step at a time.`;
  }
  return null;
}

export function isLeadStatus(value: string): value is LeadStatus {
  return (LEAD_STATUSES as readonly string[]).includes(value);
}
