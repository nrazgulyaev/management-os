export type NotificationChannel = "email" | "whatsapp" | "sms" | "in_app";

export type NotificationTriggerEvent =
  | "milestone_pre_invoice_due"
  | "milestone_invoice_due"
  | "milestone_overdue"
  | "milestone_overdue_critical"
  | "reservation_expiring"
  | "contract_pending_signature"
  | "late_fee_accrued"
  | "discount_pending_approval"
  | "system_event";

export type NotificationRecipientType =
  | "buyer"
  | "sales_manager"
  | "project_manager"
  | "admin"
  | "specific_role"
  | "specific_user";

export type NotificationDeliveryStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "bounced"
  | "failed";

export interface NotificationRuleData {
  id: string;
  ruleName: string;
  description: string | null;
  triggerEvent: NotificationTriggerEvent;
  triggerOffsetDays: number;
  recipientType: NotificationRecipientType;
  recipientRoleKey: string | null;
  recipientUserId: string | null;
  channel: NotificationChannel;
  templateName: string;
  isActive: boolean;
}

export interface NotificationTemplateData {
  id: string;
  templateName: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  language: string;
  description: string | null;
}

export interface NotificationDeliveryRecord {
  id: string;
  ruleId: string | null;
  triggerEntityType: string;
  triggerEntityId: string;
  recipientContactId: string | null;
  recipientUserId: string | null;
  recipientAddress: string | null;
  channel: NotificationChannel;
  templateName: string;
  subject: string;
  body: string;
  status: NotificationDeliveryStatus;
  sentAt: string | null;
  deliveredAt: string | null;
  errorReason: string | null;
  externalMessageId: string | null;
  createdAt: string;
}
