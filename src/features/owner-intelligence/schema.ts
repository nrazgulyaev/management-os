import { z } from "zod";

export const calendarDensityEnum = z.enum([
  "compact",
  "comfortable",
  "detailed",
]);

export const updateOwnerCalendarPreferencesSchema = z.object({
  ownerId: z.string().uuid(),
  defaultCurrency: z.string().min(3).max(8).optional(),
  showGuestNames: z.coerce.boolean().optional(),
  showGuestCountry: z.coerce.boolean().optional(),
  showChannelLabels: z.coerce.boolean().optional(),
  showMaintenanceDetails: z.coerce.boolean().optional(),
  calendarDensity: calendarDensityEnum.optional(),
});

export const generateVillaHealthSnapshotSchema = z.object({
  villaId: z.string().uuid(),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const generateAllSnapshotsSchema = z.object({
  /** YYYY-MM (defaults to current calendar month). */
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
});

export const guestReviewSourceEnum = z.enum([
  "direct",
  "airbnb",
  "booking_com",
  "google",
  "internal_survey",
  "manual",
]);

export const guestReviewStatusEnum = z.enum([
  "draft",
  "published",
  "hidden",
  "flagged",
]);

export const guestReviewSentimentEnum = z.enum([
  "positive",
  "neutral",
  "negative",
  "mixed",
]);

export const createManualGuestReviewSchema = z.object({
  villaId: z.string().uuid(),
  bookingId: z.string().uuid().optional(),
  source: guestReviewSourceEnum.default("manual"),
  reviewerDisplayName: z.string().trim().max(80).optional(),
  reviewerCountry: z.string().trim().max(40).optional(),
  rating: z.coerce.number().min(0).max(5).optional(),
  text: z.string().trim().max(4000).optional(),
  reviewDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  ownerVisible: z.coerce.boolean().optional().default(true),
  publicVisible: z.coerce.boolean().optional().default(false),
  status: guestReviewStatusEnum.optional().default("published"),
  sentiment: guestReviewSentimentEnum.optional(),
});

export const reviewIdSchema = z.object({ id: z.string().uuid() });
