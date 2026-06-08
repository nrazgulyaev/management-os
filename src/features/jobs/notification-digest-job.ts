import "server-only";

import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { jobRuns } from "@/lib/db/schema/jobs";
import { bookingConflicts } from "@/lib/db/schema/integrations";
import { operationTasks } from "@/lib/db/schema/operations";
import { taskMaterialUsage } from "@/lib/db/schema/inventory";
import { listLowStockItems } from "@/features/inventory/services";
import { queueNotification } from "@/features/notifications/services";
import { recordAuditEvent } from "@/features/audit/services";
import { DIGEST_TEMPLATE_KEY, digestDedupeKey } from "./notification-digest-dedupe";
import type { JobOutcome, JobRunHandle } from "./runner";

const DIGEST_TEMPLATE = DIGEST_TEMPLATE_KEY;
const DIGEST_ROLES = ["super_admin", "director", "operations_manager"];

// Re-export the pure helper so existing callers keep working.
export { digestDedupeKey };

interface DigestSnapshot {
  openConflicts: number;
  failedJobs24h: number;
  urgentTasks: number;
  lowStock: number;
  pendingBridge: number;
}

async function buildSnapshot(): Promise<DigestSnapshot> {
  const db = getDb();
  if (!db) {
    return {
      openConflicts: 0,
      failedJobs24h: 0,
      urgentTasks: 0,
      lowStock: 0,
      pendingBridge: 0,
    };
  }
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [conflicts] = await db
    .select({ c: sql<number>`count(*)` })
    .from(bookingConflicts)
    .where(eq(bookingConflicts.status, "open"));

  const [failed] = await db
    .select({ c: sql<number>`count(*)` })
    .from(jobRuns)
    .where(and(eq(jobRuns.status, "failed"), gte(jobRuns.startedAt, oneDayAgo)));

  const [urgent] = await db
    .select({ c: sql<number>`count(*)` })
    .from(operationTasks)
    .where(
      and(
        eq(operationTasks.priority, "urgent"),
        sql`${operationTasks.status} NOT IN ('completed','approved','cancelled')`,
      ),
    );

  const [pendingBridge] = await db
    .select({ c: sql<number>`count(*)` })
    .from(taskMaterialUsage)
    .where(eq(taskMaterialUsage.financeBridgeStatus, "pending"));

  const lowStockItems = await listLowStockItems();

  return {
    openConflicts: Number(conflicts?.c ?? 0),
    failedJobs24h: Number(failed?.c ?? 0),
    urgentTasks: Number(urgent?.c ?? 0),
    lowStock: lowStockItems.length,
    pendingBridge: Number(pendingBridge?.c ?? 0),
  };
}

function renderBody(snapshot: DigestSnapshot): string {
  const lines = [
    `Open booking conflicts: ${snapshot.openConflicts}`,
    `Failed jobs (24h): ${snapshot.failedJobs24h}`,
    `Urgent operation tasks: ${snapshot.urgentTasks}`,
    `Low-stock items: ${snapshot.lowStock}`,
    `Pending material-usage bridge: ${snapshot.pendingBridge}`,
  ];
  return lines.join("\n");
}

export async function runNotificationDigestJob(
  handle: JobRunHandle,
): Promise<JobOutcome> {
  if (!getDb()) {
    return {
      status: "failed",
      summary: "Database is not configured.",
      metrics: { openConflicts: 0, failedJobs24h: 0, urgentTasks: 0, lowStock: 0, pendingBridge: 0 },
      error: "DB unavailable",
    };
  }
  const snapshot = await buildSnapshot();
  await handle.event("info", "Digest snapshot built", snapshot as unknown as Record<string, unknown>);

  const total =
    snapshot.openConflicts +
    snapshot.failedJobs24h +
    snapshot.urgentTasks +
    snapshot.lowStock +
    snapshot.pendingBridge;

  let queued = 0;
  let deduped = 0;
  for (const role of DIGEST_ROLES) {
    const dedupeKey = digestDedupeKey(role);
    const result = await queueNotification({
      recipientType: "role",
      recipientId: undefined,
      channel: "in_app",
      templateKey: DIGEST_TEMPLATE,
      title: `Daily digest · ${total} item${total === 1 ? "" : "s"} need attention`,
      body: renderBody(snapshot),
      payload: {
        ...snapshot,
        recipientRole: role,
      },
      priority: total > 0 ? "normal" : "low",
      dedupeKey,
    });
    if (!result) continue;
    if (result.status === "queued") queued++;
    else deduped++;
  }

  await recordAuditEvent({
    actorUserId: null,
    action: "notification.digest.queued",
    entityType: "notification_queue",
    entityId: handle.id,
    after: { ...snapshot, queued, deduped },
  });

  return {
    status: "success",
    summary: `Queued ${queued} digest notification(s); deduped ${deduped}`,
    metrics: {
      ...snapshot,
      queued,
      deduped,
    },
  };
}
