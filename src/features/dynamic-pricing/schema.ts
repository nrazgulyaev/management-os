import { z } from "zod";

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

const scopeEnum = z.enum(["global", "project", "villa"]);
const statusEnum = z.enum(["active", "paused", "archived"]);
const modifierEnum = z.enum(["percent", "fixed"]);
const closeOutModifierEnum = z.enum(["percent", "fixed", "stop_sell"]);

export const createPricingRuleSetSchema = z
  .object({
    ruleSetCode: z
      .string()
      .trim()
      .min(2)
      .max(60)
      .regex(/^[a-z0-9_.-]+$/i, "Letters / digits / _ . - only"),
    name: z.string().trim().min(2).max(120),
    scopeType: scopeEnum,
    projectId: z.string().uuid().optional(),
    villaId: z.string().uuid().optional(),
    priority: z.coerce.number().int().min(0).max(10000).default(100),
    currency: z.string().trim().min(3).max(8).default("USD"),
    baseRateMinor: z.coerce.number().int().min(0).max(1_000_000_000_000),
    minRateMinor: z.coerce.number().int().min(0).max(1_000_000_000_000).optional(),
    maxRateMinor: z.coerce.number().int().min(0).max(1_000_000_000_000).optional(),
  })
  .refine(
    (v) => v.scopeType !== "project" || !!v.projectId,
    { message: "Project ID required for project-scoped rule sets" },
  )
  .refine(
    (v) => v.scopeType !== "villa" || !!v.villaId,
    { message: "Villa ID required for villa-scoped rule sets" },
  );

export const updatePricingRuleSetSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2).max(120).optional(),
  priority: z.coerce.number().int().min(0).max(10000).optional(),
  currency: z.string().trim().min(3).max(8).optional(),
  baseRateMinor: z.coerce.number().int().min(0).optional(),
  minRateMinor: z.coerce.number().int().min(0).optional(),
  maxRateMinor: z.coerce.number().int().min(0).optional(),
  status: statusEnum.optional(),
});

export const ruleSetIdSchema = z.object({ id: z.string().uuid() });

export const upsertDayOfWeekRuleSchema = z.object({
  ruleSetId: z.string().uuid(),
  weekday: z.coerce.number().int().min(1).max(7),
  modifierType: modifierEnum,
  modifierValueNumeric: z.coerce.number().optional(),
  modifierAmountMinor: z.coerce.number().int().optional(),
  minLos: z.coerce.number().int().min(1).max(365).optional(),
});

export const upsertOccupancyRuleSchema = z.object({
  ruleSetId: z.string().uuid(),
  occupancyMin: z.coerce.number().min(0).max(1),
  occupancyMax: z.coerce.number().min(0).max(1),
  modifierType: modifierEnum,
  modifierValueNumeric: z.coerce.number().optional(),
  modifierAmountMinor: z.coerce.number().int().optional(),
});

export const upsertCloseOutRuleSchema = z.object({
  ruleSetId: z.string().uuid(),
  daysBeforeCheckinMin: z.coerce.number().int().min(0).max(10000),
  daysBeforeCheckinMax: z.coerce.number().int().min(0).max(10000),
  modifierType: closeOutModifierEnum,
  modifierValueNumeric: z.coerce.number().optional(),
  modifierAmountMinor: z.coerce.number().int().optional(),
  minLos: z.coerce.number().int().min(1).max(365).optional(),
});

export const upsertChannelRuleSchema = z.object({
  ruleSetId: z.string().uuid(),
  channelKey: z.string().trim().min(2).max(40),
  modifierType: modifierEnum,
  modifierValueNumeric: z.coerce.number().optional(),
  modifierAmountMinor: z.coerce.number().int().optional(),
  commissionModel: z
    .enum([
      "channel_collects",
      "hotel_collects",
      "commission_on_gross",
      "none",
    ])
    .optional(),
});

export const createMinStayRuleSchema = z.object({
  ruleSetId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  startsOn: z.string().regex(isoDate).optional(),
  endsOn: z.string().regex(isoDate).optional(),
  weekdayMask: z.array(z.coerce.number().int().min(1).max(7)).optional(),
  minLos: z.coerce.number().int().min(1).max(365),
  maxLos: z.coerce.number().int().min(1).max(365).optional(),
  priority: z.coerce.number().int().min(0).max(10000).default(100),
});

export const createStopSellRuleSchema = z.object({
  ruleSetId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  startsOn: z.string().regex(isoDate),
  endsOn: z.string().regex(isoDate),
  reason: z.enum([
    "maintenance_buffer",
    "owner_hold",
    "operational_risk",
    "channel_strategy",
    "manual",
  ]),
  channelKey: z.string().trim().min(2).max(40).optional(),
});

export const archivePricingRuleSchema = z.object({
  ruleType: z.enum([
    "day_of_week",
    "occupancy",
    "close_out",
    "channel",
    "min_stay",
    "stop_sell",
  ]),
  id: z.string().uuid(),
});

export const adminQuoteStaySchema = z.object({
  villaId: z.string().uuid(),
  checkIn: z.string().regex(isoDate),
  checkOut: z.string().regex(isoDate),
  channelKey: z.string().trim().min(2).max(40).default("direct"),
});

export const simulateChannelPushSchema = z.object({
  ruleSetId: z.string().uuid(),
  dateStart: z.string().regex(isoDate),
  dateEnd: z.string().regex(isoDate),
  channelKey: z.string().trim().min(2).max(40),
  eventType: z.enum([
    "rate_update",
    "availability_update",
    "stop_sell_update",
    "min_stay_update",
  ]),
});

export const publicQuoteParamsSchema = z.object({
  villaId: z.string().uuid(),
  checkIn: z.string().regex(isoDate),
  checkOut: z.string().regex(isoDate),
  channelKey: z.string().trim().min(2).max(40).optional(),
});

export type PublicQuoteParams = z.infer<typeof publicQuoteParamsSchema>;
