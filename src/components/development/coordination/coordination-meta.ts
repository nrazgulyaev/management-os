/**
 * Coordination registry metadata — pure, client-safe helpers shared by the
 * coordination page (server, KPI strip) and the board (client, filter tabs +
 * row metadata). No "use client" / "server-only": importable from both sides.
 *
 * "Active" is derived from the three existing state machines:
 *   - RFI (features/development/rfi/rfi-routing):
 *       open → answered → closed. Terminal: closed.
 *   - Submittal (features/development/coordination/coordination-model):
 *       open → submitted → under_review →
 *       {approved | approved_as_noted | revise_resubmit | rejected} → closed.
 *       revise_resubmit loops back to under_review so it stays active; the
 *       decided states (approved / approved_as_noted / rejected) have only
 *       "closed" left and count as resolved.
 *   - Defect (lib/development/server/qa-qc/qa-qc-helpers):
 *       open → assigned → in_progress → ready_for_reinspection →
 *       {accepted | rejected → in_progress (rework loop)} → closed.
 *       rejected re-enters the rework loop so it stays active;
 *       accepted/closed are resolved (mirrors countOpenIssuesByProject's
 *       NOT IN ('accepted','closed')).
 */

import type {
  CoordinationItemKind,
  CoordinationItemSummary,
} from "@/features/development/coordination/coordination-model";

export const ACTIVE_COORDINATION_STATUSES: Record<
  CoordinationItemKind,
  readonly string[]
> = {
  rfi: ["open", "answered"],
  submittal: ["open", "submitted", "under_review", "revise_resubmit"],
  defect: [
    "open",
    "assigned",
    "in_progress",
    "ready_for_reinspection",
    "rejected",
  ],
};

export function isActiveCoordinationStatus(
  kind: CoordinationItemKind,
  status: string,
): boolean {
  return ACTIVE_COORDINATION_STATUSES[kind].includes(status);
}

/**
 * Registry row = the unified item summary plus the metadata columns that
 * actually exist per kind:
 *   - assigneeName — defect: assigned_to app user · rfi: routed_to contact.
 *     submittals carry no assignee/ball-in-court column → always null.
 *   - dueDate — only qa_qc_issues has a due column (deadline_at) → defects only.
 *   - severity — defects only ('low' | 'medium' | 'high' | 'critical').
 */
export interface CoordinationItemRow extends CoordinationItemSummary {
  assigneeName: string | null;
  /** ISO yyyy-mm-dd (pg date column). */
  dueDate: string | null;
  severity: string | null;
  /** Non-terminal per the kind's state machine (see above). */
  active: boolean;
}

/** Overdue = past its due date while the item is still active. */
export function isOverdueCoordinationItem(
  item: Pick<CoordinationItemRow, "dueDate" | "active">,
  todayIso: string,
): boolean {
  return item.active && item.dueDate != null && item.dueDate < todayIso;
}

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}
