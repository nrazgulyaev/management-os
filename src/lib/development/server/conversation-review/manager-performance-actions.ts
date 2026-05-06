"use server";
import "server-only";

import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { managerPerformanceMetrics } from "@/lib/db/schema/marketing";
import {
  computeManagerMetrics,
  type ManagerConversationInput,
} from "../marketing/manager-performance-helpers";

/**
 * Persist a per-manager performance snapshot for a period. The actual
 * gathering of `conversations` is the caller's responsibility — this
 * helper writes the precomputed snapshot with a UNIQUE conflict resolution
 * so reruns within a period overwrite rather than duplicate.
 */
export async function persistManagerPerformanceSnapshot(args: {
  managerId: string;
  periodStart: string;
  periodEnd: string;
  periodType: "weekly" | "monthly" | "quarterly";
  totalLeadsAssigned: number;
  conversations: ManagerConversationInput[];
}) {
  const db = getDb();
  if (!db) return { ok: false as const, error: "DB not configured" };
  const snapshot = computeManagerMetrics({
    totalLeadsAssigned: args.totalLeadsAssigned,
    conversations: args.conversations,
  });
  await db
    .insert(managerPerformanceMetrics)
    .values({
      managerId: args.managerId,
      periodStart: args.periodStart,
      periodEnd: args.periodEnd,
      periodType: args.periodType,
      totalLeadsAssigned: snapshot.totalLeadsAssigned,
      totalConversationsActive: snapshot.totalConversationsActive,
      totalMessagesSent: snapshot.totalMessagesSent,
      totalCallsMade: snapshot.totalCallsMade,
      averageResponseTimeMinutes: snapshot.averageResponseTimeMinutes.toFixed(2),
      medianResponseTimeMinutes: snapshot.medianResponseTimeMinutes.toFixed(2),
      longestResponseTimeHours: snapshot.longestResponseTimeHours.toFixed(2),
      reservationsSecured: snapshot.reservationsSecured,
      contractsSigned: snapshot.contractsSigned,
      leadsLost: snapshot.leadsLost,
      leadToReservationRate: snapshot.leadToReservationRate.toFixed(2),
      reservationToContractRate: snapshot.reservationToContractRate.toFixed(2),
      missedFollowupsCount: snapshot.missedFollowupsCount,
      unrespondedMessagesCount: snapshot.unrespondedMessagesCount,
      flaggedConversationsCount: snapshot.flaggedConversationsCount,
      aiQualityScore: snapshot.aiQualityScore.toFixed(2),
    })
    .onConflictDoUpdate({
      target: [
        managerPerformanceMetrics.managerId,
        managerPerformanceMetrics.periodStart,
        managerPerformanceMetrics.periodEnd,
        managerPerformanceMetrics.periodType,
      ],
      set: {
        totalLeadsAssigned: snapshot.totalLeadsAssigned,
        totalConversationsActive: snapshot.totalConversationsActive,
        totalMessagesSent: snapshot.totalMessagesSent,
        totalCallsMade: snapshot.totalCallsMade,
        averageResponseTimeMinutes: snapshot.averageResponseTimeMinutes.toFixed(2),
        medianResponseTimeMinutes: snapshot.medianResponseTimeMinutes.toFixed(2),
        longestResponseTimeHours: snapshot.longestResponseTimeHours.toFixed(2),
        reservationsSecured: snapshot.reservationsSecured,
        contractsSigned: snapshot.contractsSigned,
        leadsLost: snapshot.leadsLost,
        leadToReservationRate: snapshot.leadToReservationRate.toFixed(2),
        reservationToContractRate: snapshot.reservationToContractRate.toFixed(2),
        missedFollowupsCount: snapshot.missedFollowupsCount,
        unrespondedMessagesCount: snapshot.unrespondedMessagesCount,
        flaggedConversationsCount: snapshot.flaggedConversationsCount,
        aiQualityScore: snapshot.aiQualityScore.toFixed(2),
        computedAt: sql`now()`,
      },
    });
  return { ok: true as const };
}
