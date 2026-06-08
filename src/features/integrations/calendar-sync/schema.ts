import { z } from "zod";
import { isObviouslyPrivateUrl } from "@/lib/net/safe-url";

const optionalUuid = z
  .string()
  .uuid()
  .optional()
  .or(z.literal(""))
  .transform((v) => (v === "" ? undefined : v));

const optionalText = z.string().max(2000).optional().or(z.literal(""));

export const feedTypeEnum = z.enum([
  "ical",
  "manual_ics",
  "airbnb_ical",
  "booking_ical",
  "vrbo_ical",
]);

export const feedStatusEnum = z.enum(["active", "paused", "error", "archived"]);

export const createCalendarFeedSchema = z.object({
  villaId: z.string().uuid(),
  projectId: optionalUuid,
  bookingChannelId: optionalUuid,
  feedName: z.string().min(2).max(200),
  feedUrl: z
    .string()
    .url("Must be a valid URL")
    .refine(
      (u) => /^https?:\/\//i.test(u),
      "Only http(s) URLs are accepted",
    )
    .refine(
      (u) => !isObviouslyPrivateUrl(u),
      "URL must be a public address (private / loopback / metadata hosts are blocked)",
    ),
  feedType: feedTypeEnum.default("ical"),
  syncIntervalMinutes: z.coerce.number().int().min(15).max(60 * 24).optional().default(180),
  notes: optionalText,
});

export const feedIdSchema = z.object({ id: z.string().uuid() });

export const calendarEventIdSchema = z.object({ id: z.string().uuid() });

export const conflictIdSchema = z.object({ id: z.string().uuid() });

export type CreateCalendarFeedInput = z.infer<typeof createCalendarFeedSchema>;
