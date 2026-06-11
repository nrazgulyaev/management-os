import { z } from "zod";
import { STAFF_ALLOCATION_SCOPES } from "@/lib/db/schema/payroll";

const currency = z.string().length(3).toUpperCase();
const optionalUuid = z.string().uuid().optional().or(z.literal(""));

export const createStaffSchema = z.object({
  fullName: z.string().min(2).max(160),
  roleLabel: z.string().min(2).max(80),
  monthlyRateMinor: z.coerce.bigint().nonnegative(),
  currency: currency.default("IDR"),
  allocationScope: z.enum(STAFF_ALLOCATION_SCOPES).default("company"),
  villaId: optionalUuid,
  projectId: optionalUuid,
  notes: z.string().max(2000).optional().or(z.literal("")),
});

export const updateStaffSchema = createStaffSchema.extend({
  id: z.string().uuid(),
  active: z.coerce.boolean().optional().default(true),
});

export const setStaffActiveSchema = z.object({
  id: z.string().uuid(),
  active: z.coerce.boolean(),
});

export const runPayrollSchema = z.object({
  /** First day of the payroll month, YYYY-MM-01. */
  periodMonth: z.string().date(),
});

export type CreateStaffInput = z.infer<typeof createStaffSchema>;
export type RunPayrollInput = z.infer<typeof runPayrollSchema>;
