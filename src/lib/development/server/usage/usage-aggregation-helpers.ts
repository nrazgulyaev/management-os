/**
 * Stage 5.J.4 — Pure usage aggregation helpers.
 *
 * No I/O, no `import "server-only"`. Runtime testable.
 */

export interface RawUsageInputs {
  activeUsersCount: number;
  activeProjectsCount: number;
  totalTransactionsCount: number;
  totalInvoicesCount: number;
  totalDocumentsUploaded: number;
  totalStorageUsedBytes: number;
  aiInvocationsCount: number;
  aiTokensConsumed: number;
  aiCostMinor: number;
  apiRequestsCount: number;
  apiRateLimitedCount: number;
  webhooksDispatchedCount: number;
  webhooksFailedCount: number;
  pushNotificationsDispatched: number;
}

export interface UsageMetricRecord extends RawUsageInputs {
  organizationId: string;
  metricPeriodStart: string;
  metricPeriodEnd: string;
  metricType: "daily_summary" | "weekly_summary" | "monthly_summary";
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function dailyPeriod(forDate: Date): { start: string; end: string } {
  const d = new Date(
    Date.UTC(
      forDate.getUTCFullYear(),
      forDate.getUTCMonth(),
      forDate.getUTCDate(),
    ),
  );
  return {
    start: d.toISOString().slice(0, 10),
    end: d.toISOString().slice(0, 10),
  };
}

/** Monday → Sunday week containing `forDate`. */
export function weeklyPeriod(forDate: Date): { start: string; end: string } {
  const d = new Date(
    Date.UTC(
      forDate.getUTCFullYear(),
      forDate.getUTCMonth(),
      forDate.getUTCDate(),
    ),
  );
  const dow = d.getUTCDay(); // 0=Sun .. 6=Sat
  const offsetToMon = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(d.getTime() + offsetToMon * DAY_MS);
  const sunday = new Date(monday.getTime() + 6 * DAY_MS);
  return {
    start: monday.toISOString().slice(0, 10),
    end: sunday.toISOString().slice(0, 10),
  };
}

export function monthlyPeriod(forDate: Date): { start: string; end: string } {
  const start = new Date(
    Date.UTC(forDate.getUTCFullYear(), forDate.getUTCMonth(), 1),
  );
  const end = new Date(
    Date.UTC(forDate.getUTCFullYear(), forDate.getUTCMonth() + 1, 0),
  );
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

/**
 * Sum N daily snapshots into one weekly/monthly aggregate.
 */
export function rollupSummaries(
  daily: RawUsageInputs[],
): RawUsageInputs {
  return daily.reduce<RawUsageInputs>(
    (acc, r) => ({
      activeUsersCount: Math.max(acc.activeUsersCount, r.activeUsersCount),
      activeProjectsCount: Math.max(
        acc.activeProjectsCount,
        r.activeProjectsCount,
      ),
      totalTransactionsCount:
        acc.totalTransactionsCount + r.totalTransactionsCount,
      totalInvoicesCount: acc.totalInvoicesCount + r.totalInvoicesCount,
      totalDocumentsUploaded:
        acc.totalDocumentsUploaded + r.totalDocumentsUploaded,
      totalStorageUsedBytes: Math.max(
        acc.totalStorageUsedBytes,
        r.totalStorageUsedBytes,
      ),
      aiInvocationsCount: acc.aiInvocationsCount + r.aiInvocationsCount,
      aiTokensConsumed: acc.aiTokensConsumed + r.aiTokensConsumed,
      aiCostMinor: acc.aiCostMinor + r.aiCostMinor,
      apiRequestsCount: acc.apiRequestsCount + r.apiRequestsCount,
      apiRateLimitedCount: acc.apiRateLimitedCount + r.apiRateLimitedCount,
      webhooksDispatchedCount:
        acc.webhooksDispatchedCount + r.webhooksDispatchedCount,
      webhooksFailedCount: acc.webhooksFailedCount + r.webhooksFailedCount,
      pushNotificationsDispatched:
        acc.pushNotificationsDispatched + r.pushNotificationsDispatched,
    }),
    {
      activeUsersCount: 0,
      activeProjectsCount: 0,
      totalTransactionsCount: 0,
      totalInvoicesCount: 0,
      totalDocumentsUploaded: 0,
      totalStorageUsedBytes: 0,
      aiInvocationsCount: 0,
      aiTokensConsumed: 0,
      aiCostMinor: 0,
      apiRequestsCount: 0,
      apiRateLimitedCount: 0,
      webhooksDispatchedCount: 0,
      webhooksFailedCount: 0,
      pushNotificationsDispatched: 0,
    },
  );
}
