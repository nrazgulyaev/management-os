import { z } from "zod";

const moneyMinor = z.coerce.bigint();
const currency = z.string().length(3).toUpperCase();

const optionalUuid = z.string().uuid().optional().or(z.literal(""));
const optionalString = z.string().max(2000).optional().or(z.literal(""));

export const revenueLineSchema = z.object({
  bookingId: optionalUuid,
  villaId: optionalUuid,
  projectId: optionalUuid,
  ownerId: optionalUuid,
  revenueType: z.string().min(2).max(40),
  description: z.string().min(1).max(280),
  amountMinor: moneyMinor,
  currency,
  serviceDate: z.string().date(),
  source: z.string().max(40).default("manual"),
  visibility: z.enum(["internal", "owner", "public"]).default("internal"),
  status: z.enum(["draft", "posted", "voided", "reversed"]).default("posted"),
});

export const feeLineSchema = z.object({
  bookingId: optionalUuid,
  villaId: optionalUuid,
  projectId: optionalUuid,
  feeType: z.string().min(2).max(40),
  description: z.string().min(1).max(280),
  amountMinor: moneyMinor,
  currency,
  feeDate: z.string().date(),
  source: z.string().max(40).default("manual"),
  status: z.enum(["draft", "posted", "voided", "reversed"]).default("posted"),
});

export const expenseLineSchema = z.object({
  villaId: optionalUuid,
  projectId: optionalUuid,
  bookingId: optionalUuid,
  expenseType: z.string().min(2).max(40),
  description: z.string().min(1).max(280),
  amountMinor: moneyMinor,
  currency,
  expenseDate: z.string().date(),
  allocationScope: z.enum(["villa", "project_pool", "company", "booking", "owner_direct"]).default("villa"),
  capitalized: z.coerce.boolean().optional().default(false),
  ownerChargeable: z.coerce.boolean().optional().default(true),
  notes: optionalString,
  status: z.enum(["draft", "posted", "voided", "reversed"]).default("posted"),
});

export const taxLineSchema = z.object({
  villaId: optionalUuid,
  projectId: optionalUuid,
  bookingId: optionalUuid,
  taxType: z.string().min(2).max(40),
  description: z.string().min(1).max(280),
  amountMinor: moneyMinor,
  currency,
  taxDate: z.string().date(),
  ownerVisible: z.coerce.boolean().optional().default(true),
  status: z.enum(["draft", "posted", "voided", "reversed"]).default("posted"),
});

export const reserveMovementSchema = z.object({
  villaId: optionalUuid,
  projectId: optionalUuid,
  ownerId: optionalUuid,
  reserveType: z.enum(["renovation", "depreciation", "ffe", "maintenance", "tax", "emergency", "other"]),
  movementType: z.enum(["contribution", "release", "adjustment"]),
  description: z.string().min(1).max(280),
  amountMinor: moneyMinor,
  currency,
  movementDate: z.string().date(),
  status: z.enum(["draft", "posted", "voided", "reversed"]).default("posted"),
});

export const managementFeeRuleSchema = z.object({
  projectId: optionalUuid,
  villaId: optionalUuid,
  ruleName: z.string().min(2).max(160),
  feeModel: z.enum(["percent_of_gross", "percent_of_net", "fixed_monthly", "tiered", "custom"]),
  feePercent: z.coerce.number().min(0).max(100).optional(),
  fixedAmountMinor: z.coerce.bigint().optional(),
  currency: currency.optional(),
  startsOn: z.string().date(),
  endsOn: z.string().date().optional().or(z.literal("")),
  status: z.enum(["active", "scheduled", "ended"]).default("active"),
});

export const statementPeriodSchema = z.object({
  periodStart: z.string().date(),
  periodEnd: z.string().date(),
  label: z.string().min(2).max(40),
}).refine((d) => new Date(d.periodEnd) >= new Date(d.periodStart), {
  message: "periodEnd must be on or after periodStart",
  path: ["periodEnd"],
});

export const generateStatementSchema = z.object({
  ownerId: z.string().uuid(),
  periodId: z.string().uuid(),
  villaId: optionalUuid,
  projectId: optionalUuid,
  currency: currency.default("USD"),
});

export const payoutBatchSchema = z.object({
  batchCode: z.string().min(2).max(40),
  periodStart: z.string().date(),
  periodEnd: z.string().date(),
  currency,
});

export const payoutLineSchema = z.object({
  payoutBatchId: z.string().uuid().optional().or(z.literal("")),
  ownerId: z.string().uuid(),
  payoutMethodId: optionalUuid,
  statementId: optionalUuid,
  amountMinor: moneyMinor,
  currency,
  scheduledFor: z.string().date().optional().or(z.literal("")),
  reference: optionalString,
});
