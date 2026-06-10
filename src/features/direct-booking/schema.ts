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

/**
 * Operator-initiated "create a direct hold ON BEHALF of a guest".
 * Unlike the public `createHoldRequestSchema`, the operator can also
 * capture guest contact in the same step (folds the public quote→hold
 * and the submit-form into one staff action). Guest fields are optional:
 * an operator can place a bare hold and capture the guest later.
 */
export const operatorCreateHoldSchema = z
  .object({
    villaId: z.string().uuid(),
    checkIn: z.string().regex(isoDate),
    checkOut: z.string().regex(isoDate),
    guestCount: z.coerce.number().int().min(1).max(40).default(1),
    // Optional guest capture (when present, also opens a submitted request).
    guestFirstName: z.string().trim().max(80).optional(),
    guestLastName: z.string().trim().max(80).optional(),
    guestEmail: z
      .union([z.string().trim().email().max(160), z.literal("")])
      .optional(),
    guestPhone: z.string().trim().max(40).optional(),
    guestCountry: z.string().trim().max(60).optional(),
    specialRequests: z.string().trim().max(2000).optional(),
    arrivalTime: z.string().trim().max(40).optional(),
    purposeOfStay: z
      .enum(["holiday", "family", "honeymoon", "business", "event", "other"])
      .optional(),
  })
  .refine((d) => d.checkOut > d.checkIn, {
    message: "Check-out must be after check-in.",
    path: ["checkOut"],
  })
  .refine(
    (d) =>
      // If any guest contact field is filled, require at least a name + email.
      !hasGuestCapture(d) ||
      (!!d.guestFirstName && !!d.guestEmail && d.guestEmail !== ""),
    {
      message:
        "When capturing a guest, both first name and email are required.",
      path: ["guestEmail"],
    },
  );

function hasGuestCapture(d: {
  guestFirstName?: string;
  guestLastName?: string;
  guestEmail?: string;
  guestPhone?: string;
  guestCountry?: string;
  specialRequests?: string;
}): boolean {
  return Boolean(
    d.guestFirstName ||
      d.guestLastName ||
      (d.guestEmail && d.guestEmail !== "") ||
      d.guestPhone ||
      d.guestCountry ||
      d.specialRequests,
  );
}

export type OperatorCreateHoldInput = z.infer<typeof operatorCreateHoldSchema>;
