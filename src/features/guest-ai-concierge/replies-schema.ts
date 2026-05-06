import { z } from "zod";

export const visibilityEnum = z.enum(["guest_visible", "internal_only"]);

export const guestReplySchema = z.object({
  token: z.string().min(16),
  handoffId: z.string().uuid(),
  body: z.string().trim().min(1).max(2000),
});
export type GuestReplyInput = z.infer<typeof guestReplySchema>;

export const staffReplySchema = z.object({
  handoffId: z.string().uuid(),
  visibility: visibilityEnum.default("guest_visible"),
  body: z.string().trim().min(1).max(2000),
});
export type StaffReplyInput = z.infer<typeof staffReplySchema>;

export const markReadSchema = z.object({
  token: z.string().min(16).optional(),
  handoffId: z.string().uuid(),
});
