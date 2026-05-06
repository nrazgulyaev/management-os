import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
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
        <PageHeader title="Rate management" />
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
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Channels", href: "/development-os/channels" },
          {
            label: `${CHANNEL_LABELS[channel]} · ${connection.externalPropertyId}`,
            href: `/development-os/channels/${connectionId}`,
          },
          { label: "Rate management" },
        ]}
        eyebrow={`${CHANNEL_LABELS[channel]} · ${villa?.name ?? "—"}`}
        title="Rate management"
        description="Per-day rates pushed to the channel. Today + next 18 months. Click a day to edit, or use Bulk edit to apply across a range."
        actions={
          <Button asChild variant="secondary">
            <Link href={`/development-os/channels/${connectionId}`}>
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Connection
            </Link>
          </Button>
        }
      />

      <Section eyebrow="Calendar" title="Per-day rates">
        <RateCalendar
          connectionId={connectionId}
          channelLabel={CHANNEL_LABELS[channel]}
          baseRateUsd={baseRateUsd}
          onPushRates={pushRatesForConnection}
        />
      </Section>
    </DevelopmentShell>
  );
}
