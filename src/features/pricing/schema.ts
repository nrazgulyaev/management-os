import { z } from "zod";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const createRatePlanSchema = z.object({
  name: z.string().min(2).max(160),
  projectId: z.string().uuid().optional().nullable(),
  villaId: z.string().uuid().optional().nullable(),
  baseCurrency: z.string().length(3).default("USD"),
  baseNightlyRateMinor: z.number().int().nonnegative().default(0),
  managementFeePercent: z.number().min(0).max(100).optional().nullable(),
});

export const updateRatePlanSchema = createRatePlanSchema.extend({
  id: z.string().uuid(),
  status: z.enum(["active", "archived"]).optional(),
});

export const createSeasonSchema = z
  .object({
    ratePlanId: z.string().uuid(),
    name: z.string().min(2).max(160),
    startsOn: date,
    endsOn: date,
    multiplier: z.number().min(0).max(10).default(1),
    nightlyRateMinor: z.number().int().nonnegative().optional().nullable(),
    minLos: z.number().int().min(1).max(365).optional().nullable(),
    maxLos: z.number().int().min(1).max(365).optional().nullable(),
    stopSell: z.boolean().optional().default(false),
  })
  .refine((d) => d.endsOn >= d.startsOn, {
    message: "endsOn must be on or after startsOn",
    path: ["endsOn"],
  });

export const upsertOverrideSchema = z.object({
  ratePlanId: z.string().uuid(),
  stayDate: date,
  nightlyRateMinor: z.number().int().nonnegative().optional().nullable(),
  minLos: z.number().int().min(1).max(365).optional().nullable(),
  stopSell: z.boolean().optional().default(false),
  source: z.enum(["manual", "pricelabs", "channel", "import"]).default("manual"),
  notes: z.string().max(500).optional().nullable(),
});
