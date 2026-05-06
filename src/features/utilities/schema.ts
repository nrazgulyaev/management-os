import { z } from "zod";

const isoDate = z.string().min(8);
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

const UTILITY_TYPES = [
  "electricity",
  "water",
  "internet",
  "gas",
  "waste",
  "security",
  "other",
] as const;

const READING_TYPES = ["meter", "token_balance", "bill_amount", "manual_check"] as const;
const READING_SOURCES = ["manual", "field_check", "import", "api"] as const;

export const createUtilityAccountSchema = z.object({
  villaId: z.string().uuid().optional().nullable(),
  projectId: z.string().uuid().optional().nullable(),
  utilityType: z.enum(UTILITY_TYPES),
  providerName: z.string().max(160).optional().nullable(),
  accountNumber: z.string().max(80).optional().nullable(),
  tokenMeter: z.boolean().optional().default(false),
  billingCycleDay: z.number().int().min(1).max(31).optional().nullable(),
  currency: z.string().length(3).default("IDR"),
  averageMonthlyCostMinor: z.number().int().nonnegative().optional().nullable(),
  lowBalanceThresholdMinor: z.number().int().nonnegative().optional().nullable(),
  criticalBalanceThresholdMinor: z.number().int().nonnegative().optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

export const recordUtilityReadingSchema = z.object({
  utilityAccountId: z.string().uuid(),
  readingType: z.enum(READING_TYPES),
  readingValue: z.number().optional().nullable(),
  balanceMinor: z.number().int().optional().nullable(),
  currency: z.string().length(3).optional().nullable(),
  readingAt: isoDate.optional().nullable(),
  source: z.enum(READING_SOURCES).default("manual"),
  notes: z.string().max(500).optional().nullable(),
});

export const createPaymentReminderSchema = z.object({
  utilityAccountId: z.string().uuid(),
  dueDate: ymd,
  amountMinor: z.number().int().nonnegative().optional().nullable(),
  currency: z.string().length(3).default("IDR"),
  notes: z.string().max(500).optional().nullable(),
});

export const markPaymentPaidSchema = z.object({
  id: z.string().uuid(),
  paymentDate: ymd.optional(),
  notes: z.string().max(500).optional().nullable(),
});
