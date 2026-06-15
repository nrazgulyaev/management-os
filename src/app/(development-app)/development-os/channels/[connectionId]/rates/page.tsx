import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getChannelConnectionById } from "@/lib/channel-manager/queries";
import { villas as villasTable } from "@/lib/db/schema/projects";
import { eq } from "drizzle-orm";
import { RateCalendar } from "@/components/development/channels/rate-calendar";
import { CHANNEL_LABELS } from "@/components/development/channels/connect-channel-modal";
import { pushRatesForConnection } from "./push-rates-action";
import type { ChannelName } from "@/lib/db/schema/channel-manager";

export const metadata: Metadata = { title: "Rate management · Channels" };
export const dynamic = "force-dynamic";

export default async function RateManagementPage({
  params,
}: {
  params: Promise<{ connectionId: string }>;
}) {
  const { connectionId } = await params;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <h1>Rate management</h1>
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

  const [villa] = await db
    .select({
      name: villasTable.name,
      unitCode: villasTable.unitCode,
      currentNightlyRateUsd: villasTable.currentNightlyRateUsd,
    })
    .from(villasTable)
    .where(eq(villasTable.id, connection.villaId))
    .limit(1);

  const channel = connection.channel as ChannelName;
  const baseRateUsd = villa?.currentNightlyRateUsd
    ? Number(villa.currentNightlyRateUsd)
    : null;

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/channels">Channels</Link> /{" "}
            <Link href={`/development-os/channels/${connectionId}`}>
              {CHANNEL_LABELS[channel]} · {connection.externalPropertyId}
            </Link>{" "}
            / <span>Rate management</span>
          </div>
          <h1>Rate management</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Per-day rates pushed to the channel. Today + next 18 months. Click a
            day to edit, or use Bulk edit to apply across a range.
          </p>
        </div>
        <div className="actions">
          <Link
            href={`/development-os/channels/${connectionId}`}
            className="btn btn-secondary btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Connection
          </Link>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Calendar</div>
        <RateCalendar
          connectionId={connectionId}
          channelLabel={CHANNEL_LABELS[channel]}
          baseRateUsd={baseRateUsd}
          onPushRates={pushRatesForConnection}
        />
      </div>
    </DevelopmentShell>
  );
}
