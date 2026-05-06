/**
 * Stage 4.C.1 — Pure helpers for QA/QC issue lifecycle.
 *
 * No I/O, no `import "server-only"`. Runtime testable.
 *
 * The state machine:
 *   open ─┬─→ assigned ─→ in_progress ─→ ready_for_reinspection
 *         │                                  ├─→ rejected ─→ in_progress (rework loop)
 *         │                                  └─→ accepted ─→ closed
 *         └─→ closed (operator force-close, e.g. duplicate)
 *
 * Skipping states or moving backwards is rejected.
 */

export type QaQcStatus =
  | "open"
  | "assigned"
  | "in_progress"
  | "ready_for_reinspection"
  | "rejected"
  | "accepted"
  | "closed";

export const QA_QC_VALID_TRANSITIONS: Record<QaQcStatus, QaQcStatus[]> = {
  open: ["assigned", "closed"], // closed only as force-close (duplicate, etc.)
  assigned: ["in_progress", "open", "closed"], // un-assign back, or close
  in_progress: ["ready_for_reinspection", "assigned", "closed"],
  ready_for_reinspection: ["accepted", "rejected", "closed"],
  rejected: ["in_progress"], // rework loop
  accepted: ["closed"], // close after acceptance
  closed: [], // terminal
};

export function isValidQaQcTransition(
  from: QaQcStatus,
  to: QaQcStatus,
): boolean {
  return QA_QC_VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertValidQaQcTransition(
  from: QaQcStatus,
  to: QaQcStatus,
): void {
  if (!isValidQaQcTransition(from, to)) {
    throw new Error(`qa_qc: cannot transition from '${from}' to '${to}'`);
  }
}

export type QaQcSeverity = "low" | "medium" | "high" | "critical";

export const SEVERITY_SCORE: Record<QaQcSeverity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

/**
 * Compute a heatmap value per villa: total severity score across open issues.
 * Higher = more attention needed. Closed/accepted issues drop out.
 */
export function computeVillaSeverityScore(
  issues: Array<{ villaId: string | null; severity: QaQcSeverity; status: QaQcStatus }>,
  villaId: string,
): number {
  return issues
    .filter(
      (i) =>
        i.villaId === villaId &&
        !["accepted", "closed"].includes(i.status),
    )
    .reduce((acc, i) => acc + (SEVERITY_SCORE[i.severity] ?? 0), 0);
}
