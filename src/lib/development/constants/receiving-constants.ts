/**
 * Pure constants for the warehouse receiving workbench. No server imports
 * — safe for both client form + server route. The decision enum mirrors
 * the CHECK-free `decision` text column on material_receiving_holds
 * (migration 0133).
 */

import type { ReceivingDecision } from "@/lib/db/schema/material-receiving-holds";

export const RECEIVING_DECISION_LABEL: Record<ReceivingDecision, string> = {
  accept_partial: "Accept partial",
  wait_back_order: "Wait for back-order",
  return_whole: "Return whole",
  escalate_procurement: "Escalate to procurement",
};

export const RECEIVING_DECISION_HINT: Record<ReceivingDecision, string> = {
  accept_partial:
    "Take what arrived in spec; the shortfall stays open against the PO.",
  wait_back_order:
    "Hold receipt — the vendor confirmed the balance ships later.",
  return_whole:
    "Reject the whole drop (wrong spec / damaged) — nothing enters stock.",
  escalate_procurement:
    "Hand off to procurement for a vendor decision or claim.",
};

/** Badge tone per decision (matches @/components/ui/badge tones). */
export const RECEIVING_DECISION_TONE: Record<
  ReceivingDecision,
  "success" | "warning" | "danger" | "info"
> = {
  accept_partial: "success",
  wait_back_order: "warning",
  return_whole: "danger",
  escalate_procurement: "info",
};

export const RECEIVING_HOLD_STATUS_TONE: Record<
  "open" | "resolved" | "cancelled",
  "warning" | "success" | "neutral"
> = {
  open: "warning",
  resolved: "success",
  cancelled: "neutral",
};
