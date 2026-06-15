import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Inbox, Calendar, AlertTriangle } from "lucide-react";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { safeQuery } from "@/lib/development/safe-query";
import {
  listChannelConnections,
  getPerChannelSummary,
} from "@/lib/channel-manager/queries";
import { villas as villasTable } from "@/lib/db/schema/projects";
import { ConnectionsGrid } from "@/components/development/channels/connections-grid";
import { CHANNEL_LABELS } from "@/components/development/channels/connect-channel-modal";
import type { ChannelName } from "@/lib/db/schema/channel-manager";

export const metadata: Metadata = { title: "Channels · Development OS" };
export const dynamic = "force-dynamic";

const TOP_CHANNELS: readonly ChannelName[] = [
  "booking_com",
  "airbnb",
  "trip_com",
  "agoda",
  "expedia",
  "vrbo",
  "hotels_com",
] as const;

export default async function ChannelsPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <h1>Channels</h1>
          </div>
        </div>
        <EmptyState
          title="Database not configured"
          description="Set DATABASE_URL."
        />
      </DevelopmentShell>
    );
  }

  const [villas, connections, perChannel] = await Promise.all([
    safeQuery(
      "channels: list villas",
      db
        .select({
          id: villasTable.id,
          name: villasTable.name,
          unitCode: villasTable.unitCode,
        })
        .from(villasTable)
        .orderBy(villasTable.unitCode)
        .then((rows) =>
          rows.map((v) => ({
            id: v.id,
            name: v.name ?? v.unitCode,
            unitCode: v.unitCode,
          })),
        ),
      [] as Array<{ id: string; name: string; unitCode: string }>,
      4000,
    ),
    safeQuery("listChannelConnections", listChannelConnections(), [], 4000),
    safeQuery("getPerChannelSummary", getPerChannelSummary(), [], 4000),
  ]);

  const summaryByChannel = new Map(
    perChannel.map((s) => [s.channel, s] as const),
  );
  const totalActive = perChannel.reduce((acc, s) => acc + s.activeCount, 0);

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <span>Channels</span>
          </div>
          <h1>Channel manager</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Connect each villa to one or more booking channels (Booking.com,
            Airbnb, Trip.com, Agoda, Expedia, VRBO, Hotels.com). Each connection
            encrypts credentials at rest, runs a connection test on save, and
            pushes inventory + rates on the cron schedule defined in P1.G.
          </p>
        </div>
        <div className="actions">
          <div className="flex items-center gap-2">
            <Link
              href="/development-os/channels/inbox"
              className="btn btn-secondary btn-sm"
            >
              <Inbox className="w-4 h-4" strokeWidth={1.75} />
              Inbox
            </Link>
            <Link
              href="/development-os/channels/calendar"
              className="btn btn-secondary btn-sm"
            >
              <Calendar className="w-4 h-4" strokeWidth={1.75} />
              Calendar
            </Link>
            <Link
              href="/development-os/channels/conflicts"
              className="btn btn-secondary btn-sm"
            >
              <AlertTriangle className="w-4 h-4" strokeWidth={1.75} />
              Conflicts
            </Link>
            <Link
              href="/development-os"
              className="btn btn-secondary btn-sm"
            >
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Command center
            </Link>
          </div>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Channel snapshot</div>
        <Card padding="default">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
          {TOP_CHANNELS.map((c) => {
            const summary = summaryByChannel.get(c);
            const total = summary?.connectedCount ?? 0;
            const active = summary?.activeCount ?? 0;
            return (
              <div
                key={c}
                className="rounded-md border border-line-soft p-3"
                data-testid={`channel-summary-${c}`}
              >
                <div className="text-xs font-medium text-ink">
                  {CHANNEL_LABELS[c]}
                </div>
                <div className="mt-1 text-lg font-medium tabular-nums">
                  {active}
                  <span className="text-[11px] text-ink-tertiary font-normal">
                    {" "}
                    / {villas.length}
                  </span>
                </div>
                <div className="text-[11px] text-ink-tertiary">
                  {total === active ? "all active" : `${total - active} not active`}
                </div>
              </div>
            );
          })}
        </div>
        </Card>
      </div>

      <div>
        <div className="label mb-2.5">Connections</div>
        {villas.length === 0 ? (
          <EmptyState
            title="No villas yet"
            description="Add villas in /development-os/projects before connecting channels."
            action={<HandoffBadge tone="warn">No villas to connect</HandoffBadge>}
          />
        ) : (
          <ConnectionsGrid villas={villas} connections={connections} />
        )}
      </div>
    </DevelopmentShell>
  );
}
