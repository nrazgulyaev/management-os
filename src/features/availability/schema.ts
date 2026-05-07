import { z } from "zod";
import { BLOCKING_BLOCK_TYPES } from "./calendar";

/** ISO datetime that survives Date round-trip. We accept a string (the
 *  form posts strings) and let the DB take it. */
const isoDate = z.string().min(8);

/** Block types operators can create from the UI. We omit `guest_booking`
 *  here on purpose — those rows are written by `syncBookingCalendarBlock`,
 *  never via the manual creation form. */
const MANUAL_BLOCK_TYPES = BLOCKING_BLOCK_TYPES.filter(
  (t) => t !== "guest_booking" && t !== "channel_hold",
);

export const createCalendarBlockSchema = z
  .object({
    villaId: z.string().uuid(),
    projectId: z.string().uuid().optional().nullable(),
    blockType: z.enum(MANUAL_BLOCK_TYPES as unknown as [string, ...string[]]),
    startsAt: isoDate,
    endsAt: isoDate,
    title: z.string().min(2).max(160),
    description: z.string().max(1000).optional().nullable(),
    ownerVisible: z.boolean().optional().default(false),
    guestVisible: z.boolean().optional().default(false),
  })
  .refine((d) => new Date(d.endsAt) > new Date(d.startsAt), {
    message: "endsAt must be after startsAt",
    path: ["endsAt"],
  });
export type CreateCalendarBlockInput = z.infer<typeof createCalendarBlockSchema>;

export const cancelCalendarBlockSchema = z.object({
  id: z.string().uuid(),
});

export const assignBookingToVillaSchema = z.object({
  bookingId: z.string().uuid(),
  villaId: z.string().uuid(),
});

export const expectedCheckoutTimeSchema = z.object({
  bookingId: z.string().uuid(),
  expectedCheckoutAt: isoDate,
  notes: z.string().max(400).optional().nullable(),
});

export const createCheckinCheckoutRequestSchema = z.object({
  bookingId: z.string().uuid(),
  villaId: z.string().uuid().optional().nullable(),
  requestType: z.enum([
    "early_checkin",
    "late_checkout",
    "expected_checkout_time",
    "early_checkout_notice",
  ]),
  requestedTime: isoDate.optional().nullable(),
  feeAmountMinor: z.number().int().nonnegative().optional().nullable(),
  currency: z.string().length(3).optional().nullable(),
  guestMessage: z.string().max(1000).optional().nullable(),
});

export const reviewCheckinCheckoutRequestSchema = z.object({
  id: z.string().uuid(),
  decision: z.enum(["approved", "rejected", "completed", "cancelled"]),
  adminNotes: z.string().max(1000).optional().nullable(),
});

export const setReadinessSchema = z.object({
  villaId: z.string().uuid(),
  readinessStatus: z.enum([
    "unknown",
    "dirty",
    "cleaning",
    "inspection",
    "ready",
    "occupied",
    "maintenance_block",
    "out_of_order",
  ]),
  relatedBookingId: z.string().uuid().optional().nullable(),
  relatedTaskId: z.string().uuid().optional().nullable(),
  notes: z.string().max(400).optional().nullable(),
});

export const createResponsibilityScopeSchema = z.object({
  userId: z.string().uuid(),
  roleKey: z.string().min(2).max(40).optional().nullable(),
  projectId: z.string().uuid().optional().nullable(),
  villaId: z.string().uuid().optional().nullable(),
  taskCategory: z.string().min(2).max(40).optional().nullable(),
  scopeType: z
    .enum([
      "operations",
      "housekeeping",
      "maintenance",
      "front_office",
      "security",
      "procurement",
      "finance",
    ])
    .default("operations"),
});

export const archiveResponsibilityScopeSchema = z.object({
  id: z.string().uuid(),
});

// Stage 6.P5-CATCHUP — edit shape for an existing scope row.
export const editResponsibilityScopeSchema = z.object({
  id: z.string().uuid(),
  roleKey: z.string().min(2).max(40).optional().nullable(),
  projectId: z.string().uuid().optional().nullable(),
  villaId: z.string().uuid().optional().nullable(),
  taskCategory: z.string().min(2).max(40).optional().nullable(),
  scopeType: z
    .enum([
      "operations",
      "housekeeping",
      "maintenance",
      "front_office",
      "security",
      "procurement",
      "finance",
    ])
    .optional(),
});

export const createCameraDeviceSchema = z.object({
  projectId: z.string().uuid().optional().nullable(),
  villaId: z.string().uuid().optional().nullable(),
  name: z.string().min(2).max(160),
  locationLabel: z.string().min(2).max(160),
  provider: z.string().max(80).optional().nullable(),
  externalAppUrl: z
    .string()
    .url()
    .max(500)
    .optional()
    .nullable()
    .or(z.literal("")),
  accessRole: z.string().max(40).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

export const updateCameraDeviceSchema = createCameraDeviceSchema.extend({
  id: z.string().uuid(),
  status: z
    .enum(["active", "offline", "maintenance", "archived"])
    .optional(),
  lastCheckedAt: isoDate.optional().nullable(),
});
