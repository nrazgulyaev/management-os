"use server";
import "server-only";

import { sql, eq, and, gte, lte } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { usageMetrics, organizations } from "@/lib/db/schema/saas";
import {
  dailyPeriod,
  weeklyPeriod,
  monthlyPeriod,
  rollupSummaries,
  type RawUsageInputs,
} from "./usage-aggregation-helpers";

type MetricType = "daily_summary" | "weekly_summary" | "monthly_summary";

interface RecordArgs {
  organizationId: string;
  forDate: Date;
  metricType: MetricType;
}

const ZERO: RawUsageInputs = {
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
};

/**
 * Use raw SQL because most Dev OS table schemas haven't yet had
 * `organization_id` added in their Drizzle definitions, even though
 * migration 0072 added the columns at the SQL level. Once the schema
 * files catch up, these can be rewritten with typed queries.
 */
async function gatherDailyUsage(args: {
  organizationId: string;
  periodStart: string;
  periodEnd: string;
}): Promise<RawUsageInputs> {
  const db = getDb();
  if (!db) return ZERO;
  const dbHandle = db;

  const start = sql.raw(`'${args.periodStart} 00:00:00+00'::timestamptz`);
  const end = sql.raw(`'${args.periodEnd} 23:59:59+00'::timestamptz`);
  const orgId = args.organizationId;

  async function safeCount(query: ReturnType<typeof sql>): Promise<number> {
    try {
      const result = await dbHandle.execute(query);
      const rows = result as unknown as Array<{ c: string | number }>;
      return Number(rows[0]?.c ?? 0);
    } catch {
      return 0;
    }
  }

  const [
    users,
    projects,
    transactions,
    invoices,
    documents,
    aiInvocations,
    apiRequests,
    apiRateLimited,
    webhooksOk,
    webhooksFail,
    pushDispatched,
  ] = await Promise.all([
    safeCount(
      sql`SELECT COUNT(*)::int AS c FROM app_users WHERE organization_id = ${orgId}`,
    ),
    safeCount(
      sql`SELECT COUNT(*)::int AS c FROM projects WHERE organization_id = ${orgId}`,
    ),
    safeCount(
      sql`SELECT COUNT(*)::int AS c FROM dev_transactions WHERE organization_id = ${orgId} AND created_at BETWEEN ${start} AND ${end}`,
    ),
    safeCount(
      sql`SELECT COUNT(*)::int AS c FROM dev_invoices WHERE organization_id = ${orgId} AND created_at BETWEEN ${start} AND ${end}`,
    ),
    safeCount(
      sql`SELECT COUNT(*)::int AS c FROM documents WHERE created_at BETWEEN ${start} AND ${end}`,
    ),
    safeCount(
      sql`SELECT COUNT(*)::int AS c FROM agent_invocation_log WHERE organization_id = ${orgId} AND created_at BETWEEN ${start} AND ${end}`,
    ),
    safeCount(
      sql`SELECT COUNT(*)::int AS c FROM api_request_log WHERE organization_id = ${orgId} AND requested_at BETWEEN ${start} AND ${end}`,
    ),
    safeCount(
      sql`SELECT COUNT(*)::int AS c FROM api_request_log WHERE organization_id = ${orgId} AND was_rate_limited = true AND requested_at BETWEEN ${start} AND ${end}`,
    ),
    safeCount(
      sql`SELECT COUNT(*)::int AS c FROM webhook_delivery_log d JOIN webhook_subscriptions s ON s.id = d.webhook_subscription_id WHERE s.organization_id = ${orgId} AND d.status = 'delivered' AND d.scheduled_at BETWEEN ${start} AND ${end}`,
    ),
    safeCount(
      sql`SELECT COUNT(*)::int AS c FROM webhook_delivery_log d JOIN webhook_subscriptions s ON s.id = d.webhook_subscription_id WHERE s.organization_id = ${orgId} AND d.status = 'failed' AND d.scheduled_at BETWEEN ${start} AND ${end}`,
    ),
    safeCount(
      sql`SELECT COUNT(*)::int AS c FROM notification_dispatch_log WHERE created_at BETWEEN ${start} AND ${end}`,
    ),
  ]);

  return {
    activeUsersCount: users,
    activeProjectsCount: projects,
    totalTransactionsCount: transactions,
    totalInvoicesCount: invoices,
    totalDocumentsUploaded: documents,
    totalStorageUsedBytes: 0,
    aiInvocationsCount: aiInvocations,
    aiTokensConsumed: 0,
    aiCostMinor: 0,
    apiRequestsCount: apiRequests,
    apiRateLimitedCount: apiRateLimited,
    webhooksDispatchedCount: webhooksOk,
    webhooksFailedCount: webhooksFail,
    pushNotificationsDispatched: pushDispatched,
  };
}

