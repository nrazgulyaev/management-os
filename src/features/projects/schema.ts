import { z } from "zod";

const slug = z
  .string()
  .min(2, "Slug too short")
  .max(64, "Slug too long")
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, "Lowercase, hyphenated, no leading/trailing dashes");

export const projectStatusEnum = z.enum([
  "planning",
  "under_construction",
  "active",
  "managed",
  "archived",
]);
export const projectMgmtStatusEnum = z.enum([
  "lead",
  "onboarding",
  "managed",
  "paused",
  "exited",
]);

export const createProjectSchema = z.object({
  slug,
  name: z.string().min(2, "Name is required"),
  concept: z.string().max(280).optional().or(z.literal("")),
  location: z.string().min(2, "Location is required"),
  area: z.string().max(120).optional().or(z.literal("")),
  description: z.string().max(2000).optional().or(z.literal("")),
  status: projectStatusEnum.default("active"),
  managementStatus: projectMgmtStatusEnum.default("managed"),
  totalVillas: z.coerce.number().int().min(0).max(500).optional(),
  targetHandoverDate: z.string().date().optional().or(z.literal("")),
  leaseholdUntil: z.string().date().optional().or(z.literal("")),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export type ProjectStatus = z.infer<typeof projectStatusEnum>;
export type ProjectManagementStatus = z.infer<typeof projectMgmtStatusEnum>;
