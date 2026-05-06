"use server";
import "server-only";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { apiKeys } from "@/lib/db/schema/saas";
import { generateApiKey } from "./api-key-helpers";

const createSchema = z.object({
  organizationId: z.string().uuid(),
  keyLabel: z.string().min(2).max(120),
  keyType: z.enum(["live", "test"]).default("live"),
  scopes: z.array(z.string()).default([]),
  rateLimitPerMinute: z.number().int().nonnegative().default(60),
  rateLimitPerHour: z.number().int().nonnegative().default(1000),
  rateLimitPerDay: z.number().int().nonnegative().default(10000),
  createdBy: z.string().uuid(),
  expiresAt: z.date().optional(),
});

/**
 * Create a new API key. Returns the **plaintext** key in the result —
 * this is the ONLY time the key will ever be shown. The hash is what
 * gets persisted; the prefix + last4 are stored for UI display.
 */
export async function createApiKey(input: z.input<typeof createSchema>) {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message };
  }
  const db = getDb();
  if (!db) return { ok: false as const, error: "DB not configured" };

  const parts = generateApiKey(parsed.data.keyType);
  const inserted = await db
    .insert(apiKeys)
    .values({
      organizationId: parsed.data.organizationId,
      keyLabel: parsed.data.keyLabel,
      keyType: parsed.data.keyType,
      keyPrefix: parts.prefix,
      keyHash: parts.hash,
      keyLast4: parts.last4,
      scopes: parsed.data.scopes,
      rateLimitPerMinute: parsed.data.rateLimitPerMinute,
      rateLimitPerHour: parsed.data.rateLimitPerHour,
      rateLimitPerDay: parsed.data.rateLimitPerDay,
      createdBy: parsed.data.createdBy,
      expiresAt: parsed.data.expiresAt ?? null,
    })
    .returning({ id: apiKeys.id });
  return {
    ok: true as const,
    keyId: inserted[0].id,
    fullKey: parts.fullKey, // displayed once
    last4: parts.last4,
  };
}

export async function revokeApiKey(args: {
  keyId: string;
  revokedBy: string;
  reason?: string;
}) {
  const db = getDb();
  if (!db) return { ok: false as const, error: "DB not configured" };
  await db
    .update(apiKeys)
    .set({
      isActive: false,
      revokedAt: new Date(),
      revokedBy: args.revokedBy,
      revocationReason: args.reason ?? null,
    })
    .where(eq(apiKeys.id, args.keyId));
  return { ok: true as const };
}