export async function recordUsageMetrics(args: RecordArgs) {
  const db = getDb();
  if (!db) return { ok: false as const, error: "DB not configured" };

  const period =
    args.metricType === "daily_summary"
      ? dailyPeriod(args.forDate)
      : args.metricType === "weekly_summary"
        ? weeklyPeriod(args.forDate)
        : monthlyPeriod(args.forDate);

  const raw = await gatherDailyUsage({
    organizationId: args.organizationId,
    periodStart: period.start,
    periodEnd: period.end,
  });

  const now = new Date();
  await db
    .insert(usageMetrics)
    .values({
      organizationId: args.organizationId,
      metricPeriodStart: period.start,
      metricPeriodEnd: period.end,
      metricType: args.metricType,
      activeUsersCount: raw.activeUsersCount,
      activeProjectsCount: raw.activeProjectsCount,
      totalTransactionsCount: raw.totalTransactionsCount,
      totalInvoicesCount: raw.totalInvoicesCount,
      totalDocumentsUploaded: raw.totalDocumentsUploaded,
      totalStorageUsedBytes: BigInt(raw.totalStorageUsedBytes),
      aiInvocationsCount: raw.aiInvocationsCount,
      aiTokensConsumed: BigInt(raw.aiTokensConsumed),
      aiCostMinor: BigInt(raw.aiCostMinor),
      apiRequestsCount: raw.apiRequestsCount,
      apiRateLimitedCount: raw.apiRateLimitedCount,
      webhooksDispatchedCount: raw.webhooksDispatchedCount,
      webhooksFailedCount: raw.webhooksFailedCount,
      pushNotificationsDispatched: raw.pushNotificationsDispatched,
      computedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        usageMetrics.organizationId,
        usageMetrics.metricPeriodStart,
        usageMetrics.metricPeriodEnd,
        usageMetrics.metricType,
      ],
      set: {
        activeUsersCount: raw.activeUsersCount,
        activeProjectsCount: raw.activeProjectsCount,
        totalTransactionsCount: raw.totalTransactionsCount,
        totalInvoicesCount: raw.totalInvoicesCount,
        totalDocumentsUploaded: raw.totalDocumentsUploaded,
        totalStorageUsedBytes: BigInt(raw.totalStorageUsedBytes),
        aiInvocationsCount: raw.aiInvocationsCount,
        aiTokensConsumed: BigInt(raw.aiTokensConsumed),
        aiCostMinor: BigInt(raw.aiCostMinor),
        apiRequestsCount: raw.apiRequestsCount,
        apiRateLimitedCount: raw.apiRateLimitedCount,
        webhooksDispatchedCount: raw.webhooksDispatchedCount,
        webhooksFailedCount: raw.webhooksFailedCount,
        pushNotificationsDispatched: raw.pushNotificationsDispatched,
        computedAt: now,
      },
    });
  return { ok: true as const, period };
}

export async function aggregateUsageForAllOrgs(
  args: { forDate?: Date; metricType?: MetricType } = {},
) {
  const db = getDb();
  if (!db) return { ok: false as const, error: "DB not configured" };
  const forDate = args.forDate ?? new Date();
  const metricType = args.metricType ?? "daily_summary";

  const orgs = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.isActive, true));

  let processed = 0;
  for (const o of orgs) {
    const r = await recordUsageMetrics({
      organizationId: o.id,
      forDate,
      metricType,
    });
    if (r.ok) processed += 1;
  }
  return { ok: true as const, processed };
}

