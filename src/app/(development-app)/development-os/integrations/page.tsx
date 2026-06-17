import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, AlertTriangle, ArrowUpRight } from "lucide-react";
import { sql } from "drizzle-orm";
import { EmptyState } from "@/components/ui/empty-state";
import { Kpi, Card } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import {
  channelConnections,
  channelSyncLog,
} from "@/lib/db/schema/channel-manager";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = {
  title: "Integrations · Development OS",
};
export const dynamic = "force-dynamic";

/**
 * Stage 6.P1.G.3 — Platform-wide integrations health hub.
 * Stage 10.M.5 — fixed runtime 500 (Track B closure):
 *   - Dropped the dead `void CHANNEL_LABELS` import that pulled a
 *     "use client" module into this server-component graph.
 *   - Wrapped every db query in safeQuery so a query failure surfaces
 *     a degraded view (zeros) instead of a 500 page.
 *   - Switched StatTile → 10.D <DashboardKpi>.
 */
export default async function IntegrationsHubPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <h1>Integrations</h1>
          </div>
        </div>
        <EmptyState
          title="Database not configured"
          description="Set DATABASE_URL."
        />
      </DevelopmentShell>
    );
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const statusFallback = { active: 0, error: 0, paused: 0, total: 0 };

  const [statusRow, recentErrors, recentApiCalls] = await Promise.all([
    safeQuery(
      "integrations.connectionStatus",
      db
        .select({
          active: sql<number>`count(*) FILTER (WHERE ${channelConnections.status} = 'active')::int`,
          error: sql<number>`count(*) FILTER (WHERE ${channelConnections.status} = 'error')::int`,
          paused: sql<number>`count(*) FILTER (WHERE ${channelConnections.status} = 'paused')::int`,
          total: sql<number>`count(*)::int`,
        })
        .from(channelConnections)
        .then((rows) => rows[0] ?? statusFallback),
      statusFallback,
      4000,
    ),
    safeQuery(
      "integrations.recentErrors",
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(channelSyncLog)
        .where(
          sql`${channelSyncLog.status} = 'failed' AND ${channelSyncLog.triggeredAt} >= ${sevenDaysAgo}`,
        )
        .then((rows) => Number(rows[0]?.c ?? 0)),
      0,
      4000,
    ),
    safeQuery(
      "integrations.apiCalls7d",
      db
        .select({
          c: sql<number>`coalesce(sum(${channelSyncLog.apiCallsCount}), 0)::int`,
        })
        .from(channelSyncLog)
        .where(sql`${channelSyncLog.triggeredAt} >= ${sevenDaysAgo}`)
        .then((rows) => Number(rows[0]?.c ?? 0)),
      0,
      4000,
    ),
  ]);

  const activeCount = Number(statusRow.active ?? 0);
  const errorCount = Number(statusRow.error ?? 0);
  const pausedCount = Number(statusRow.paused ?? 0);
  const totalCount = Number(statusRow.total ?? 0);

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <span>Integrations</span>
          </div>
          <h1>Integrations</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Health hub for every external system the platform talks to. Click a
            category to drill into per-connection detail.
          </p>
        </div>
        <div className="actions">
          <Link href="/development-os" className="btn btn-secondary">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Command center
          </Link>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Status</div>
        <Card padding="default">
          <p className="text-[13px] text-ink-3 mt-0 mb-3 max-w-[680px]">
            Booking.com, Airbnb, Trip.com, Agoda, Expedia, VRBO, Hotels.com. Each
            connection is per villa × channel.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi
              label="Active connections"
              value={String(activeCount)}
              sub={`of ${totalCount} total`}
              tone={activeCount > 0 ? "success" : undefined}
            />
            <Kpi
              label="Connections in error"
              value={String(errorCount)}
              sub={
                errorCount > 0
                  ? "Investigate from /development-os/channels"
                  : "All connections healthy"
              }
              tone={errorCount > 0 ? "danger" : "success"}
            />
            <Kpi
              label="Paused"
              value={String(pausedCount)}
              sub="Not actively syncing"
              tone={pausedCount > 0 ? "warn" : undefined}
            />
            <Kpi
              label="API calls · 7d"
              value={recentApiCalls.toLocaleString()}
              sub={`${recentErrors} failed sync${recentErrors === 1 ? "" : "s"}`}
              tone={recentErrors > 0 ? "warn" : undefined}
            />
          </div>
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <Link href="/development-os/channels" className="btn btn-accent">
              Open channels →
            </Link>
            <Link
              href="/development-os/channels/inbox"
              className="btn btn-secondary"
            >
              Reservation inbox
            </Link>
            <Link
              href="/development-os/channels/conflicts"
              className="btn btn-secondary"
            >
              <AlertTriangle className="w-3 h-3" />
              Conflicts
            </Link>
          </div>
        </Card>
      </div>

      <div>
        <div className="label mb-2.5">Integration categories</div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <CategoryCard
            title="Communications"
            href="/development-os/whatsapp"
            description="WhatsApp Business, message templates, and the per-org messaging runtime."
          />
          <CategoryCard
            title="Banking + Payments"
            href="/development-os/banking"
            description="Bank connections, statement imports, and reconciliation."
          />
          <CategoryCard
            title="Marketing + Analytics"
            href="/development-os/marketing"
            description="Ad platforms, attribution, and campaign + transactional email."
          />
          <CategoryCard
            title="Productivity"
            href="/development-os/productivity"
            description="Google Workspace: Calendar, Gmail, Sheets, and Drive."
          />
          <CategoryCard
            title="AI Agents"
            href="/development-os/ai-agents"
            description="Provider catalog, per-agent routing, and the automation fleet."
          />
        </div>
      </div>
    </DevelopmentShell>
  );
}

function CategoryCard({
  title,
  href,
  description,
}: {
  title: string;
  href: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group block rounded-md border border-line-soft p-3 transition-colors hover:border-line-strong hover:bg-muted"
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-ink">{title}</span>
        <ArrowUpRight
          className="w-4 h-4 text-ink-tertiary group-hover:text-accent"
          strokeWidth={1.75}
        />
      </div>
      <p className="text-[11px] text-ink-tertiary mt-1 leading-relaxed">
        {description}
      </p>
    </Link>
  );
}
