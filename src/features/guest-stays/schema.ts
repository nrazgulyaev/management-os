import { z } from "zod";

const isoDate = z.string().min(8);

export const issueGuestStayTokenSchema = z.object({
  bookingId: z.string().uuid(),
  issuedToEmail: z.string().email().optional().nullable(),
  issuedToPhone: z.string().max(40).optional().nullable(),
  expiresAt: isoDate.optional().nullable(),
});

export const revokeGuestStayTokenSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().max(400).optional().nullable(),
});

export const createGuestServiceRequestSchema = z.object({
  token: z.string().min(20).max(120),
  category: z.enum([
    "amenity",
    "maintenance",
    "concierge",
    "housekeeping",
    "transport",
    "other",
  ]),
  title: z.string().min(2).max(160),
  description: z.string().max(2000).optional().nullable(),
  urgency: z.enum(["low", "normal", "high"]).default("normal"),
  preferredTime: isoDate.optional().nullable(),
  contactPreference: z.enum(["any", "phone", "email", "in_app"]).optional().nullable(),
});
export type CreateGuestServiceRequestInput = z.infer<
  typeof createGuestServiceRequestSchema
>;