export async function rollupWeeklyForOrg(args: {
  organizationId: string;
  weekContaining: Date;
}) {
  const db = getDb();
  if (!db) return { ok: false as const, error: "DB not configured" };
  const week = weeklyPeriod(args.weekContaining);
  const dailyRows = await db
    .select()
    .from(usageMetrics)
    .where(
      and(
        eq(usageMetrics.organizationId, args.organizationId),
        eq(usageMetrics.metricType, "daily_summary"),
        gte(usageMetrics.metricPeriodStart, week.start),
        lte(usageMetrics.metricPeriodEnd, week.end),
      ),
    );
  const inputs: RawUsageInputs[] = dailyRows.map((r) => ({
    activeUsersCount: r.activeUsersCount,
    activeProjectsCount: r.activeProjectsCount,
    totalTransactionsCount: r.totalTransactionsCount,
    totalInvoicesCount: r.totalInvoicesCount,
    totalDocumentsUploaded: r.totalDocumentsUploaded,
    totalStorageUsedBytes: Number(r.totalStorageUsedBytes ?? 0n),
    aiInvocationsCount: r.aiInvocationsCount,
    aiTokensConsumed: Number(r.aiTokensConsumed ?? 0n),
    aiCostMinor: Number(r.aiCostMinor ?? 0n),
    apiRequestsCount: r.apiRequestsCount,
    apiRateLimitedCount: r.apiRateLimitedCount,
    webhooksDispatchedCount: r.webhooksDispatchedCount,
    webhooksFailedCount: r.webhooksFailedCount,
    pushNotificationsDispatched: r.pushNotificationsDispatched,
  }));
  const rolled = rollupSummaries(inputs);
  const now = new Date();
  await db
    .insert(usageMetrics)
    .values({
      organizationId: args.organizationId,
      metricPeriodStart: week.start,
      metricPeriodEnd: week.end,
      metricType: "weekly_summary",
      activeUsersCount: rolled.activeUsersCount,
      activeProjectsCount: rolled.activeProjectsCount,
      totalTransactionsCount: rolled.totalTransactionsCount,
      totalInvoicesCount: rolled.totalInvoicesCount,
      totalDocumentsUploaded: rolled.totalDocumentsUploaded,
      totalStorageUsedBytes: BigInt(rolled.totalStorageUsedBytes),
      aiInvocationsCount: rolled.aiInvocationsCount,
      aiTokensConsumed: BigInt(rolled.aiTokensConsumed),
      aiCostMinor: BigInt(rolled.aiCostMinor),
      apiRequestsCount: rolled.apiRequestsCount,
      apiRateLimitedCount: rolled.apiRateLimitedCount,
      webhooksDispatchedCount: rolled.webhooksDispatchedCount,
      webhooksFailedCount: rolled.webhooksFailedCount,
      pushNotificationsDispatched: rolled.pushNotificationsDispatched,
      computedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        usageMetrics.organizationId,
        usageMetrics.metricPeriodStart,
        usageMetrics.metricPeriodEnd,
        usageMetrics.metricType,
      ],
      set: {
        activeUsersCount: rolled.activeUsersCount,
        activeProjectsCount: rolled.activeProjectsCount,
        totalTransactionsCount: rolled.totalTransactionsCount,
        totalInvoicesCount: rolled.totalInvoicesCount,
        totalDocumentsUploaded: rolled.totalDocumentsUploaded,
        totalStorageUsedBytes: BigInt(rolled.totalStorageUsedBytes),
        aiInvocationsCount: rolled.aiInvocationsCount,
        aiTokensConsumed: BigInt(rolled.aiTokensConsumed),
        aiCostMinor: BigInt(rolled.aiCostMinor),
        apiRequestsCount: rolled.apiRequestsCount,
        apiRateLimitedCount: rolled.apiRateLimitedCount,
        webhooksDispatchedCount: rolled.webhooksDispatchedCount,
        webhooksFailedCount: rolled.webhooksFailedCount,
        pushNotificationsDispatched: rolled.pushNotificationsDispatched,
        computedAt: now,
      },
    });
  return { ok: true as const, week };
}

export async function pruneOldApiLogs(args: { olderThanDays: number }) {
  const db = getDb();
  if (!db) return { ok: false as const, error: "DB not configured", pruned: 0 };
  const cutoff = new Date(
    Date.now() - args.olderThanDays * 24 * 60 * 60 * 1000,
  );
  await db.execute(
    sql`DELETE FROM api_request_log WHERE requested_at < ${cutoff}`,
  );
  return { ok: true as const, pruned: 0 };
}

export async function pruneOldRateLimitBuckets() {
  const db = getDb();
  if (!db) return { ok: false as const, error: "DB not configured", pruned: 0 };
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await db.execute(
    sql`DELETE FROM rate_limit_buckets WHERE window_start < ${cutoff}`,
  );
  return { ok: true as const, pruned: 0 };
}
