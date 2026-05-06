/**
 * Stage 5.E — Sales conversation analysis pure helpers.
 *
 * No I/O, no `import "server-only"`. Runtime testable.
 */

export type ConversationChannel = "whatsapp" | "email" | "call_log";

export interface ConversationMessage {
  timestamp: Date;
  fromManager: boolean;
  channel: ConversationChannel;
  content?: string;
}

export interface ResponseTimeAnalysis {
  averageResponseMinutes: number;
  medianResponseMinutes: number;
  longestResponseHours: number;
  unresponded: number;
  totalManagerResponses: number;
}

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const DAY_MS = 24 * MS_PER_HOUR;

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Walk messages chronologically. For every buyer message, find the next
 * manager message and record the gap. Tail buyer messages without a
 * follow-up count toward `unresponded`.
 */
export function analyzeResponseTimes(
  messages: ConversationMessage[],
): ResponseTimeAnalysis {
  const sorted = [...messages].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
  );
  const responseMinutes: number[] = [];
  let unresponded = 0;
  for (let i = 0; i < sorted.length; i++) {
    const m = sorted[i];
    if (m.fromManager) continue;
    // find next manager message
    let nextMgrIdx = -1;
    for (let j = i + 1; j < sorted.length; j++) {
      if (sorted[j].fromManager) {
        nextMgrIdx = j;
        break;
      }
    }
    if (nextMgrIdx === -1) {
      unresponded++;
    } else {
      const gapMs =
        sorted[nextMgrIdx].timestamp.getTime() - m.timestamp.getTime();
      responseMinutes.push(gapMs / MS_PER_MINUTE);
    }
  }
  const avg =
    responseMinutes.length > 0
      ? responseMinutes.reduce((a, b) => a + b, 0) / responseMinutes.length
      : 0;
  const med = median(responseMinutes);
  const longestMin = responseMinutes.length > 0 ? Math.max(...responseMinutes) : 0;
  return {
    averageResponseMinutes: avg,
    medianResponseMinutes: med,
    longestResponseHours: longestMin / 60,
    unresponded,
    totalManagerResponses: responseMinutes.length,
  };
}

// ---------------------------------------------------------------------------
// Missed follow-up detection
// ---------------------------------------------------------------------------

export interface MissedFollowupResult {
  daysSinceLastContact: number;
  isMissedFollowup: boolean;
  severity: "minor" | "moderate" | "critical";
}

export function detectMissedFollowups(input: {
  conversationLastMessageAt: Date;
  currentDate: Date;
  outcome: string | null;
  /** Threshold days; default 5 for hot leads. */
  thresholdDays?: number;
}): MissedFollowupResult {
  const threshold = input.thresholdDays ?? 5;
  // Only active (no outcome or "still_active"/"on_hold") qualify.
  const isActive =
    input.outcome === null ||
    input.outcome === "still_active" ||
    input.outcome === "on_hold";
  const daysSince = Math.floor(
    (input.currentDate.getTime() - input.conversationLastMessageAt.getTime()) /
      DAY_MS,
  );
  const isMissed = isActive && daysSince > threshold;
  let severity: "minor" | "moderate" | "critical" = "minor";
  if (daysSince > threshold * 4) severity = "critical";
  else if (daysSince > threshold * 2) severity = "moderate";
  return {
    daysSinceLastContact: daysSince,
    isMissedFollowup: isMissed,
    severity,
  };
}

// ---------------------------------------------------------------------------
// Lost-lead pattern detection
// ---------------------------------------------------------------------------

export interface LostLeadInput {
  managerId: string;
  source: string;
  outcome: string | null;
  conversationStartAt: Date;
  outcomeRecordedAt: Date | null;
}

export interface LostLeadPatternOutput {
  patternsByManager: Map<
    string,
    { lostCount: number; lostBySource: Record<string, number> }
  >;
  overallPatterns: {
    lostBySource: Record<string, number>;
    timeToLossDistributionDays: number[];
  };
}

const LOST_OUTCOMES = new Set([
  "lost_no_response",
  "lost_competitor",
  "lost_price",
  "lost_other",
]);

export function detectLostLeadPattern(
  conversations: LostLeadInput[],
): LostLeadPatternOutput {
  const patternsByManager = new Map<
    string,
    { lostCount: number; lostBySource: Record<string, number> }
  >();
  const overallLostBySource: Record<string, number> = {};
  const timeToLossDistributionDays: number[] = [];
  for (const c of conversations) {
    if (!c.outcome || !LOST_OUTCOMES.has(c.outcome)) continue;
    overallLostBySource[c.source] =
      (overallLostBySource[c.source] ?? 0) + 1;
    if (c.outcomeRecordedAt) {
      const days =
        (c.outcomeRecordedAt.getTime() - c.conversationStartAt.getTime()) /
        DAY_MS;
      timeToLossDistributionDays.push(days);
    }
    const mgr = patternsByManager.get(c.managerId) ?? {
      lostCount: 0,
      lostBySource: {},
    };
    mgr.lostCount += 1;
    mgr.lostBySource[c.source] = (mgr.lostBySource[c.source] ?? 0) + 1;
    patternsByManager.set(c.managerId, mgr);
  }
  return {
    patternsByManager,
    overallPatterns: {
      lostBySource: overallLostBySource,
      timeToLossDistributionDays,
    },
  };
}
