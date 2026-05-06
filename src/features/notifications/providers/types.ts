/**
 * Notification provider abstraction. Pure types — safe to import from
 * tests, server actions, and the worker.
 *
 * The runtime selector is in `./index.ts`.
 */

export type DeliveryChannel = "in_app" | "email" | "sms" | "whatsapp" | "telegram";
export type ProviderKey = "in_app" | "noop" | "resend" | "twilio";
export type DeliveryStatus = "sent" | "failed" | "skipped" | "suppressed";

export type RecipientType = "internal_user" | "owner" | "guest" | "role";

export interface DeliveryInput {
  notificationId: string;
  channel: DeliveryChannel;
  recipientType: RecipientType;
  /** app_users.id or owners.id when recipientType is internal_user / owner;
   *  null for role-targeted notifications (the worker fans those out before
   *  reaching providers). */
  recipientId: string | null;
  /** email address / phone number (E.164) / handle. Always non-null for
   *  external channels — `delivery.ts` skips with reason when missing. */
  recipientAddress: string | null;
  title: string;
  body: string;
  /** v8B — optional HTML body. When present and the channel supports
   *  HTML (currently `email`), the provider sends rich content alongside
   *  the plain-text body. */
  html?: string | null;
  payload: Record<string, unknown> | null;
  priority: "low" | "normal" | "high" | "urgent";
  /** App user id of the in-app recipient (for the in_app provider only). */
  appUserId?: string | null;
  /** Owner id (for in_app + email when targeting owners). */
  ownerId?: string | null;
  /** Role key for diagnostics / inbox tagging. */
  roleKey?: string | null;
  templateKey?: string;
}

export interface DeliveryResult {
  status: DeliveryStatus;
  providerMessageId?: string;
  responseJson?: Record<string, unknown>;
  errorMessage?: string;
}

export interface NotificationProvider {
  key: ProviderKey;
  /** Channels this provider serves. The worker filters before calling send. */
  supports: (channel: DeliveryChannel) => boolean;
  /** True when env is wired up enough to actually send. The worker still
   *  honours `NOTIFICATIONS_DRY_RUN` separately and routes to noop in that
   *  case. */
  isConfigured: () => boolean;
  send: (input: DeliveryInput) => Promise<DeliveryResult>;
}
