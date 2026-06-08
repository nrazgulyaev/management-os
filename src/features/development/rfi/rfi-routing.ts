/**
 * RFI loop — pure routing + FSM logic (W3 RFI loop).
 *
 * Deliberately free of `server-only` / `getDb` so it is unit-testable
 * (pattern: src/features/finance/statement-anomaly-rules.ts). The DB-aware
 * router (src/features/ai-agents/projects/rfi-router.ts) and the server
 * actions import from here for the discipline→role map, the status FSM,
 * and the human-readable ref generator.
 */

import type { RfiDiscipline } from "@/lib/db/schema/rfis";

/** The rfis.discipline enum, mirrored for client-safe imports. */
export const RFI_DISCIPLINES: readonly RfiDiscipline[] = [
  "structural",
  "architectural",
  "mep",
  "finishes",
  "landscape",
  "civil",
  "other",
] as const;

export function isRfiDiscipline(value: string): value is RfiDiscipline {
  return (RFI_DISCIPLINES as readonly string[]).includes(value);
}

/**
 * RFI lifecycle status. Derived from the rfis row timestamps rather than a
 * stored column (the table predates this loop):
 *   - "open"     → respondedAt IS NULL AND resolvedAt IS NULL
 *   - "answered" → respondedAt IS NOT NULL AND resolvedAt IS NULL
 *   - "closed"   → resolvedAt IS NOT NULL
 */
export type RfiStatus = "open" | "answered" | "closed";

export interface RfiTimestamps {
  respondedAt: Date | string | null;
  resolvedAt: Date | string | null;
}

export function rfiStatus(row: RfiTimestamps): RfiStatus {
  if (row.resolvedAt) return "closed";
  if (row.respondedAt) return "answered";
  return "open";
}

/**
 * Allowed FSM transitions. The respond action drives open→answered; the
 * resolve action drives answered→closed (and open→closed when an operator
 * closes an RFI without a recorded answer). Re-opening a closed RFI is not
 * supported in v1.
 */
const FSM: Record<RfiStatus, readonly RfiStatus[]> = {
  open: ["answered", "closed"],
  answered: ["closed"],
  closed: [],
};

export function canTransition(from: RfiStatus, to: RfiStatus): boolean {
  return FSM[from].includes(to);
}

/**
 * Maps an RFI discipline to the project-team role(s) that should own the
 * reply, in priority order. Roles match the contact_roles.role taxonomy
 * used for project-scoped team members (architect / engineer / designer /
 * pm …). The PM is the universal fallback so an RFI is never orphaned.
 */
export const DISCIPLINE_TO_ROLES: Record<RfiDiscipline, readonly string[]> = {
  structural: ["engineer", "architect"],
  architectural: ["architect"],
  mep: ["engineer"],
  finishes: ["designer", "architect"],
  landscape: ["designer", "architect"],
  civil: ["engineer"],
  other: ["pm"],
};

/** Roles tried for every discipline as a last resort, after the specific map. */
export const FALLBACK_ROLES: readonly string[] = ["pm", "site_supervisor"];

/**
 * Returns the ordered list of contact_roles.role values to search for the
 * given discipline: the discipline-specific roles first, then the shared
 * PM / supervisor fallback, de-duplicated.
 */
export function routingRolesFor(discipline: RfiDiscipline): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of [...(DISCIPLINE_TO_ROLES[discipline] ?? []), ...FALLBACK_ROLES]) {
    if (!seen.has(r)) {
      seen.add(r);
      out.push(r);
    }
  }
  return out;
}

/**
 * Generates a human-readable RFI ref like "RFI-EV02-0014".
 * `projectCode` is upper-cased + stripped of non-alphanumerics; `seq` is the
 * 1-based count of existing RFIs on the project + 1, zero-padded to 4.
 */
export function makeRfiRef(projectCode: string, seq: number): string {
  const code = (projectCode || "PRJ").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) || "PRJ";
  return `RFI-${code}-${String(seq).padStart(4, "0")}`;
}
