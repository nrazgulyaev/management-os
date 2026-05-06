/**
 * Pure notification-template registry + transition mapper for owner
 * stays. NO `server-only` import — safe for tests, client components,
 * and the (server-only) `notifications.ts` consumer alike.
 */

export type OwnerStayTemplateKey =
  | "owner_stay.request_received"
  | "owner_stay.approved"
  | "owner_stay.rejected"
  | "owner_stay.cancelled"
  | "owner_stay.completed"
  | "owner_stay.relocation_pending"
  | "owner_stay.finance_bridged";

export interface OwnerStayTemplateCopy {
  title: string;
  /** Body uses Mustache-lite `{{var}}` placeholders. The v8B template
   *  engine substitutes from `payload`; the queue store keeps the values
   *  too so callers can inspect them. */
  body: string;
}

export const OWNER_STAY_TEMPLATE_COPY: Record<
  OwnerStayTemplateKey,
  OwnerStayTemplateCopy
> = {
  "owner_stay.request_received": {
    title: "Owner stay request received",
    body: "We've received your stay request for {{villa}} on {{checkIn}} → {{checkOut}}. We'll confirm availability and admin approval shortly.",
  },
  "owner_stay.approved": {
    title: "Owner stay approved",
    body: "Your stay at {{villa}} on {{checkIn}} → {{checkOut}} is approved. The estimated charges will appear on your statement after the stay completes.",
  },
  "owner_stay.rejected": {
    title: "Owner stay not confirmed",
    body: "Unfortunately your stay request for {{villa}} on {{checkIn}} → {{checkOut}} couldn't be approved. Please contact your property manager for alternatives.",
  },
  "owner_stay.cancelled": {
    title: "Owner stay cancelled",
    body: "Your stay request for {{villa}} on {{checkIn}} → {{checkOut}} has been cancelled.",
  },
  "owner_stay.completed": {
    title: "Owner stay completed",
    body: "Your stay at {{villa}} on {{checkIn}} → {{checkOut}} is marked complete. Charges (if any) will appear on your next statement.",
  },
  "owner_stay.relocation_pending": {
    title: "Owner stay — admin review",
    body: "Some of your selected dates overlap with existing reservations. Our team is reviewing whether the stay can be accommodated.",
  },
  "owner_stay.finance_bridged": {
    title: "Owner stay — charges posted",
    body: "Charges for your stay at {{villa}} on {{checkIn}} → {{checkOut}} have been added to your statement.",
  },
};

/**
 * Pure: which template (if any) should fire for a given status
 * transition? Internal-only transitions stay quiet (return null).
 */
export function mapStatusTransitionToTemplate(
  oldStatus: string,
  newStatus: string,
): OwnerStayTemplateKey | null {
  if (newStatus === "approved") return "owner_stay.approved";
  if (newStatus === "rejected") return "owner_stay.rejected";
  if (newStatus === "completed") return "owner_stay.completed";
  if (newStatus === "cancelled") return "owner_stay.cancelled";
  if (newStatus === "requires_relocation")
    return "owner_stay.relocation_pending";
  // requested → pending_admin_approval is admin-internal noise; skip.
  void oldStatus;
  return null;
}
