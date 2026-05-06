import "server-only";

import { and, eq, desc } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { pushSubscriptions } from "@/lib/db/schema/pwa";

export async function listUserSubscriptions(userId: string) {
  const db = getDb();
  if (!db) return [];
  return db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId))
    .orderBy(desc(pushSubscriptions.subscribedAt));
}

export async function listActiveSubscriptions(userId: string) {
  const db = getDb();
  if (!db) return [];
  return db
    .select()
    .from(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.userId, userId),
        eq(pushSubscriptions.isActive, true),
      ),
    );
}
