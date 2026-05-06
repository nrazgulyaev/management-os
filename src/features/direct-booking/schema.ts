import { z } from "zod";

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

export const createHoldRequestSchema = z
  .object({
    villaId: z.string().uuid(),
    checkIn: z.string().regex(isoDate),
    checkOut: z.string().regex(isoDate),
    guestCount: z.coerce.number().int().min(1).max(40).default(1),
    channelKey: z.string().trim().min(2).max(40).default("direct"),
  })
  .refine((d) => d.checkOut > d.checkIn, {
    message: "checkOut must be after checkIn",
    path: ["checkOut"],
  });

export const submitHoldFormSchema = z.object({
  guestFirstName: z.string().trim().min(1).max(80),
  guestLastName: z.string().trim().max(80).optional(),
  guestEmail: z.string().trim().email().max(160),
  guestPhone: z.string().trim().max(40).optional(),
  guestCountry: z.string().trim().max(60).optional(),
  guestCount: z.coerce.number().int().min(1).max(40),
  specialRequests: z.string().trim().max(2000).optional(),
  arrivalTime: z.string().trim().max(40).optional(),
  purposeOfStay: z
    .enum(["holiday", "family", "honeymoon", "business", "event", "other"])
    .optional(),
  marketingConsent: z.coerce.boolean().optional().default(false),
  // Strict — must be true. Browsers post a checked checkbox as the
  // literal string "true"; `coerce` lifts that to boolean before the
  // refine. A missing key fails parsing because zod treats undefined
  // as absent here (we don't add `.optional()`).
  termsAccepted: z.coerce
    .boolean()
    .refine((v) => v === true, { message: "termsAccepted must be true" }),
});

export const holdIdSchema = z.object({ id: z.string().uuid() });
export const requestIdSchema = z.object({ id: z.string().uuid() });

export const decisionSchema = z.object({
  id: z.string().uuid(),
  decisionNote: z.string().trim().max(2000).optional(),
});

export const convertRequestSchema = z.object({
  id: z.string().uuid(),
  channelId: z.string().uuid().optional(),
  finalStatus: z.enum(["confirmed", "tentative"]).default("tentative"),
  /** Director / super_admin override: convert without a paid deposit. */
  convertWithoutDeposit: z.coerce.boolean().optional().default(false),
  overrideReason: z.string().trim().max(500).optional(),
});

export type CreateHoldRequestInput = z.infer<typeof createHoldRequestSchema>;
export type SubmitHoldFormInput = z.infer<typeof submitHoldFormSchema>;
