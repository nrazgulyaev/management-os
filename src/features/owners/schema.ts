import { z } from "zod";

export const ownerTypeEnum = z.enum(["individual", "company", "family_office"]);
export const ownerStatusEnum = z.enum(["active", "inactive", "onboarding", "archived"]);

export const createOwnerSchema = z.object({
  type: ownerTypeEnum.default("individual"),
  displayName: z.string().min(2).max(160),
  legalName: z.string().max(200).optional().or(z.literal("")),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(40).optional().or(z.literal("")),
  nationality: z.string().max(80).optional().or(z.literal("")),
  taxResidency: z.string().max(80).optional().or(z.literal("")),
  status: ownerStatusEnum.default("active"),
});

export type CreateOwnerInput = z.infer<typeof createOwnerSchema>;
