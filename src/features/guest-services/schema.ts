import { z } from "zod";

const optionalUuid = z
  .string()
  .uuid()
  .optional()
  .nullable()
  .transform((v) => v ?? null);

const moneyMinor = z
  .union([z.string().regex(/^-?\d+$/), z.number().int(), z.bigint()])
  .transform((v) => (typeof v === "bigint" ? v : BigInt(v)));

const optionalMoneyMinor = z
  .union([z.string(), z.number().int(), z.bigint(), z.null()])
  .optional()
  .nullable()
  .transform((v) => {
    if (v === null || v === undefined || v === "") return null;
    if (typeof v === "bigint") return v;
    return BigInt(v as number | string);
  });

export const PRICING_MODELS = [
  "fixed",
  "per_person",
  "per_day",
  "per_hour",
  "per_item",
  "quote_required",
  "free",
] as const;

export const SERVICE_TYPES = [
  "transfer",
  "chef",
  "breakfast",
  "massage",
  "vehicle",
  "equipment",
  "experience",
  "housekeeping",
  "laundry",
  "late_checkout",
  "early_checkin",
  "other",
] as const;

// -----------------------------------------------------------------------------
// Catalog management
// -----------------------------------------------------------------------------

export const upsertCategorySchema = z.object({
  id: optionalUuid,
  key: z.string().min(2).max(60).regex(/^[a-z0-9_-]+$/),
  name: z.string().min(2).max(120),
  description: z.string().max(2000).optional().nullable(),
  icon: z.string().max(60).optional().nullable(),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  status: z.enum(["active", "archived"]).default("active"),
});
export type UpsertCategoryInput = z.infer<typeof upsertCategorySchema>;

export const upsertServiceSchema = z.object({
  id: optionalUuid,
  categoryId: optionalUuid,
  projectId: optionalUuid,
  villaId: optionalUuid,
  serviceKey: z.string().min(2).max(80).regex(/^[a-z0-9_-]+$/),
  name: z.string().min(2).max(160),
  shortDescription: z.string().max(280).optional().nullable(),
  descriptionMd: z.string().max(8000).optional().nullable(),
  imageUrl: z.string().url().max(800).optional().nullable(),
  serviceType: z.enum(SERVICE_TYPES),
  pricingModel: z.enum(PRICING_MODELS).default("fixed"),
  basePriceMinor: moneyMinor.default(0n as unknown as bigint),
  internalCostMinor: optionalMoneyMinor,
  currency: z.string().min(3).max(8).default("USD"),
  requiresDate: z.coerce.boolean().default(true),
  requiresTime: z.coerce.boolean().default(false),
  requiresGuestCount: z.coerce.boolean().default(false),
  requiresAdminConfirmation: z.coerce.boolean().default(true),
  allowMultipleDays: z.coerce.boolean().default(false),
  minQuantity: z.coerce.number().int().min(1).max(999).default(1),
  maxQuantity: z.coerce.number().int().min(1).max(999).optional().nullable(),
  leadTimeHours: z.coerce.number().int().min(0).max(720).optional().nullable(),
  cancellationPolicyMd: z.string().max(4000).optional().nullable(),
  guestVisible: z.coerce.boolean().default(true),
  status: z.enum(["active", "paused", "archived"]).default("active"),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
});
export type UpsertServiceInput = z.infer<typeof upsertServiceSchema>;

export const upsertServiceOptionSchema = z.object({
  id: optionalUuid,
  serviceId: z.string().uuid(),
  optionKey: z.string().min(1).max(60).regex(/^[a-z0-9_-]+$/),
  label: z.string().min(1).max(160),
  description: z.string().max(800).optional().nullable(),
  priceDeltaMinor: moneyMinor.default(0n as unknown as bigint),
  internalCostDeltaMinor: optionalMoneyMinor,
  isDefault: z.coerce.boolean().default(false),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  status: z.enum(["active", "archived"]).default("active"),
});
export type UpsertServiceOptionInput = z.infer<typeof upsertServiceOptionSchema>;

// -----------------------------------------------------------------------------
// Guest order submission (token-gated)
// -----------------------------------------------------------------------------

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .nullable();

export const submitGuestOrderSchema = z.object({
  token: z.string().min(20).max(120),
  serviceId: z.string().uuid(),
  selectedOptionId: optionalUuid,
  requestedDate: isoDate,
  requestedTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional()
    .nullable(),
  quantity: z.coerce.number().int().min(1).max(50).default(1),
  guestCount: z.coerce.number().int().min(0).max(100).optional().nullable(),
  guestNote: z.string().max(2000).optional().nullable(),
});
export type SubmitGuestOrderInput = z.infer<typeof submitGuestOrderSchema>;

// -----------------------------------------------------------------------------
// Admin order lifecycle
// -----------------------------------------------------------------------------

export const transitionOrderSchema = z.object({
  id: z.string().uuid(),
  to: z.enum([
    "reviewing",
    "confirmed",
    "scheduled",
    "fulfilled",
    "cancelled",
    "rejected",
  ]),
  message: z.string().max(2000).optional().nullable(),
  assignedTo: optionalUuid,
  internalNote: z.string().max(2000).optional().nullable(),
  // Optional override of priced amount on confirm — used when pricing was
  // 'quote_required' and an operator quotes a number.
  guestPriceMinorOverride: optionalMoneyMinor,
  internalCostMinorOverride: optionalMoneyMinor,
});
export type TransitionOrderInput = z.infer<typeof transitionOrderSchema>;

export const addOrderNoteSchema = z.object({
  id: z.string().uuid(),
  message: z.string().min(1).max(2000),
});
export type AddOrderNoteInput = z.infer<typeof addOrderNoteSchema>;

export const bridgeOrderToFinanceSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().max(400).optional().nullable(),
});
export type BridgeOrderToFinanceInput = z.infer<typeof bridgeOrderToFinanceSchema>;
