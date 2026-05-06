/**
 * Pure constants for the Sales workspace.
 *
 * Lives in its own module (no `server-only` import) so node:test specs can
 * import it without dragging in the database client.
 */

export const LEAD_STATUSES = [
  "new",
  "contacted",
  "qualified",
  "viewing_scheduled",
  "viewing_completed",
  "negotiation",
  "reservation",
  "contract_pending",
  "contract_signed",
  "lost",
  "cold",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  viewing_scheduled: "Viewing scheduled",
  viewing_completed: "Viewing completed",
  negotiation: "Negotiation",
  reservation: "Reservation",
  contract_pending: "Contract pending",
  contract_signed: "Contract signed",
  lost: "Lost",
  cold: "Cold",
};
