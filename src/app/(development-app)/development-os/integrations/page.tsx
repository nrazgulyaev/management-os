import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { sql } from "drizzle-orm";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { DashboardKpi } from "@/components/ui/primitives";
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
        <PageHeader title="Integrations" />
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
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Integrations" },
        ]}
        eyebrow={`${activeCount} active · ${errorCount} in error · ${recentErrors} errors in last 7d`}
        title="Integrations"
        description="Health hub for every external system the platform talks to. Click a category to drill into per-connection detail."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Command center
            </Link>
          </Button>
        }
      />

      <Section
        eyebrow="Status"
        title="Channel manager"
        description="Booking.com, Airbnb, Trip.com, Agoda, Expedia, VRBO, Hotels.com. Each connection is per villa × channel."
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <DashboardKpi
            label="Active connections"
            value={String(activeCount)}
            status={activeCount > 0 ? "good" : "neutral"}
            hint={`of ${totalCount} total`}
          />
          <DashboardKpi
            label="Connections in error"
            value={String(errorCount)}
            status={errorCount > 0 ? "bad" : "good"}
            hint={errorCount > 0 ? "Investigate from /development-os/channels" : "All connections healthy"}
          />
          <DashboardKpi
            label="Paused"
            value={String(pausedCount)}
            status={pausedCount > 0 ? "warn" : "neutral"}
            hint="Not actively syncing"
          />
          <DashboardKpi
            label="API calls · 7d"
            value={recentApiCalls.toLocaleString()}
            status={recentErrors > 0 ? "warn" : "neutral"}
            hint={`${recentErrors} failed sync${recentErrors === 1 ? "" : "s"}`}
          />
        </div>
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <Button asChild>
            <Link href="/development-os/channels">Open channels →</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/development-os/channels/inbox">Reservation inbox</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/development-os/channels/conflicts">
              <AlertTriangle className="w-3 h-3" />
              Conflicts
            </Link>
          </Button>
        </div>
      </Section>

      <Section eyebrow="Roadmap" title="Other integration categories">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <PlaceholderCard
            title="Communications"
            stage="Soon"
            description="WhatsApp, Telegram, Instagram, Facebook Messenger, Email — unified inbox."
          />
          <PlaceholderCard
            title="Banking + Payments"
            stage="Soon"
            description="Revolut, Wise, Stripe, Indonesian bank CSV imports + reconciliation."
          />
          <PlaceholderCard
            title="Marketing + Analytics"
            stage="Soon"
            description="Meta Ads, Google Ads, GA4, attribution, transactional + campaign email."
          />
          <PlaceholderCard
            title="Productivity"
            stage="Soon"
            description="Google Calendar, Gmail, Sheets, Drive — Workspace OAuth lands here."
          />
          <PlaceholderCard
            title="AI Agents"
            stage="Soon"
            description="Extends the AI provider catalog: Gemini, vision, embeddings, per-agent routing."
          />
        </div>
      </Section>
    </DevelopmentShell>
  );
}

function PlaceholderCard({
  title,
  stage,
  description,
}: {
  title: string;
  stage: string;
  description: string;
}) {
  return (
    <div className="rounded-md border border-dashed border-line-soft p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-ink">{title}</span>
        <Badge tone="neutral">{stage}</Badge>
      </div>
      <p className="text-[11px] text-ink-tertiary mt-1 leading-relaxed">
        {description}
      </p>
    </div>
  );
}
