import { z } from "zod";

export const bookingStatusEnum = z.enum([
  "inquiry",
  "tentative",
  "confirmed",
  "checked_in",
  "checked_out",
  "cancelled",
  "no_show",
]);

export const createBookingSchema = z
  .object({
    villaId: z.string().uuid("Pick a villa"),
    channelId: z.string().uuid().optional().or(z.literal("")),
    guestId: z.string().uuid().optional().or(z.literal("")),
    bookingCode: z.string().min(2).max(64),
    sourceReference: z.string().max(160).optional().or(z.literal("")),
    status: bookingStatusEnum.default("confirmed"),
    checkIn: z.string().date(),
    checkOut: z.string().date(),
    adults: z.coerce.number().int().min(0).max(40).optional(),
    children: z.coerce.number().int().min(0).max(20).optional(),
    currency: z.string().length(3).toUpperCase().default("USD"),
    grossAmount: z.coerce.number().min(0).max(1_000_000),
    cleaningFeeAmount: z.coerce.number().min(0).max(1_000_000).default(0),
    channelFeeAmount: z.coerce.number().min(0).max(1_000_000).default(0),
    paymentFeeAmount: z.coerce.number().min(0).max(1_000_000).default(0),
    notes: z.string().max(2000).optional().or(z.literal("")),
  })
  .refine(
    (v) => new Date(v.checkOut) > new Date(v.checkIn),
    { message: "Check-out must be after check-in", path: ["checkOut"] },
  );

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
