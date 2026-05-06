import type {
  NotificationChannel,
  NotificationRecipientType,
  NotificationTriggerEvent,
} from "@/lib/development/types/notifications";

export const TRIGGER_EVENTS: NotificationTriggerEvent[] = [
  "milestone_pre_invoice_due",
  "milestone_invoice_due",
  "milestone_overdue",
  "milestone_overdue_critical",
  "reservation_expiring",
  "contract_pending_signature",
  "late_fee_accrued",
  "discount_pending_approval",
  "system_event",
];

export const TRIGGER_EVENT_LABEL: Record<NotificationTriggerEvent, string> = {
  milestone_pre_invoice_due: "Milestone pre-invoice due",
  milestone_invoice_due: "Milestone invoice due",
  milestone_overdue: "Milestone overdue",
  milestone_overdue_critical: "Milestone critically overdue",
  reservation_expiring: "Reservation expiring soon",
  contract_pending_signature: "Contract pending signature",
  late_fee_accrued: "Late fee accrued",
  discount_pending_approval: "Discount pending approval",
  system_event: "System event",
};

export const CHANNELS: NotificationChannel[] = [
  "email",
  "whatsapp",
  "sms",
  "in_app",
];

export const CHANNEL_LABEL: Record<NotificationChannel, string> = {
  email: "Email",
  whatsapp: "WhatsApp",
  sms: "SMS",
  in_app: "In-app",
};

/** Channels actually wired up for dispatch in 2.2.B. */
export const ACTIVE_CHANNELS: ReadonlyArray<NotificationChannel> = [
  "email",
  "in_app",
];

export const RECIPIENT_TYPES: NotificationRecipientType[] = [
  "buyer",
  "sales_manager",
  "project_manager",
  "admin",
  "specific_role",
  "specific_user",
];

export const RECIPIENT_TYPE_LABEL: Record<NotificationRecipientType, string> = {
  buyer: "Buyer (contact)",
  sales_manager: "Sales manager (project-scoped)",
  project_manager: "Project manager",
  admin: "Workspace admin",
  specific_role: "Specific role",
  specific_user: "Specific user",
};
