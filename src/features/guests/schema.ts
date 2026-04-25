import { z } from "zod";

export const guestStatusEnum = z.enum(["active", "archived"]);

export const createGuestSchema = z.object({
  fullName: z.string().min(2).max(160),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(40).optional().or(z.literal("")),
  nationality: z.string().max(80).optional().or(z.literal("")),
  preferredLanguage: z.string().max(40).optional().or(z.literal("")),
  whatsapp: z.string().max(40).optional().or(z.literal("")),
  status: guestStatusEnum.default("active"),
});

export type CreateGuestInput = z.infer<typeof createGuestSchema>;
