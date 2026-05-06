import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Inbox, Calendar, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
        <PageHeader title="Channels" />
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
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Channels" },
        ]}
        eyebrow={`${connections.length} connections · ${totalActive} active across ${villas.length} villas`}
        title="Channel manager"
        description="Connect each villa to one or more booking channels (Booking.com, Airbnb, Trip.com, Agoda, Expedia, VRBO, Hotels.com). Each connection encrypts credentials at rest, runs a connection test on save, and pushes inventory + rates on the cron schedule defined in P1.G."
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="secondary">
              <Link href="/development-os/channels/inbox">
                <Inbox className="w-4 h-4" strokeWidth={1.75} />
                Inbox
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/development-os/channels/calendar">
                <Calendar className="w-4 h-4" strokeWidth={1.75} />
                Calendar
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/development-os/channels/conflicts">
                <AlertTriangle className="w-4 h-4" strokeWidth={1.75} />
                Conflicts
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/development-os">
                <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
                Command center
              </Link>
            </Button>
          </div>
        }
      />

      <Section
        eyebrow="Channel snapshot"
        title="Per-channel connection counts"
      >
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
      </Section>

      <Section
        eyebrow="Connections"
        title="Villa × channel"
        description="Click a connected cell to manage rates, view sync history, and pull reservations. Click 'Connect' to add credentials for a new channel."
      >
        {villas.length === 0 ? (
          <EmptyState
            title="No villas yet"
            description="Add villas in /development-os/projects before connecting channels."
            action={<Badge tone="warning">No villas to connect</Badge>}
          />
        ) : (
          <ConnectionsGrid villas={villas} connections={connections} />
        )}
      </Section>
    </DevelopmentShell>
  );
}
