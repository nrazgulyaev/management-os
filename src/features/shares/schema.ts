import { z } from "zod";

export const shareModelEnum = z.enum(["individual", "pooled", "hybrid"]);
export const shareStatusEnum = z.enum(["active", "scheduled", "ended"]);

export const createShareSchema = z
  .object({
    ownerId: z.string().uuid("Pick an owner"),
    villaId: z.string().uuid().optional().or(z.literal("")),
    projectId: z.string().uuid().optional().or(z.literal("")),
    sharePercent: z.coerce.number().gt(0, "Must be greater than 0").lte(100, "Cannot exceed 100"),
    model: shareModelEnum.default("individual"),
    startsOn: z.string().date(),
    endsOn: z.string().date().optional().or(z.literal("")),
    status: shareStatusEnum.default("active"),
  })
  .refine((d) => Boolean(d.villaId) || Boolean(d.projectId), {
    message: "Pick either a villa (individual / hybrid) or a project (pooled).",
    path: ["villaId"],
  })
  .refine(
    (d) => (d.model === "pooled" ? Boolean(d.projectId) && !d.villaId : true),
    { message: "Pooled shares must reference a project, not a villa.", path: ["model"] },
  )
  .refine(
    (d) => (d.model !== "pooled" ? Boolean(d.villaId) : true),
    { message: "Individual / hybrid shares must reference a villa.", path: ["model"] },
  );

export type CreateShareInput = z.infer<typeof createShareSchema>;
