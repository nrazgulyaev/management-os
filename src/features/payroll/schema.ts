import { z } from "zod";
import {
  STAFF_ALLOCATION_SCOPES,
  STAFF_COMP_MODES,
  STAFF_COST_BEARERS,
  PTKP_STATUSES,
} from "@/lib/db/schema/payroll";

const currency = z.string().length(3).toUpperCase();
const optionalUuid = z.string().uuid().optional().or(z.literal(""));
/** Optional YYYY-MM-DD date field: blank → undefined. */
const optionalDate = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : undefined))
  .pipe(z.string().date().optional());

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
  // Effective-dating (migration 0172). Both blank → always active (legacy).
  hiredOn: optionalDate,
  endedOn: optionalDate,
  rateEffectiveFrom: optionalDate,
  // Indonesian statutory opt-in (only meaningful for salaried + org-enabled).
  statutoryEnabled: z.coerce.boolean().optional().default(false),
  ptkpStatus: z.preprocess(
    (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : undefined),
    z.enum(PTKP_STATUSES).optional(),
  ),
  noNpwp: z.coerce.boolean().optional().default(false),
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

/** A percent rate (0..100) with up to 4 decimals, coerced from the form. */
const pct = z.coerce.number().min(0).max(100);
/** A bigint minor-unit cap, coerced from the money widget. */
const capMinor = z.coerce.bigint().nonnegative();

/**
 * Org-level BPJS / PPh21 settings editor. All fields editable defaults; the
 * researched 2026 figures pre-fill the form. Upserted (one row per org).
 */
export const orgPayrollSettingsSchema = z.object({
  statutoryEnabled: z.coerce.boolean().optional().default(false),
  jhtEmployerPct: pct.default(3.7),
  jhtEmployeePct: pct.default(2),
  jkkEmployerPct: pct.default(0.24),
  jkmEmployerPct: pct.default(0.3),
  jpEmployerPct: pct.default(2),
  jpEmployeePct: pct.default(1),
  jpCapMinor: capMinor.default(1108630000n),
  kesehatanEmployerPct: pct.default(4),
  kesehatanEmployeePct: pct.default(1),
  kesehatanCapMinor: capMinor.default(1200000000n),
  pph21Enabled: z.coerce.boolean().optional().default(true),
  noNpwpSurchargePct: pct.default(20),
  currency: currency.default("IDR"),
});

export type CreateStaffInput = z.infer<typeof createStaffSchema>;
export type RunPayrollInput = z.infer<typeof runPayrollSchema>;
export type OrgPayrollSettingsInput = z.infer<typeof orgPayrollSettingsSchema>;
