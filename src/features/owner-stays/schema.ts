import { z } from "zod";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const createOwnerStayPolicySchema = z.object({
  policyName: z.string().min(2).max(160),
  projectId: z.string().uuid().optional().nullable(),
  villaId: z.string().uuid().optional().nullable(),
  freeNightsPerYear: z.number().int().min(0).max(365).default(14),
  freeNightsApplyToPeak: z.boolean().optional().default(false),
  requiresApproval: z.boolean().optional().default(true),
  allowDisplacingGuestBookings: z.boolean().optional().default(false),
  relocationAllowed: z.boolean().optional().default(true),
  operationalCostModel: z
    .enum(["none", "actual_costs", "fixed_per_stay", "fixed_per_night"])
    .default("actual_costs"),
  fixedOperationalCostMinor: z.number().int().nonnegative().optional().nullable(),
  currency: z.string().length(3).optional().nullable(),
  compensationModel: z
    .enum([
      "none",
      "fixed_per_night",
      "management_fee_on_expected_gross",
      "percent_of_expected_gross",
    ])
    .default("management_fee_on_expected_gross"),
  compensationPercent: z.number().min(0).max(100).optional().nullable(),
  fixedCompensationMinor: z.number().int().nonnegative().optional().nullable(),
});

export const archiveOwnerStayPolicySchema = z.object({
  id: z.string().uuid(),
});

export const createOwnerStayRequestSchema = z
  .object({
    ownerId: z.string().uuid(),
    villaId: z.string().uuid(),
    requestedStart: date,
    requestedEnd: date,
    guestsCount: z.number().int().min(0).max(40).optional().nullable(),
    purpose: z.string().max(500).optional().nullable(),
  })
  .refine((d) => d.requestedEnd > d.requestedStart, {
    message: "requestedEnd must be after requestedStart",
    path: ["requestedEnd"],
  });
export type CreateOwnerStayRequestInput = z.infer<
  typeof createOwnerStayRequestSchema
>;

export const ownerStayIdSchema = z.object({ id: z.string().uuid() });

export const reviewOwnerStayRequestSchema = z.object({
  id: z.string().uuid(),
  decision: z.enum(["approved", "rejected"]),
  adminNotes: z.string().max(1000).optional().nullable(),
});

export const createEquivalenceGroupSchema = z.object({
  name: z.string().min(2).max(160),
  projectId: z.string().uuid().optional().nullable(),
  description: z.string().max(500).optional().nullable(),
});

export const addEquivalenceMemberSchema = z.object({
  groupId: z.string().uuid(),
  villaId: z.string().uuid(),
  qualityRank: z.number().int().min(0).max(1000).default(100),
  notes: z.string().max(500).optional().nullable(),
});

export const reviewRelocationCandidateSchema = z.object({
  id: z.string().uuid(),
  decision: z.enum(["approved", "rejected"]),
});

export const applyRelocationCandidateSchema = z.object({
  id: z.string().uuid(),
});
