/**
 * Stage 5.E — Manager performance pure helpers.
 *
 * No I/O, no `import "server-only"`. Runtime testable.
 *
 * Aggregates raw conversation events into the snapshot shape persisted
 * in `manager_performance_metrics`.
 */

import {
  analyzeResponseTimes,
  type ConversationMessage,
} from "./conversation-analysis-helpers";

export interface ManagerConversationInput {
  /** Per-conversation raw messages. */
  conversationMessages: ConversationMessage[];
  outcome:
    | "reservation"
    | "contract_signed"
    | "lost_no_response"
    | "lost_competitor"
    | "lost_price"
    | "lost_other"
    | "still_active"
    | "on_hold"
    | null;
  /** True if conversation is still active in the period (no terminal outcome). */
  isStillActive: boolean;
  /** True if AI flagged this conversation as a quality concern. */
  isFlagged: boolean;
  /** Number of unresponded buyer messages (> 5 days idle). */
  missedFollowupsHere: number;
}

export interface ManagerPerformanceSnapshot {
  totalLeadsAssigned: number;
  totalConversationsActive: number;
  totalMessagesSent: number;
  totalCallsMade: number;
  averageResponseTimeMinutes: number;
  medianResponseTimeMinutes: number;
  longestResponseTimeHours: number;
  reservationsSecured: number;
  contractsSigned: number;
  leadsLost: number;
  leadToReservationRate: number;
  reservationToContractRate: number;
  missedFollowupsCount: number;
  unrespondedMessagesCount: number;
  flaggedConversationsCount: number;
  /** 0-100; composite of conversion rate × responsiveness × cleanliness. */
  aiQualityScore: number;
}

const LOST_OUTCOMES = new Set([
  "lost_no_response",
  "lost_competitor",
  "lost_price",
  "lost_other",
]);

export function computeManagerMetrics(args: {
  totalLeadsAssigned: number;
  conversations: ManagerConversationInput[];
}): ManagerPerformanceSnapshot {
  const { conversations, totalLeadsAssigned } = args;

  let totalMessagesSent = 0;
  let totalCallsMade = 0;
  let unresponded = 0;
  const allResponseMinutes: number[] = [];
  let longestHours = 0;
  let reservations = 0;
  let contracts = 0;
  let lost = 0;
  let active = 0;
  let flagged = 0;
  let missedFollowups = 0;

  for (const c of conversations) {
    totalMessagesSent += c.conversationMessages.filter((m) => m.fromManager).length;
    totalCallsMade += c.conversationMessages.filter(
      (m) => m.channel === "call_log" && m.fromManager,
    ).length;
    if (c.isStillActive) active++;
    if (c.outcome === "reservation") reservations++;
    if (c.outcome === "contract_signed") contracts++;
    if (c.outcome && LOST_OUTCOMES.has(c.outcome)) lost++;
    if (c.isFlagged) flagged++;
    missedFollowups += c.missedFollowupsHere;

    const rt = analyzeResponseTimes(c.conversationMessages);
    unresponded += rt.unresponded;
    if (rt.totalManagerResponses > 0) {
      // Re-derive per-message minutes by reconstructing from average × count.
      // For aggregate, push the per-conversation average as a contribution
      // so cross-conversation averaging is meaningful.
      for (let i = 0; i < rt.totalManagerResponses; i++) {
        allResponseMinutes.push(rt.averageResponseMinutes);
      }
    }
    if (rt.longestResponseHours > longestHours) {
      longestHours = rt.longestResponseHours;
    }
  }

  const avgResp =
    allResponseMinutes.length > 0
      ? allResponseMinutes.reduce((a, b) => a + b, 0) / allResponseMinutes.length
      : 0;
  const sortedResp = [...allResponseMinutes].sort((a, b) => a - b);
  const medResp =
    sortedResp.length === 0
      ? 0
      : sortedResp.length % 2
        ? sortedResp[Math.floor(sortedResp.length / 2)]
        : (sortedResp[sortedResp.length / 2 - 1] +
            sortedResp[sortedResp.length / 2]) /
          2;

  const leadToReservationRate =
    totalLeadsAssigned > 0
      ? (reservations / totalLeadsAssigned) * 100
      : 0;
  const reservationToContractRate =
    reservations > 0 ? (contracts / reservations) * 100 : 0;

  // Composite AI quality score.
  const conversionScore = Math.min(100, leadToReservationRate * 5);
  const responsivenessScore = Math.max(0, 100 - avgResp / 60); // < 1h ≈ 100, > 100h ≈ 0
  const cleanlinessScore = Math.max(
    0,
    100 - (unresponded * 5 + flagged * 15 + missedFollowups * 5),
  );
  const aiQualityScore = Math.round(
    conversionScore * 0.4 + responsivenessScore * 0.3 + cleanlinessScore * 0.3,
  );

  return {
    totalLeadsAssigned,
    totalConversationsActive: active,
    totalMessagesSent,
    totalCallsMade,
    averageResponseTimeMinutes: avgResp,
    medianResponseTimeMinutes: medResp,
    longestResponseTimeHours: longestHours,
    reservationsSecured: reservations,
    contractsSigned: contracts,
    leadsLost: lost,
    leadToReservationRate,
    reservationToContractRate,
    missedFollowupsCount: missedFollowups,
    unrespondedMessagesCount: unresponded,
    flaggedConversationsCount: flagged,
    aiQualityScore,
  };
}
