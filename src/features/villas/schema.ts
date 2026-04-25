import { z } from "zod";

export const villaStatusEnum = z.enum([
  "occupied",
  "checkout_pending",
  "cleaning",
  "inspection",
  "ready",
  "maintenance_blocked",
  "owner_stay",
  "out_of_service",
]);
export const villaModelEnum = z.enum(["individual", "pooled", "hybrid"]);

export const createVillaSchema = z.object({
  projectId: z.string().uuid("Pick a project"),
  unitCode: z.string().min(1).max(32),
  slug: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, "Lowercase, hyphenated"),
  name: z.string().max(160).optional().or(z.literal("")),
  status: villaStatusEnum.default("ready"),
  bedrooms: z.coerce.number().int().min(0).max(20).default(0),
  bathrooms: z.coerce.number().min(0).max(20).optional(),
  builtAreaSqm: z.coerce.number().min(0).max(5000).optional(),
  landAreaSqm: z.coerce.number().min(0).max(50000).optional(),
  poolAreaSqm: z.coerce.number().min(0).max(2000).optional(),
  viewType: z.string().max(64).optional().or(z.literal("")),
  managementModel: villaModelEnum.default("individual"),
  currentNightlyRateUsd: z.coerce.number().min(0).max(20000).optional(),
});

export type CreateVillaInput = z.infer<typeof createVillaSchema>;
