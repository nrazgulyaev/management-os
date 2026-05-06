/**
 * Stage 5.I — Pure helpers for push notification routing + targeting.
 *
 * No I/O, no `import "server-only"`. Runtime testable.
 */

export type NotificationType =
  | "critical_risks"
  | "cash_gaps"
  | "qa_qc_critical"
  | "sales_followup_reminders"
  | "schedule_slip_critical"
  | "agent_output_ready"
  | "missed_followup"
  | "test_notification";

export interface SubscriptionLite {
  id: string;
  userId: string;
  isActive: boolean;
  enabledNotificationTypes: string[];
  consecutiveFailures: number;
}

/**
 * Pick the subscriptions that should receive a notification of a given
 * type. Filters: must be active, must include the type (or have an
 * empty preference list = receive everything), must not be over the
 * failure cap.
 */
export function pickEligibleSubscriptions(args: {
  subscriptions: SubscriptionLite[];
  notificationType: NotificationType | string;
  maxConsecutiveFailures?: number;
}): SubscriptionLite[] {
  const cap = args.maxConsecutiveFailures ?? 5;
  return args.subscriptions.filter((s) => {
    if (!s.isActive) return false;
    if (s.consecutiveFailures >= cap) return false;
    if (s.enabledNotificationTypes.length === 0) return true;
    return s.enabledNotificationTypes.includes(args.notificationType);
  });
}

/**
 * Map an HTTP status code from a push delivery to a meaningful action.
 *   - 410 Gone / 404 Not Found → unsubscribe (endpoint is dead)
 *   - 429 Too Many Requests → retry later
 *   - 5xx → retry later
 *   - other → record failure but keep subscription
 */
export type FailureAction =
  | "unsubscribe_immediately"
  | "increment_failures_retry"
  | "increment_failures_keep";

export function classifyDeliveryFailure(httpStatus: number): FailureAction {
  if (httpStatus === 410 || httpStatus === 404) {
    return "unsubscribe_immediately";
  }
  if (httpStatus === 429 || (httpStatus >= 500 && httpStatus < 600)) {
    return "increment_failures_retry";
  }
  return "increment_failures_keep";
}

/**
 * Compute next dispatch_code given a year + last sequence number.
 */
export function nextDispatchCode(year: number, currentMaxSeq: number): string {
  return `ND-${year}-${String(currentMaxSeq + 1).padStart(4, "0")}`;
}

/**
 * Compute next action_code given a year + last sequence number.
 */
export function nextOfflineActionCode(
  year: number,
  currentMaxSeq: number,
): string {
  return `OFFLINE-${year}-${String(currentMaxSeq + 1).padStart(4, "0")}`;
}

/**
 * Conflict detection — currently append-only. A request is a duplicate
 * iff its (userId, clientActionId) pair already exists.
 */
export function detectActionConflict(args: {
  candidate: { userId: string; clientActionId: string };
  existingPairs: Set<string>;
}): { isDuplicate: boolean; conflictKey: string } {
  const key = `${args.candidate.userId}:${args.candidate.clientActionId}`;
  return { isDuplicate: args.existingPairs.has(key), conflictKey: key };
}

export function buildConflictKey(userId: string, clientActionId: string): string {
  return `${userId}:${clientActionId}`;
}
