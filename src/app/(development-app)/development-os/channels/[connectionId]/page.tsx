import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, Kpi, HandoffBadge } from "@/components/dashboard/primitives";
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
        <div className="page-header">
          <div className="left">
            <h1>Connection</h1>
          </div>
        </div>
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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/channels">Channels</Link> /{" "}
            <span>
              {CHANNEL_LABELS[channel]} · {connection.externalPropertyId}
            </span>
          </div>
          <h1>{CHANNEL_LABELS[channel]} connection</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            External property ID: {connection.externalPropertyId}
          </p>
        </div>
        <div className="actions">
          <Link
            href="/development-os/channels"
            className="btn btn-secondary btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            All channels
          </Link>
        </div>
      </div>

      <TabStrip current={tab} connectionId={connectionId} />

      {tab === "overview" && (
        <>
          <div>
            <div className="label mb-2.5">Snapshot</div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Kpi
                label="Status"
                value={status}
                sub={
                  connection.connectedAt
                    ? `connected ${connection.connectedAt.toISOString().slice(0, 10)}`
                    : "not yet connected"
                }
              />
              <Kpi
                label="Last inventory sync"
                value={
                  connection.lastInventorySyncAt
                    ? connection.lastInventorySyncAt
                        .toISOString()
                        .slice(0, 16)
                        .replace("T", " ")
                    : "—"
                }
                sub={connection.lastInventorySyncStatus ?? undefined}
              />
              <Kpi
                label="Last reservations pull"
                value={
                  connection.lastReservationSyncAt
                    ? connection.lastReservationSyncAt
                        .toISOString()
                        .slice(0, 16)
                        .replace("T", " ")
                    : "—"
                }
                sub={connection.lastReservationSyncStatus ?? undefined}
              />
              <Kpi
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
          </div>

          <div>
            <div className="label mb-2.5">Actions</div>
            <Card padding="default">
              <ConnectionActions connectionId={connectionId} status={status} />
            </Card>
          </div>

          <div>
            <div className="label mb-2.5">Recent activity</div>
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
                        <HandoffBadge tone={syncStatusTone(s.status)}>{s.status}</HandoffBadge>
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
          </div>
        </>
      )}

      {tab === "rates" && (
        <div>
          <div className="label mb-2.5">Rate management</div>
          <Card padding="default">
            <Link
              href={`/development-os/channels/${connectionId}/rates`}
              className="btn btn-accent"
            >
              Open rate calendar →
            </Link>
            <p className="text-xs text-ink-tertiary mt-3">
              The rate calendar lives on its own page so the month grid
              has the screen real estate it needs.
            </p>
          </Card>
        </div>
      )}

      {tab === "reservations" && (
        <div>
          <div className="label mb-2.5">Reservations</div>
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
                      <HandoffBadge tone="soft">{r.reservationState}</HandoffBadge>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </div>
      )}

      {tab === "settings" && (
        <div>
          <div className="label mb-2.5">Settings</div>
          <Card padding="default">
            <div className="space-y-2">
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
          </Card>
        </div>
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
): "ok" | "warn" | "danger" | "info" | "soft" {
  switch (s) {
    case "success":
      return "ok";
    case "partial":
      return "warn";
    case "failed":
      return "danger";
    case "pending":
    case "running":
      return "info";
    default:
      return "soft";
  }
}
