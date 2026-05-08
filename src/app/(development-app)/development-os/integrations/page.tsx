import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { sql } from "drizzle-orm";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import {
  channelConnections,
  channelSyncLog,
} from "@/lib/db/schema/channel-manager";
import { CHANNEL_LABELS } from "@/components/development/channels/connect-channel-modal";

export const metadata: Metadata = {
  title: "Integrations · Development OS",
};
export const dynamic = "force-dynamic";

/**
 * Stage 6.P1.G.3 — Platform-wide integrations health hub.
 *
 * One card per integration category. Channel Manager is fully
 * populated in P1; the others are placeholders (Banking → P3,
 * Communications → P2, Marketing → P4, Productivity → P5, AI Agents →
 * extends Stage 3.A) so operators see the full integration roadmap
 * from day one.
 *
 * Click "Channel Manager" → drill into the channels grid.
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
  const [statusRow, recentErrors, recentApiCallsRow] = await Promise.all([
    db
      .select({
        active: sql<number>`count(*) FILTER (WHERE ${channelConnections.status} = 'active')::int`,
        error: sql<number>`count(*) FILTER (WHERE ${channelConnections.status} = 'error')::int`,
        paused: sql<number>`count(*) FILTER (WHERE ${channelConnections.status} = 'paused')::int`,
        total: sql<number>`count(*)::int`,
      })
      .from(channelConnections)
      .then((rows) => rows[0]),
    db
      .select({
        c: sql<number>`count(*)::int`,
      })
      .from(channelSyncLog)
      .where(
        sql`${channelSyncLog.status} = 'failed' AND ${channelSyncLog.triggeredAt} >= ${sevenDaysAgo}`,
      )
      .then((rows) => Number(rows[0]?.c ?? 0)),
    db
      .select({
        c: sql<number>`coalesce(sum(${channelSyncLog.apiCallsCount}), 0)::int`,
      })
      .from(channelSyncLog)
      .where(sql`${channelSyncLog.triggeredAt} >= ${sevenDaysAgo}`)
      .then((rows) => Number(rows[0]?.c ?? 0)),
  ]);

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Integrations" },
        ]}
        eyebrow={`${statusRow?.active ?? 0} active · ${statusRow?.error ?? 0} in error · ${recentErrors} errors in last 7d`}
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
          <StatTile
            label="Active connections"
            value={String(statusRow?.active ?? 0)}
            hint={`of ${statusRow?.total ?? 0} total`}
          />
          <StatTile
            label="Connections in error"
            value={String(statusRow?.error ?? 0)}
            tone={(statusRow?.error ?? 0) > 0 ? "danger" : "neutral"}
          />
          <StatTile
            label="Paused"
            value={String(statusRow?.paused ?? 0)}
          />
          <StatTile
            label="API calls (7d)"
            value={recentApiCallsRow.toLocaleString()}
            hint={`${recentErrors} failed sync${recentErrors === 1 ? "" : "s"}`}
            tone={recentErrors > 0 ? "warning" : "neutral"}
          />
        </div>
        <div className="mt-3 flex items-center gap-2">
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

function StatTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "danger" | "warning" | "neutral";
}) {
  const valueClass =
    tone === "danger"
      ? "text-danger"
      : tone === "warning"
        ? "text-warning"
        : "text-ink";
  return (
    <div className="rounded-md border border-line-soft p-3">
      <div className="text-[11px] uppercase tracking-wide text-ink-tertiary">
        {label}
      </div>
      <div className={`mt-1 text-xl font-medium tabular-nums ${valueClass}`}>
        {value}
      </div>
      {hint && (
        <div className="text-[11px] text-ink-tertiary mt-0.5">{hint}</div>
      )}
    </div>
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

void CHANNEL_LABELS; // imported for future per-channel breakdown — keep ref alive
