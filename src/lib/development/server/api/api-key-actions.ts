"use server";
import "server-only";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { apiKeys } from "@/lib/db/schema/saas";
import { requireInternalUser } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import { generateApiKey } from "./api-key-helpers";

const createSchema = z.object({
  keyLabel: z.string().min(2).max(120),
  keyType: z.enum(["live", "test"]).default("live"),
  scopes: z.array(z.string()).default([]),
  rateLimitPerMinute: z.number().int().nonnegative().default(60),
  rateLimitPerHour: z.number().int().nonnegative().default(1000),
  rateLimitPerDay: z.number().int().nonnegative().default(10000),
  expiresAt: z.date().optional(),
});

/**
 * Create a new API key. Returns the **plaintext** key in the result —
 * this is the ONLY time the key will ever be shown. The hash is what
 * gets persisted; the prefix + last4 are stored for UI display.
 */
export async function createApiKey(input: z.input<typeof createSchema>) {
  const ctx = await requireInternalUser();
  if (!ctx.appUser) {
    return { ok: false as const, error: "Authenticated user required" };
  }
  const organizationId = await requireOrgId();
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
      organizationId,
      keyLabel: parsed.data.keyLabel,
      keyType: parsed.data.keyType,
      keyPrefix: parts.prefix,
      keyHash: parts.hash,
      keyLast4: parts.last4,
      scopes: parsed.data.scopes,
      rateLimitPerMinute: parsed.data.rateLimitPerMinute,
      rateLimitPerHour: parsed.data.rateLimitPerHour,
      rateLimitPerDay: parsed.data.rateLimitPerDay,
      createdBy: ctx.appUser.id,
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
  revokedBy?: string;
  reason?: string;
}) {
  const ctx = await requireInternalUser();
  const organizationId = await requireOrgId();
  const db = getDb();
  if (!db) return { ok: false as const, error: "DB not configured" };
  const updated = await db
    .update(apiKeys)
    .set({
      isActive: false,
      revokedAt: new Date(),
      revokedBy: ctx.appUser?.id ?? null,
      revocationReason: args.reason ?? null,
    })
    .where(
      and(eq(apiKeys.id, args.keyId), eq(apiKeys.organizationId, organizationId)),
    )
    .returning({ id: apiKeys.id });
  if (updated.length === 0) {
    return { ok: false as const, error: "API key not found" };
  }
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
  reason: z.string().max(200).optional(),
});

export async function rotateApiKey(input: z.input<typeof rotateSchema>) {
  const ctx = await requireInternalUser();
  if (!ctx.appUser) {
    return { ok: false as const, error: "Authenticated user required" };
  }
  const organizationId = await requireOrgId();
  const parsed = rotateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message };
  }
  const db = getDb();
  if (!db) return { ok: false as const, error: "DB not configured" };
  const rotatedBy = ctx.appUser.id;

  const [existing] = await db
    .select()
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.id, parsed.data.keyId),
        eq(apiKeys.organizationId, organizationId),
      ),
    )
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
        revokedBy: rotatedBy,
        revocationReason:
          parsed.data.reason && parsed.data.reason !== ""
            ? `[rotation] ${parsed.data.reason}`
            : "[rotation] superseded",
      })
      .where(
        and(
          eq(apiKeys.id, parsed.data.keyId),
          eq(apiKeys.organizationId, organizationId),
        ),
      );
    return await tx
      .insert(apiKeys)
      .values({
        organizationId,
        keyLabel: existing.keyLabel,
        keyType: existing.keyType,
        keyPrefix: parts.prefix,
        keyHash: parts.hash,
        keyLast4: parts.last4,
        scopes: existing.scopes,
        rateLimitPerMinute: existing.rateLimitPerMinute,
        rateLimitPerHour: existing.rateLimitPerHour,
        rateLimitPerDay: existing.rateLimitPerDay,
        createdBy: rotatedBy,
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
