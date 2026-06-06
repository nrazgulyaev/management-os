import { z } from "zod";

export const channelTypeEnum = z.enum(["ota", "direct", "agent", "social", "corporate"]);
export const channelStatusEnum = z.enum(["active", "paused", "inactive", "archived"]);
export const commissionModelEnum = z.enum(["percent", "fixed", "tiered", "none"]);

export const createChannelSchema = z.object({
  key: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9_]+$/, "Lowercase letters, digits, and underscores only"),
  name: z.string().min(2).max(80),
  type: channelTypeEnum.default("ota"),
  commissionModel: z.preprocess(
    (v) => (v === "" || v === undefined ? undefined : v),
    commissionModelEnum.optional(),
  ),
  defaultCommissionPct: z.coerce.number().min(0).max(100).optional(),
  status: channelStatusEnum.default("active"),
});

export type CreateChannelInput = z.infer<typeof createChannelSchema>;

/** Key is the immutable code identifier — not editable. */
export const updateChannelSchema = createChannelSchema.omit({ key: true });
export type UpdateChannelInput = z.infer<typeof updateChannelSchema>;
