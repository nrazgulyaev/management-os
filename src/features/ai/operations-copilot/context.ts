import "server-only";

import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  getOperationsMetrics,
  listOperationTasks,
  listMaintenanceTickets,
  listServiceRequests,
} from "@/features/operations/services";
import { listJobRuns } from "@/features/jobs/services";
import { listLowStockItems } from "@/features/inventory/services";
import {
  listBookingConflicts,
  listCalendarFeeds,
} from "@/features/integrations/calendar-sync/services";
import { bookings } from "@/lib/db/schema/bookings";
import { jobRuns } from "@/lib/db/schema/jobs";
import { notificationQueue } from "@/lib/db/schema/notifications";
import type { OperationsSnapshot } from "./types";

const MAX_LIST = 10;

/**
 * Build the snapshot the Co-pilot reasons over. Reads only — every list
 * cap is enforced server-side so the model can't ask for more than we
 * want to spend tokens on.
 *
 * The snapshot is also persisted on each summary row (`source_snapshot`),
 * which gives operators an audit trail of what the model saw.
 */
export async function buildOperationsSnapshot(
  now: Date = new Date(),
  organizationId: string | null = null,
): Promise<OperationsSnapshot> {
  const db = getDb();
  const todayYmd = now.toISOString().slice(0, 10);

  // Aggregated counters from the operations service. Map into our flat
  // shape; some fields aren't exposed there (today's check-ins/outs,
  // failed jobs in 24h, queued notifications) so we query directly.
  // organizationId scopes the snapshot to the caller's tenant (the model
  // sees this context on every turn); null = system/cron = platform-wide.
  const baseMetrics = await getOperationsMetrics(organizationId);

  let todaysCheckins = 0;
  let todaysCheckouts = 0;
  let failedJobsLast24h = 0;
  let queuedNotifications = 0;
  if (db) {
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const [c] = await db
      .select({ c: sql<number>`count(*)` })
      .from(bookings)
      .where(eq(bookings.checkIn, todayYmd));
    todaysCheckins = Number(c?.c ?? 0);

    const [o] = await db
      .select({ c: sql<number>`count(*)` })
      .from(bookings)
      .where(eq(bookings.checkOut, todayYmd));
    todaysCheckouts = Number(o?.c ?? 0);

    const [f] = await db
      .select({ c: sql<number>`count(*)` })
      .from(jobRuns)
      .where(and(eq(jobRuns.status, "failed"), gte(jobRuns.startedAt, since)));
    failedJobsLast24h = Number(f?.c ?? 0);

    const [q] = await db
      .select({ c: sql<number>`count(*)` })
      .from(notificationQueue)
      .where(eq(notificationQueue.status, "queued"));
    queuedNotifications = Number(q?.c ?? 0);
  }

  // Pull a small sample of each row-set so the model can name specific
  // tasks / conflicts / items in its output.
  const [tasksOpen, conflicts, lowStock, recentJobs, sr, mnt, feeds] =
    await Promise.all([
      listOperationTasks({ status: "open", limit: MAX_LIST }),
      listBookingConflicts(),
      listLowStockItems(),
      listJobRuns({ limit: MAX_LIST }),
      listServiceRequests({ limit: MAX_LIST, organizationId }),
      listMaintenanceTickets({ limit: MAX_LIST, organizationId }),
      listCalendarFeeds(),
    ]);

  const openTasks =
    baseMetrics.open + baseMetrics.inProgress + baseMetrics.needsReview;
  const overdueTasks = baseMetrics.urgent;

  return {
    generatedAt: now.toISOString(),
    metrics: {
      openTasks,
      overdueTasks,
      todaysCheckins,
      todaysCheckouts,
      bookingConflicts: conflicts.length,
      lowStockItems: lowStock.length,
      failedJobsLast24h,
      queuedNotifications,
    },
    topTasks: tasksOpen.slice(0, MAX_LIST).map((t) => ({
      id: t.id,
      title: t.title ?? t.taskCode ?? t.id,
      status: t.status,
      priority: t.priority,
      dueAt: t.scheduledFor ?? null,
    })),
    conflicts: conflicts.slice(0, MAX_LIST).map((c) => ({
      id: c.id,
      villaId: c.villaId ?? null,
      detail: c.description ?? c.conflictType,
      detectedAt: c.createdAt ?? null,
    })),
    lowStock: lowStock.slice(0, MAX_LIST).map((item) => ({
      itemId: item.id,
      itemName: item.name,
      villaId: null,
      onHand: item.totalStock,
      parLevel: item.reorderPoint ?? 0,
    })),
    jobRuns: recentJobs.slice(0, MAX_LIST).map((r) => ({
      id: r.id,
      jobKey: r.jobKey,
      status: r.status,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
    })),
    serviceRequests: sr.slice(0, MAX_LIST).map((s) => ({
      id: s.id,
      status: s.status,
      priority: s.priority,
      title: s.title,
    })),
    maintenance: mnt.slice(0, MAX_LIST).map((m) => ({
      id: m.id,
      status: m.status,
      priority: m.severity,
      title: m.title,
    })),
    feeds: feeds.slice(0, MAX_LIST).map((f) => ({
      id: f.id,
      villaId: f.villaId ?? "",
      syncStatus: f.status,
      lastSyncedAt: f.lastSyncedAt ?? null,
    })),
  };
}
