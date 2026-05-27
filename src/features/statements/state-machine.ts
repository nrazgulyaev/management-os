/**
 * Phase 2.2 mgmt-02 — Owner statement state machine.
 *
 * States:
 *   draft           ← preparer just saved; preparer or accountant can edit
 *   draft_revised   ← Director rejected; preparer rebuilds
 *   approved        ← Director signed off; hash sealed; ready to send
 *   sent            ← emailed to owner; portal view unlocked; not yet settled
 *   settled         ← payout completed + external confirm received
 *
 * Roles (mirror of `permissions.ts`):
 *   preparer    can save, revise
 *   accountant  can save, revise, send (when approved)
 *   director    can approve, send, settle
 *   owner       read-only (only after "sent")
 */

export type StatementStatus =
  | "draft"
  | "draft_revised"
  | "approved"
  | "sent"
  | "settled";

export type StatementRole = "preparer" | "accountant" | "director" | "owner";

export interface ActionButton {
  id: string;
  label: string;
  /** Primary = green/accent; secondary = neutral; danger = destructive. */
  tone: "primary" | "secondary" | "danger";
  /** When true, button opens a modal vs firing immediately. */
  modal?: "approve" | "send" | "reject" | "settle";
}

export function canApprove(status: StatementStatus, role: StatementRole): boolean {
  if (role !== "director") return false;
  return status === "draft" || status === "draft_revised";
}

export function canSend(status: StatementStatus, role: StatementRole = "director"): boolean {
  if (role !== "director" && role !== "accountant") return false;
  return status === "approved";
}

export function canSettle(status: StatementStatus, externalConfirm: boolean): boolean {
  if (status !== "sent") return false;
  return externalConfirm === true;
}

export function getStatusActions(status: StatementStatus, role: StatementRole): ActionButton[] {
  switch (status) {
    case "draft":
    case "draft_revised":
      if (role === "director") {
        return [
          { id: "reject", label: "Reject", tone: "danger", modal: "reject" },
          { id: "hold", label: "Hold for review", tone: "secondary" },
          { id: "approve", label: "Approve", tone: "primary", modal: "approve" },
        ];
      }
      return [
        { id: "save", label: "Save draft", tone: "secondary" },
        { id: "submit", label: "Submit to Director", tone: "primary" },
      ];
    case "approved":
      if (role === "director" || role === "accountant") {
        return [
          { id: "preview", label: "Preview PDF", tone: "secondary" },
          { id: "send", label: "Send to owner", tone: "primary", modal: "send" },
        ];
      }
      return [{ id: "preview", label: "Preview PDF", tone: "secondary" }];
    case "sent":
      return [
        { id: "preview", label: "View PDF", tone: "secondary" },
        { id: "settle", label: "Mark settled", tone: "primary", modal: "settle" },
      ];
    case "settled":
      return [{ id: "preview", label: "View PDF", tone: "secondary" }];
  }
}
