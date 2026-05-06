import { z } from "zod";

const journeyStageEnum = z.enum([
  "pre_arrival",
  "arrival_day",
  "in_stay",
  "pre_checkout",
  "checkout_day",
  "post_stay",
]);

const triggerAnchorEnum = z.enum([
  "booking_created",
  "check_in",
  "check_out",
  "stay_token_issued",
  "guest_arrived",
  "guest_checked_out",
]);

const channelEnum = z.enum(["in_app", "email", "sms", "whatsapp", "none"]);
const priorityEnum = z.enum(["low", "normal", "high", "urgent"]);
const statusEnum = z.enum(["active", "paused", "archived"]);

const suggestionTypeEnum = z.enum([
  "airport_transfer",
  "breakfast",
  "private_chef",
  "massage",
  "driver",
  "restaurant",
  "late_checkout",
  "review_request",
  "guide",
  "concierge",
  "info",
]);

export const createGuestJourneyRuleSchema = z.object({
  ruleKey: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9_.-]+$/i, "Letters / digits / _ . - only"),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).optional(),
  journeyStage: journeyStageEnum,
  triggerAnchor: triggerAnchorEnum,
  offsetMinutes: z.coerce.number().int().min(-100000).max(100000),
  channel: channelEnum.default("in_app"),
  templateKey: z.string().trim().max(120).optional(),
  suggestionType: suggestionTypeEnum.optional(),
  serviceId: z.string().uuid().optional(),
  villaId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  appliesToChannel: z.string().trim().max(40).optional(),
  priority: priorityEnum.default("normal"),
});

export const journeyRuleIdSchema = z.object({ id: z.string().uuid() });

export const runJourneyRuleSchema = z.object({
  bookingId: z.string().uuid(),
  ruleId: z.string().uuid(),
});

export const generateSuggestionsSchema = z.object({
  bookingId: z.string().uuid(),
});

export const suggestionIdSchema = z.object({ id: z.string().uuid() });

export const updateRuleStatusSchema = z.object({
  id: z.string().uuid(),
  status: statusEnum,
});

export const rebuildOwnerEventsSchema = z.object({
  ownerId: z.string().uuid().optional(),
  villaId: z.string().uuid().optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const ownerCalendarPreferencesUpdateSchema = z.object({
  ownerId: z.string().uuid(),
  defaultCurrency: z.string().min(3).max(8).optional(),
  showGuestNames: z.coerce.boolean().optional(),
  showGuestCountry: z.coerce.boolean().optional(),
  showChannelLabels: z.coerce.boolean().optional(),
  showMaintenanceDetails: z.coerce.boolean().optional(),
  calendarDensity: z.enum(["compact", "comfortable", "detailed"]).optional(),
});

export type CreateGuestJourneyRuleInput = z.infer<
  typeof createGuestJourneyRuleSchema
>;
