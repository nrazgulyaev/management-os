/**
 * Display constants for the procurement commitments (PO) ledger
 * (`dev_commitments_ledger`). Distinct from investor `COMMITMENT_STATUS_*`
 * in investor-constants.ts — these are vendor-PO lifecycle states.
 */

export type CommitmentLedgerStatus =
  | "open"
  | "partially_paid"
  | "completed"
  | "cancelled";

export const COMMITMENT_LEDGER_STATUS_LABEL: Record<
  CommitmentLedgerStatus,
  string
> = {
  open: "Open",
  partially_paid: "Partially paid",
  completed: "Completed",
  cancelled: "Cancelled",
};

/** Badge tone per status (matches the unit's spec). */
export type BadgeTone =
  | "neutral"
  | "success"
  | "warning"
  | "info"
  | "danger"
  | "gold";

export function commitmentLedgerStatusTone(status: string): BadgeTone {
  switch (status) {
    case "open":
      return "warning";
    case "partially_paid":
      return "info";
    case "completed":
      return "success";
    case "cancelled":
      return "neutral";
    default:
      return "neutral";
  }
}
