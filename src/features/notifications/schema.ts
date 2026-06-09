import { z } from "zod";

const optionalUuid = z
  .string()
  .uuid()
  .optional()
  .or(z.literal(""))
  .transform((v) => (v === "" ? undefined : v));

export const recipientTypeEnum = z.enum(["internal_user", "owner", "guest", "role"]);
export const channelEnum = z.enum(["in_app", "email", "whatsapp", "sms", "telegram"]);
export const priorityEnum = z.enum(["low", "normal", "high", "urgent"]);
export const statusEnum = z.enum(["queued", "suppressed", "sent", "failed", "cancelled"]);

export const queueNotificationSchema = z.object({
  recipientType: recipientTypeEnum,
  recipientId: optionalUuid,
  // TENANCY-FINANCE-DOCS — optional org anchor. queueNotification is
  // called from ~22 scattered sites (crons / system / portal), so the
  // column stays NULLABLE; callers that have a session may pass it.
  organizationId: optionalUuid,
  channel: channelEnum.default("in_app"),
  templateKey: z.string().min(2).max(80),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(4000),
  payload: z.record(z.unknown()).optional(),
  priority: priorityEnum.default("normal"),
  scheduledFor: z.string().datetime().optional(),
  dedupeKey: z.string().max(160).optional(),
});

export const notificationIdSchema = z.object({ id: z.string().uuid() });

export const updateNotificationPreferenceSchema = z.object({
  id: z.string().uuid().optional(),
  appUserId: optionalUuid,
  ownerId: optionalUuid,
  roleKey: z.string().max(60).optional().or(z.literal("")),
  channel: channelEnum,
  templateKey: z.string().min(2).max(80),
  enabled: z.coerce.boolean().optional().default(true),
  quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal("")),
  quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal("")),
});

export type QueueNotificationInput = z.infer<typeof queueNotificationSchema>;
