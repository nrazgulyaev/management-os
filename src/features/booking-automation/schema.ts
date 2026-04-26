import { z } from "zod";

const optionalUuid = z
  .string()
  .uuid()
  .optional()
  .or(z.literal(""))
  .transform((v) => (v === "" ? undefined : v));

export const triggerEventEnum = z.enum([
  "booking_created",
  "booking_updated",
  "booking_cancelled",
  "checkout_due",
  "checkin_due",
]);

export const taskCategoryEnum = z.enum([
  "housekeeping",
  "inspection",
  "maintenance",
  "concierge",
  "guest_request",
  "procurement",
  "admin",
]);

export const createAutomationRuleSchema = z.object({
  ruleName: z.string().min(2).max(200),
  triggerEvent: triggerEventEnum,
  taskCategory: taskCategoryEnum,
  taskTypeKey: z.string().max(80).optional().or(z.literal("")),
  checklistTemplateKey: z.string().max(80).optional().or(z.literal("")),
  titleTemplate: z.string().min(2).max(300),
  dueOffsetMinutes: z.coerce.number().int().min(-60 * 24 * 7).max(60 * 24 * 7).default(0),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  projectId: optionalUuid,
  villaId: optionalUuid,
  assignedTo: optionalUuid,
  assignedRole: z.string().max(60).optional().or(z.literal("")),
});

export const automationRuleIdSchema = z.object({ id: z.string().uuid() });
export const bookingIdSchema = z.object({ bookingId: z.string().uuid() });

export type CreateAutomationRuleInput = z.infer<typeof createAutomationRuleSchema>;

/**
 * Default rules seeded at first run when the table is empty. Mirrored in
 * `createDefaultBookingAutomationRulesIfMissing()`.
 */
export const DEFAULT_RULES = [
  {
    ruleName: "Checkout cleaning",
    triggerEvent: "booking_created" as const,
    taskCategory: "housekeeping" as const,
    taskTypeKey: "turnover_clean",
    checklistTemplateKey: "tpl_checkout_clean",
    titleTemplate: "Checkout cleaning · {villa} · {checkout_date}",
    dueOffsetMinutes: 60, // checkout + 60 min
    priority: "normal" as const,
    /** offset is applied relative to:
     *  - checkout_due trigger or booking_created → relative to checkOut
     *  - checkin_due trigger → relative to checkIn
     */
    anchor: "checkout" as const,
  },
  {
    ruleName: "Arrival inspection",
    triggerEvent: "booking_created" as const,
    taskCategory: "inspection" as const,
    taskTypeKey: "arrival_inspection",
    checklistTemplateKey: "tpl_arrival_inspection",
    titleTemplate: "Arrival inspection · {villa} · {checkin_date}",
    dueOffsetMinutes: -180, // checkin - 180 min
    priority: "high" as const,
    anchor: "checkin" as const,
  },
];
