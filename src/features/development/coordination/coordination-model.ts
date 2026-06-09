/**
 * Coordination cabinet — pure helpers (client-safe, no `server-only`).
 *
 * Unifies three pre-existing item kinds over one drawing-pin model:
 *   - rfi      → src/lib/db/schema/rfis (status derived from timestamps)
 *   - submittal→ src/lib/db/schema/submittals (explicit status column)
 *   - defect   → src/lib/db/schema/qa_qc_issues (explicit status column)
 *
 * Importable from client components (the pin canvas + item drawer) for the
 * kind/status taxonomy, tone mapping, and the submittal FSM. DB-aware code
 * lives in src/lib/development/server/coordination/*.
 */

import type { CoordinationItemKind } from "@/lib/db/schema/coordination";
import {
  SUBMITTAL_STATUSES,
  type SubmittalStatus,
} from "@/lib/db/schema/submittals";

export type { CoordinationItemKind };
export { SUBMITTAL_STATUSES };
export type { SubmittalStatus };

export const COORDINATION_KINDS: readonly CoordinationItemKind[] = [
  "rfi",
  "submittal",
  "defect",
] as const;

export const KIND_LABEL: Record<CoordinationItemKind, string> = {
  rfi: "RFI",
  submittal: "Submittal",
  defect: "Defect",
};

/** Pin marker color per kind — matches the cream/stone/ink token family. */
export const KIND_COLOR: Record<CoordinationItemKind, string> = {
  rfi: "#a06a1a", // ochre
  submittal: "#0e3b2e", // forest
  defect: "#a43e2f", // terra
};

export type BadgeTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "accent";

/**
 * Submittal FSM. open → submitted → under_review →
 * {approved | approved_as_noted | revise_resubmit | rejected}; revise_resubmit
 * loops back to under_review; anything may be closed. Re-opening is not v1.
 */
const SUBMITTAL_FSM: Record<SubmittalStatus, readonly SubmittalStatus[]> = {
  open: ["submitted", "closed"],
  submitted: ["under_review", "closed"],
  under_review: [
    "approved",
    "approved_as_noted",
    "revise_resubmit",
    "rejected",
    "closed",
  ],
  approved: ["closed"],
  approved_as_noted: ["closed"],
  revise_resubmit: ["under_review", "closed"],
  rejected: ["closed"],
  closed: [],
};

export function canTransitionSubmittal(
  from: SubmittalStatus,
  to: SubmittalStatus,
): boolean {
  return SUBMITTAL_FSM[from].includes(to);
}

export function nextSubmittalStatuses(
  from: SubmittalStatus,
): readonly SubmittalStatus[] {
  return SUBMITTAL_FSM[from];
}

export function submittalStatusTone(status: SubmittalStatus): BadgeTone {
  switch (status) {
    case "approved":
    case "approved_as_noted":
      return "success";
    case "rejected":
      return "danger";
    case "revise_resubmit":
      return "warning";
    case "under_review":
    case "submitted":
      return "info";
    case "closed":
      return "neutral";
    case "open":
    default:
      return "warning";
  }
}

/** Generates a human-readable submittal ref like "SUB-EV02-0007". */
export function makeSubmittalRef(projectCode: string, seq: number): string {
  const code =
    (projectCode || "PRJ").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) ||
    "PRJ";
  return `SUB-${code}-${String(seq).padStart(4, "0")}`;
}

/** A unified item summary for the registry list, regardless of kind. */
export interface CoordinationItemSummary {
  kind: CoordinationItemKind;
  /** Underlying row id (rfi/submittal/defect). */
  id: string;
  ref: string;
  title: string;
  /** Human status label. */
  status: string;
  statusTone: BadgeTone;
  discipline: string | null;
  /** The pin id, if this item is pinned on the active revision. */
  pinId: string | null;
  xPct: number | null;
  yPct: number | null;
  createdAt: Date | string | null;
}
