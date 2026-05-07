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

/**
 * Stage 6.P5-CATCHUP — Rotate an API key.
 *
 * Atomic: revokes the existing key + creates a fresh key with the same
 * label + scopes + rate limits + key type. Returns the **plaintext** new
 * key (shown once, never persisted). Idempotent: rotating an already-
 * revoked key fails fast.
 */
const rotateSchema = z.object({
  keyId: z.string().uuid(),
  rotatedBy: z.string().uuid(),
  reason: z.string().max(200).optional(),
});

export async function rotateApiKey(input: z.input<typeof rotateSchema>) {
  const parsed = rotateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message };
  }
  const db = getDb();
  if (!db) return { ok: false as const, error: "DB not configured" };

  const [existing] = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.id, parsed.data.keyId))
    .limit(1);
  if (!existing) {
    return { ok: false as const, error: "API key not found" };
  }
  if (!existing.isActive) {
    return {
      ok: false as const,
      error: "Cannot rotate a revoked key. Create a fresh key instead.",
    };
  }

  // Generate new key with the same shape.
  const parts = generateApiKey(existing.keyType as "live" | "test");

  // Atomic: revoke old + insert new in one transaction.
  const [inserted] = await db.transaction(async (tx) => {
    await tx
      .update(apiKeys)
      .set({
        isActive: false,
        revokedAt: new Date(),
        revokedBy: parsed.data.rotatedBy,
        revocationReason:
          parsed.data.reason && parsed.data.reason !== ""
            ? `[rotation] ${parsed.data.reason}`
            : "[rotation] superseded",
      })
      .where(eq(apiKeys.id, parsed.data.keyId));
    return await tx
      .insert(apiKeys)
      .values({
        organizationId: existing.organizationId,
        keyLabel: existing.keyLabel,
        keyType: existing.keyType,
        keyPrefix: parts.prefix,
        keyHash: parts.hash,
        keyLast4: parts.last4,
        scopes: existing.scopes,
        rateLimitPerMinute: existing.rateLimitPerMinute,
        rateLimitPerHour: existing.rateLimitPerHour,
        rateLimitPerDay: existing.rateLimitPerDay,
        createdBy: parsed.data.rotatedBy,
        expiresAt: existing.expiresAt,
        notes: existing.notes
          ? `${existing.notes}\n[rotated from ${existing.id}]`
          : `[rotated from ${existing.id}]`,
      })
      .returning({ id: apiKeys.id });
  });

  return {
    ok: true as const,
    keyId: inserted.id,
    fullKey: parts.fullKey,
    last4: parts.last4,
    rotatedFrom: parsed.data.keyId,
  };
}
