import { z } from "zod";

export const guestMarkReadSchema = z.object({
  token: z.string().min(16),
  handoffCode: z.string().min(3).max(40),
});

export const staffMarkReadSchema = z.object({
  handoffId: z.string().uuid(),
});
