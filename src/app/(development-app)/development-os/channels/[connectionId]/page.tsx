import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricCard } from "@/components/ui/metric-card";
import {
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
  TDNum,
} from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import {
  getChannelConnectionById,
  listSyncLogForConnection,
  listChannelReservations,
} from "@/lib/channel-manager/queries";
import { getRedactedCredentials } from "@/lib/channel-manager/actions";
import { ConnectionActions } from "@/components/development/channels/connection-actions";
import { CHANNEL_LABELS } from "@/components/development/channels/connect-channel-modal";
import type {
  ChannelConnectionStatus,
  ChannelName,
} from "@/lib/db/schema/channel-manager";

export const metadata: Metadata = { title: "Connection · Channels" };
export const dynamic = "force-dynamic";

const TABS = ["overview", "rates", "reservations", "settings"] as const;
type Tab = (typeof TABS)[number];

export default async function ConnectionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ connectionId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { connectionId } = await params;
  const { tab: tabParam } = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(tabParam ?? "overview")
    ? ((tabParam ?? "overview") as Tab)
    : "overview";

  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Connection" />
        <EmptyState
          title="Database not configured"
          description="Set DATABASE_URL."
        />
      </DevelopmentShell>
    );
  }
  const connection = await getChannelConnectionById(connectionId);
  if (!connection) notFound();

  const channel = connection.channel as ChannelName;
  const status = connection.status as ChannelConnectionStatus;

  const [syncLog, reservations, redactedCreds] = await Promise.all([
    listSyncLogForConnection(connectionId, { limit: 25 }),
    listChannelReservations({ limit: 10 }).then((r) =>
      r.filter((x) => x.channelConnectionId === connectionId),
    ),
    getRedactedCredentials(connectionId),
  ]);

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Channels", href: "/development-os/channels" },
          { label: `${CHANNEL_LABELS[channel]} · ${connection.externalPropertyId}` },
        ]}
        eyebrow={`${CHANNEL_LABELS[channel]} · ${status}`}
        title={`${CHANNEL_LABELS[channel]} connection`}
        description={`External property ID: ${connection.externalPropertyId}`}
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/channels">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              All channels
            </Link>
          </Button>
        }
      />

      <TabStrip current={tab} connectionId={connectionId} />

      {tab === "overview" && (
        <>
          <Section eyebrow="Snapshot" title="Status + activity">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <MetricCard
                label="Status"
                value={status}
                hint={
                  connection.connectedAt
                    ? `connected ${connection.connectedAt.toISOString().slice(0, 10)}`
                    : "not yet connected"
                }
              />
              <MetricCard
                label="Last inventory sync"
                value={
                  connection.lastInventorySyncAt
                    ? connection.lastInventorySyncAt
                        .toISOString()
                        .slice(0, 16)
                        .replace("T", " ")
                    : "—"
                }
                hint={connection.lastInventorySyncStatus ?? undefined}
              />
              <MetricCard
                label="Last reservations pull"
                value={
                  connection.lastReservationSyncAt
                    ? connection.lastReservationSyncAt
                        .toISOString()
                        .slice(0, 16)
                        .replace("T", " ")
                    : "—"
                }
                hint={connection.lastReservationSyncStatus ?? undefined}
              />
              <MetricCard
                label="Channel commission"
                value={
                  connection.channelCommissionPct
                    ? `${connection.channelCommissionPct}%`
                    : "—"
                }
              />
            </div>
            {connection.lastInventorySyncError && (
              <div className="mt-3 rounded-md border border-warning/40 bg-warning-weak/30 p-3 text-xs text-warning">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-3 h-3 mt-0.5" />
                  <div>
                    <div className="font-medium">Last inventory sync error</div>
                    <div className="font-mono mt-1">
                      {connection.lastInventorySyncError}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </Section>

          <Section eyebrow="Actions" title="Operate this connection">
            <ConnectionActions connectionId={connectionId} status={status} />
          </Section>

          <Section eyebrow="Recent activity" title="Last 25 sync attempts">
            {syncLog.length === 0 ? (
              <EmptyState
                title="No sync activity yet"
                description="Triggers: scheduled crons (P1.G) + manual pulls + inbound webhooks."
              />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>When</TH>
                    <TH>Type</TH>
                    <TH>Source</TH>
                    <TH>Status</TH>
                    <TH>Records</TH>
                    <TH>API calls</TH>
                    <TH>Duration</TH>
                  </TR>
                </THead>
                <TBody>
                  {syncLog.map((s) => (
                    <TR key={s.id}>
                      <TD className="text-xs">
                        {s.triggeredAt.toISOString().slice(0, 16).replace("T", " ")}
                      </TD>
                      <TD className="text-xs">{s.syncType}</TD>
                      <TD className="text-xs">{s.triggerSource}</TD>
                      <TD>
                        <Badge tone={syncStatusTone(s.status)}>{s.status}</Badge>
                      </TD>
                      <TDNum>
                        {s.recordsSucceeded}
                        {s.recordsFailed > 0 ? ` / ${s.recordsFailed} failed` : ""}
                      </TDNum>
                      <TDNum>{s.apiCallsCount}</TDNum>
                      <TDNum>
                        {s.durationMs != null ? `${s.durationMs}ms` : "—"}
                      </TDNum>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Section>
        </>
      )}

      {tab === "rates" && (
        <Section
          eyebrow="Rate management"
          title="Per-day rates"
          description="Calendar view + bulk edit. Rates push to the channel via the cron schedule (P1.G); use 'Push now' on the calendar page to sync immediately."
        >
          <div className="rounded-md border border-line-soft p-4">
            <Button asChild>
              <Link
                href={`/development-os/channels/${connectionId}/rates`}
              >
                Open rate calendar →
              </Link>
            </Button>
            <p className="text-xs text-ink-tertiary mt-3">
              The rate calendar lives on its own page so the month grid
              has the screen real estate it needs.
            </p>
          </div>
        </Section>
      )}

      {tab === "reservations" && (
        <Section
          eyebrow="Reservations"
          title={`Recent reservations from ${CHANNEL_LABELS[channel]}`}
        >
          {reservations.length === 0 ? (
            <EmptyState
              title="No reservations yet"
              description="Reservations arrive via webhooks (P1.G) or the manual pull button on the Overview tab."
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>External ID</TH>
                  <TH>Guest</TH>
                  <TH>Check-in</TH>
                  <TH>Check-out</TH>
                  <TH>State</TH>
                </TR>
              </THead>
              <TBody>
                {reservations.map((r) => (
                  <TR key={r.id}>
                    <TD className="font-mono text-xs">
                      <Link
                        href={`/development-os/channels/inbox/${r.id}`}
                        className="hover:underline"
                      >
                        {r.externalReservationId}
                      </Link>
                    </TD>
                    <TD className="text-sm">
                      {r.guestFirstName} {r.guestLastName}
                    </TD>
                    <TD className="text-xs">{r.checkIn}</TD>
                    <TD className="text-xs">{r.checkOut}</TD>
                    <TD>
                      <Badge tone="neutral">{r.reservationState}</Badge>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Section>
      )}

      {tab === "settings" && (
        <Section
          eyebrow="Settings"
          title="Configured credentials"
          description="Secret-bearing fields are stripped before display. To rotate credentials, re-run the Connect flow from the channels grid."
        >
          <div className="rounded-md border border-line-soft p-4 space-y-2">
            {Object.entries(redactedCreds).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between text-xs">
                <span className="text-ink-tertiary">{k}</span>
                <span className="font-mono">{String(v ?? "—")}</span>
              </div>
            ))}
            {Object.keys(redactedCreds).length === 0 && (
              <p className="text-xs text-ink-tertiary">
                No credentials configured (DryRun mode).
              </p>
            )}
          </div>
        </Section>
      )}
    </DevelopmentShell>
  );
}

function TabStrip({
  current,
  connectionId,
}: {
  current: Tab;
  connectionId: string;
}) {
  return (
    <div className="flex items-center gap-2 text-xs" data-testid="tab-strip">
      {TABS.map((t) => {
        const isActive = current === t;
        return (
          <Link
            key={t}
            href={`/development-os/channels/${connectionId}?tab=${t}`}
            className={`rounded-md px-3 py-1.5 ${
              isActive
                ? "bg-ink text-ink-inverse"
                : "border border-line-soft hover:bg-muted/40"
            }`}
            data-testid={`tab-${t}`}
          >
            {tabLabel(t)}
          </Link>
        );
      })}
    </div>
  );
}

function tabLabel(t: Tab): string {
  switch (t) {
    case "overview":
      return "Overview";
    case "rates":
      return "Rate management";
    case "reservations":
      return "Reservations";
    case "settings":
      return "Settings";
  }
}

function syncStatusTone(
  s: string,
): "success" | "warning" | "danger" | "info" | "neutral" {
  switch (s) {
    case "success":
      return "success";
    case "partial":
      return "warning";
    case "failed":
      return "danger";
    case "pending":
    case "running":
      return "info";
    default:
      return "neutral";
  }
}
