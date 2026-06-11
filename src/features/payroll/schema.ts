import { z } from "zod";
import {
  STAFF_ALLOCATION_SCOPES,
  STAFF_COMP_MODES,
  STAFF_COST_BEARERS,
} from "@/lib/db/schema/payroll";

const currency = z.string().length(3).toUpperCase();
const optionalUuid = z.string().uuid().optional().or(z.literal(""));

/**
 * One assignment target: a villa OR a project, plus a per_villa fan-out weight.
 * Submitted as JSON in the `assignments` form field (the multi-target editor is
 * a client component that serialises its rows into one hidden input).
 */
export const assignmentInputSchema = z
  .object({
    villaId: z.string().uuid().nullish(),
    projectId: z.string().uuid().nullish(),
    weight: z.coerce.number().positive().max(1000).default(1),
  })
  .refine((a) => Boolean(a.villaId) !== Boolean(a.projectId), {
    message: "Each assignment must target exactly one villa OR one project.",
  });

export type AssignmentInput = z.infer<typeof assignmentInputSchema>;

/** Parse the `assignments` hidden field (JSON array). Empty/blank → []. */
const assignmentsField = z
  .string()
  .optional()
  .transform((raw, ctx) => {
    if (!raw || raw.trim() === "" || raw.trim() === "[]") return [] as AssignmentInput[];
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Assignments are malformed." });
      return z.NEVER;
    }
    const result = z.array(assignmentInputSchema).max(200).safeParse(parsed);
    if (!result.success) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Assignments are invalid." });
      return z.NEVER;
    }
    return result.data;
  });

export const createStaffSchema = z.object({
  fullName: z.string().min(2).max(160),
  roleLabel: z.string().min(2).max(80),
  compMode: z.enum(STAFF_COMP_MODES).default("salaried"),
  costBearer: z.enum(STAFF_COST_BEARERS).default("owner"),
  // monthly_rate_minor used by salaried; per_villa_rate_minor by per_villa_fixed.
  // Both coerced from the same money widget; only the relevant one is required
  // (enforced in the action against compMode). Default 0 keeps NOT NULL happy.
  monthlyRateMinor: z.coerce.bigint().nonnegative().default(0n),
  perVillaRateMinor: z.coerce.bigint().nonnegative().optional(),
  currency: currency.default("IDR"),
  allocationScope: z.enum(STAFF_ALLOCATION_SCOPES).default("company"),
  villaId: optionalUuid,
  projectId: optionalUuid,
  assignments: assignmentsField,
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
