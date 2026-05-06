import "server-only";

import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  guestAiHandoffReplyAttachments,
  guestAiHandoffs,
  type GuestAiHandoff,
} from "@/lib/db/schema/guest-ai-concierge";
import { villas } from "@/lib/db/schema/projects";
import { bookings } from "@/lib/db/schema/bookings";
import {
  calculateHandoffSlaMetrics,
  groupHandoffMetricsByPriority,
  groupHandoffMetricsByType,
  groupHandoffMetricsByVilla,
  type HandoffMetricRow,
  type SlaSummary,
  type MetricBucket,
} from "./replies-pure";
import { medianFirstStaffReadSeconds } from "./read-receipts-services";
import type { HandoffPriority, HandoffType } from "./handoff-pure";

export interface HandoffMetricsView {
  sla: SlaSummary;
  byVilla: MetricBucket[];
  byType: MetricBucket[];
  byPriority: MetricBucket[];
  unread: { byGuest: number; byStaff: number };
  attachmentCountsByType: Array<{ handoffType: HandoffType; count: number }>;
  /** Median seconds between a guest reply landing and any staff member
   *  reading it; null when no guest replies have been read. */
  medianFirstStaffReadSec: number | null;
  /** Open handoffs over the SLA threshold, sorted by age desc. */
  overdueOpen: Array<{
    id: string;
    handoffType: HandoffType;
    priority: HandoffPriority;
    villaCode: string | null;
    bookingCode: string | null;
    createdAt: Date;
    ageSec: number;
  }>;
}

export async function getHandoffMetricsView(opts?: {
  /** Number of recent handoffs to include. Defaults to last 90 days
   *  worth, soft-capped at 1000 rows. */
  limit?: number;
  now?: Date;
}): Promise<HandoffMetricsView> {
  const db = getDb();
  const now = opts?.now ?? new Date();
  const empty: HandoffMetricsView = {
    sla: {
      total: 0,
      open: 0,
      urgentOpen: 0,
      overdue: 0,
      medianTimeToAcknowledgeSec: null,
      medianTimeToFirstResponseSec: null,
      medianTimeToResolveSec: null,
    },
    byVilla: [],
    byType: [],
    byPriority: [],
    unread: { byGuest: 0, byStaff: 0 },
    attachmentCountsByType: [],
    medianFirstStaffReadSec: null,
    overdueOpen: [],
  };
  if (!db)
    return {
      ...empty,
      unread: { byGuest: 0, byStaff: 0 },
      attachmentCountsByType: [],
      medianFirstStaffReadSec: null,
    };

  const rows = await db
    .select({
      h: guestAiHandoffs,
      villaCode: villas.unitCode,
      bookingCode: bookings.bookingCode,
    })
    .from(guestAiHandoffs)
    .leftJoin(bookings, eq(bookings.id, guestAiHandoffs.bookingId))
    .leftJoin(villas, eq(villas.id, bookings.villaId))
    .orderBy(desc(guestAiHandoffs.createdAt))
    .limit(opts?.limit ?? 1000);

  const metricRows: HandoffMetricRow[] = rows.map((r) => ({
    id: r.h.id,
    status: r.h.status as HandoffMetricRow["status"],
    priority: r.h.priority as HandoffPriority,
    handoffType: r.h.handoffType as HandoffType,
    createdAt: r.h.createdAt,
    acknowledgedAt: r.h.acknowledgedAt ?? null,
    resolvedAt: r.h.resolvedAt ?? null,
    firstStaffReplyAt: (r.h as GuestAiHandoff & {
      firstStaffReplyAt?: Date | null;
    }).firstStaffReplyAt ?? null,
    villaCode: r.villaCode ?? null,
  }));

  const sla = calculateHandoffSlaMetrics(metricRows, now);
  const byVilla = groupHandoffMetricsByVilla(metricRows);
  const byType = groupHandoffMetricsByType(metricRows);
  const byPriority = groupHandoffMetricsByPriority(metricRows);

  const URGENT_OVERDUE_MS = 30 * 60 * 1000;
  const NORMAL_OVERDUE_MS = 2 * 60 * 60 * 1000;
  const overdueOpen = rows
    .filter((r) => {
      const open =
        r.h.status !== "resolved" && r.h.status !== "cancelled";
      if (!open) return false;
      const age = now.getTime() - r.h.createdAt.getTime();
      const threshold =
        r.h.priority === "urgent"
          ? URGENT_OVERDUE_MS
          : NORMAL_OVERDUE_MS;
      return age > threshold;
    })
    .slice(0, 50)
    .map((r) => ({
      id: r.h.id,
      handoffType: r.h.handoffType as HandoffType,
      priority: r.h.priority as HandoffPriority,
      villaCode: r.villaCode ?? null,
      bookingCode: r.bookingCode ?? null,
      createdAt: r.h.createdAt,
      ageSec: Math.floor(
        (now.getTime() - r.h.createdAt.getTime()) / 1000,
      ),
    }))
    .sort((a, b) => b.ageSec - a.ageSec);

  // Aggregate unread counters across all open handoffs (sample uses
  // the same row set we already loaded).
  const unread = rows.reduce(
    (acc, r) => {
      acc.byGuest += r.h.guestUnreadCount ?? 0;
      acc.byStaff += r.h.staffUnreadCount ?? 0;
      return acc;
    },
    { byGuest: 0, byStaff: 0 },
  );

  // Attachments by handoff type.
  const handoffIds = rows.map((r) => r.h.id);
  const handoffTypeById = new Map<string, HandoffType>();
  for (const r of rows) {
    handoffTypeById.set(r.h.id, r.h.handoffType as HandoffType);
  }
  const attachmentCountsByType: Array<{
    handoffType: HandoffType;
    count: number;
  }> = [];
  if (handoffIds.length > 0) {
    const attachRows = await db
      .select({
        handoffId: guestAiHandoffReplyAttachments.handoffId,
        c: sql<number>`count(*)`,
      })
      .from(guestAiHandoffReplyAttachments)
      .where(
        sql`${guestAiHandoffReplyAttachments.handoffId} = ANY(${handoffIds}) and ${guestAiHandoffReplyAttachments.uploadStatus} = 'uploaded'`,
      )
      .groupBy(guestAiHandoffReplyAttachments.handoffId);
    const counts = new Map<HandoffType, number>();
    for (const r of attachRows) {
      const t = handoffTypeById.get(r.handoffId);
      if (!t) continue;
      counts.set(t, (counts.get(t) ?? 0) + Number(r.c));
    }
    for (const [t, c] of counts) {
      attachmentCountsByType.push({ handoffType: t, count: c });
    }
    attachmentCountsByType.sort((a, b) => b.count - a.count);
  }

  const medianFirstStaffReadStat = await medianFirstStaffReadSeconds();

  return {
    sla,
    byVilla,
    byType,
    byPriority,
    unread,
    attachmentCountsByType,
    medianFirstStaffReadSec: medianFirstStaffReadStat.medianSec,
    overdueOpen,
  };
}
