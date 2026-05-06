"use server";
import "server-only";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { pushSubscriptions } from "@/lib/db/schema/pwa";

const subscribeSchema = z.object({
  userId: z.string().uuid(),
  endpoint: z.string().url(),
  p256dhKey: z.string().min(2),
  authKey: z.string().min(2),
  deviceLabel: z.string().optional(),
  userAgent: z.string().optional(),
  deviceType: z.enum(["mobile", "tablet", "desktop", "unknown"]).optional(),
  enabledNotificationTypes: z.array(z.string()).default([]),
});

export async function subscribePush(input: z.input<typeof subscribeSchema>) {
  const parsed = subscribeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message };
  }
  const db = getDb();
  if (!db) return { ok: false as const, error: "DB not configured" };
  await db
    .insert(pushSubscriptions)
    .values({
      userId: parsed.data.userId,
      endpoint: parsed.data.endpoint,
      p256dhKey: parsed.data.p256dhKey,
      authKey: parsed.data.authKey,
      deviceLabel: parsed.data.deviceLabel ?? null,
      userAgent: parsed.data.userAgent ?? null,
      deviceType: parsed.data.deviceType ?? "unknown",
      enabledNotificationTypes: parsed.data.enabledNotificationTypes,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        userId: parsed.data.userId,
        p256dhKey: parsed.data.p256dhKey,
        authKey: parsed.data.authKey,
        isActive: true,
        consecutiveFailures: 0,
        unsubscribedAt: null,
        deviceLabel: parsed.data.deviceLabel ?? null,
        userAgent: parsed.data.userAgent ?? null,
        deviceType: parsed.data.deviceType ?? "unknown",
        enabledNotificationTypes: parsed.data.enabledNotificationTypes,
      },
    });
  return { ok: true as const };
}

export async function unsubscribePush(args: { endpoint: string }) {
  const db = getDb();
  if (!db) return { ok: false as const, error: "DB not configured" };
  await db
    .update(pushSubscriptions)
    .set({
      isActive: false,
      unsubscribedAt: new Date(),
    })
    .where(eq(pushSubscriptions.endpoint, args.endpoint));
  return { ok: true as const };
}
