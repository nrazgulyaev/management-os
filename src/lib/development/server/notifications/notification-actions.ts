"use server";
import "server-only";

import { sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { notificationDispatchLog } from "@/lib/db/schema/pwa";
import { requireOrgId } from "@/features/auth/require-org";
import { nextDispatchCode } from "../push/dispatch-helpers";

const scheduleSchema = z.object({
  notificationType: z.string(),
  title: z.string().min(2).max(200),
  body: z.string().min(2).max(500),
  dataPayload: z.record(z.unknown()).optional(),
  targetUserId: z.string().uuid().optional(),
  targetSubscriptionId: z.string().uuid().optional(),
  targetRole: z.string().optional(),
  sourceType: z.string(),
  sourceEntityId: z.string().uuid().optional(),
  scheduledAt: z.date().optional(),
});

export async function schedulePushNotification(
  input: z.input<typeof scheduleSchema>,
) {
  const parsed = scheduleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message };
  }
  const db = getDb();
  if (!db) return { ok: false as const, error: "DB not configured" };
  const organizationId = await requireOrgId();
  const yyyy = new Date().getUTCFullYear();
  const seqRow = await db.execute<{ n: string }>(sql`
    SELECT COUNT(*)::text AS n FROM notification_dispatch_log
     WHERE dispatch_code LIKE ${`ND-${yyyy}-%`}
  `);
  const seq = Number(
    (seqRow as unknown as { rows: Array<{ n: string }> }).rows?.[0]?.n ?? "0",
  );
  const code = nextDispatchCode(yyyy, seq);
  await db.insert(notificationDispatchLog).values({
    organizationId,
    dispatchCode: code,
    notificationType: parsed.data.notificationType,
    title: parsed.data.title,
    body: parsed.data.body,
    dataPayload: parsed.data.dataPayload as never,
    targetUserId: parsed.data.targetUserId ?? null,
    targetSubscriptionId: parsed.data.targetSubscriptionId ?? null,
    targetRole: parsed.data.targetRole ?? null,
    sourceType: parsed.data.sourceType,
    sourceEntityId: parsed.data.sourceEntityId ?? null,
    scheduledAt: parsed.data.scheduledAt ?? new Date(),
  });
  return { ok: true as const, dispatchCode: code };
}
