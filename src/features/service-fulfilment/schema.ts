import { z } from "zod";

const optionalUuid = z.string().uuid().optional();
const optionalBigintMinor = z.coerce.number().int().min(-1_000_000_000_000).max(1_000_000_000_000).optional();
const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
const isoTimestampRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

const vendorTypeEnum = z.enum([
  "transport",
  "chef",
  "wellness",
  "laundry",
  "rental",
  "activity",
  "maintenance",
  "other",
]);

const fulfilmentStatusEnum = z.enum([
  "new",
  "triage",
  "awaiting_vendor",
  "vendor_confirmed",
  "guest_confirmed",
  "scheduled",
  "in_progress",
  "completed",
  "cancelled",
  "failed",
  "no_show",
]);

const fulfilmentTypeEnum = z.enum(["internal", "vendor", "hybrid"]);

export const createServiceVendorSchema = z.object({
  vendorCode: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9_.-]+$/i, "Letters / digits / _ . - only"),
  displayName: z.string().trim().min(2).max(120),
  legalName: z.string().trim().max(160).optional(),
  vendorType: vendorTypeEnum,
  contactName: z.string().trim().max(120).optional(),
  contactPhone: z.string().trim().max(40).optional(),
  contactEmail: z.string().trim().max(160).email().optional(),
  preferredChannel: z
    .enum(["whatsapp", "phone", "email", "in_app", "manual"])
    .optional(),
  serviceArea: z.string().trim().max(120).optional(),
  defaultCurrency: z.string().trim().min(3).max(8).default("USD"),
  internalNotes: z.string().trim().max(2000).optional(),
});

export const updateServiceVendorSchema = createServiceVendorSchema
  .partial()
  .extend({ id: z.string().uuid() });

export const vendorIdSchema = z.object({ id: z.string().uuid() });

export const attachVendorToServiceSchema = z.object({
  vendorId: z.string().uuid(),
  serviceId: z.string().uuid(),
  baseCostMinor: optionalBigintMinor,
  currency: z.string().trim().min(3).max(8).optional(),
  leadTimeMinutes: z.coerce.number().int().min(0).max(100000).optional(),
  minNoticeMinutes: z.coerce.number().int().min(0).max(100000).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const vendorServiceIdSchema = z.object({
  vendorId: z.string().uuid(),
  serviceId: z.string().uuid(),
});

export const createFulfilmentSchema = z.object({
  orderId: z.string().uuid(),
  fulfilmentType: fulfilmentTypeEnum.default("internal"),
  vendorId: optionalUuid,
  assignedToAppUserId: optionalUuid,
  scheduledFor: z
    .string()
    .regex(isoTimestampRegex)
    .optional(),
  internalNotes: z.string().trim().max(4000).optional(),
});

export const fulfilmentIdSchema = z.object({ id: z.string().uuid() });

export const assignFulfilmentVendorSchema = z.object({
  id: z.string().uuid(),
  vendorId: z.string().uuid(),
  vendorQuoteMinor: optionalBigintMinor,
  fulfilmentType: fulfilmentTypeEnum.optional(),
});

export const assignFulfilmentStaffSchema = z.object({
  id: z.string().uuid(),
  appUserId: z.string().uuid(),
});

export const updateFulfilmentScheduleSchema = z.object({
  id: z.string().uuid(),
  scheduledFor: z.string().regex(isoTimestampRegex),
});

export const updateFulfilmentEtaSchema = z.object({
  id: z.string().uuid(),
  etaAt: z.string().regex(isoTimestampRegex),
  source: z.enum(["admin", "vendor"]).default("admin"),
});

export const transitionFulfilmentStatusSchema = z.object({
  id: z.string().uuid(),
  to: fulfilmentStatusEnum,
  reason: z.string().trim().max(2000).optional(),
});

export const cancelFulfilmentSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().trim().max(2000).optional(),
});

export const requestGuestConfirmationSchema = z.object({
  id: z.string().uuid(),
});

export const guestConfirmFulfilmentSchema = z.object({
  id: z.string().uuid(),
  stayTokenId: z.string().uuid(),
});

export const completeFulfilmentSchema = z.object({
  id: z.string().uuid(),
  internalCostMinor: optionalBigintMinor,
  guestPriceMinor: optionalBigintMinor,
  currency: z.string().trim().min(3).max(8).optional(),
});

export const failFulfilmentSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().trim().max(2000).optional(),
});

export const issueVendorTokenSchema = z.object({
  fulfilmentId: z.string().uuid(),
  expiresAt: z.string().regex(isoTimestampRegex).optional(),
});

export const revokeVendorTokenSchema = z.object({
  id: z.string().uuid(),
});

export const vendorTokenActionSchema = z.object({
  token: z.string().min(8).max(120),
});

export const vendorEtaSchema = z.object({
  token: z.string().min(8).max(120),
  etaAt: z.string().regex(isoTimestampRegex),
});

export const vendorMarkSchema = z.object({
  token: z.string().min(8).max(120),
});

export const vendorDeclineSchema = z.object({
  token: z.string().min(8).max(120),
  reason: z.string().trim().max(2000).optional(),
});

export const createVendorInvoiceSchema = z.object({
  fulfilmentId: z.string().uuid(),
  vendorId: z.string().uuid(),
  invoiceNumber: z.string().trim().max(80).optional(),
  amountMinor: z.coerce.number().int().min(0).max(1_000_000_000_000),
  currency: z.string().trim().min(3).max(8),
  invoiceDate: z.string().regex(isoDateRegex).optional(),
  dueDate: z.string().regex(isoDateRegex).optional(),
  notes: z.string().trim().max(2000).optional(),
});

/**
 * Token-scoped invoice submission (vendor portal). The vendor has NO
 * app-user session — scope (organizationId, vendorId, fulfilmentId,
 * currency) is derived server-side from the token, NOT trusted from the
 * client. So this schema only carries the token plus the fields the
 * vendor actually types.
 */
export const createVendorInvoiceFromTokenSchema = z.object({
  token: z.string().min(8).max(120),
  invoiceNumber: z.string().trim().max(80).optional(),
  amountMinor: z.coerce.number().int().min(0).max(1_000_000_000_000),
  invoiceDate: z.string().regex(isoDateRegex).optional(),
  dueDate: z.string().regex(isoDateRegex).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const invoiceIdSchema = z.object({ id: z.string().uuid() });

export const submitGuestServiceRatingSchema = z.object({
  fulfilmentId: z.string().uuid(),
  stayTokenId: z.string().uuid(),
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().max(2000).optional(),
  sentiment: z.enum(["positive", "neutral", "negative", "mixed"]).optional(),
});

export const ratingIdSchema = z.object({ id: z.string().uuid() });
export const flagRatingSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().trim().max(2000).optional(),
});

export const bridgeFulfilmentSchema = z.object({
  fulfilmentId: z.string().uuid(),
  reason: z.string().trim().max(500).optional(),
});

export const reverseBridgeSchema = z.object({
  fulfilmentId: z.string().uuid(),
  reason: z.string().trim().max(500).optional(),
});
