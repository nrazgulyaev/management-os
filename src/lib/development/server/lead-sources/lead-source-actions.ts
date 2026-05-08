"use server";
import "server-only";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { marketingLeadSources } from "@/lib/db/schema/marketing";

const createSchema = z.object({
  sourceKey: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9_]+$/, "snake_case only"),
  displayName: z.string().min(2).max(100),
  channelType: z.string(),
  platform: z.string().optional(),
  isPaid: z.boolean().default(false),
  defaultAttributionModel: z
    .enum(["first_touch", "last_touch", "linear", "time_decay", "position_based"])
    .optional(),
});

export async function createLeadSource(input: z.input<typeof createSchema>) {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message };
  }
  const db = getDb();
  if (!db) return { ok: false as const, error: "DB not configured" };
  await db.insert(marketingLeadSources).values({
    sourceKey: parsed.data.sourceKey,
    displayName: parsed.data.displayName,
    channelType: parsed.data.channelType,
    platform: parsed.data.platform ?? null,
    isPaid: parsed.data.isPaid,
    defaultAttributionModel: parsed.data.defaultAttributionModel ?? null,
  });
  return { ok: true as const };
}

export async function deactivateLeadSource(sourceKey: string) {
  const db = getDb();
  if (!db) return { ok: false as const, error: "DB not configured" };
  await db
    .update(marketingLeadSources)
    .set({ isActive: false })
    .where(eq(marketingLeadSources.sourceKey, sourceKey));
  return { ok: true as const };
}

/**
 * Stage 10.E.6 — edit a lead source's display fields. The
 * `sourceKey` is immutable post-create (it's referenced by historical
 * lead rows). Other fields (displayName, channelType, platform,
 * isPaid, defaultAttributionModel) are operationally correctable.
 */
const updateSchema = createSchema.omit({ sourceKey: true });

export async function updateLeadSource(
  sourceKey: string,
  input: z.input<typeof updateSchema>,
) {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message };
  }
  const db = getDb();
  if (!db) return { ok: false as const, error: "DB not configured" };
  await db
    .update(marketingLeadSources)
    .set({
      displayName: parsed.data.displayName,
      channelType: parsed.data.channelType,
      platform: parsed.data.platform ?? null,
      isPaid: parsed.data.isPaid,
      defaultAttributionModel: parsed.data.defaultAttributionModel ?? null,
    })
    .where(eq(marketingLeadSources.sourceKey, sourceKey));
  return { ok: true as const };
}
