import type { Metadata } from "next";
import Link from "next/link";
import { Kpi } from "@/components/dashboard/primitives";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Forbidden } from "@/components/ui/state";
import { DbStatusNotice } from "@/components/admin/db-status";
import { getDb } from "@/lib/db/client";
import { getCurrentUserContext, hasPermission } from "@/features/auth/permissions";
import {
  getAriPushGrid,
  detectDoubleBookings,
  listConnectionSyncHealth,
} from "@/features/channels/manager";
import { AriPushGrid } from "./_ari-grid";
import { ConflictResolver } from "./_conflict-resolver";
import { SyncHealth } from "./_sync-health";

export const metadata: Metadata = { title: "Channel manager" };
export const dynamic = "force-dynamic";

export default async function ChannelManagerPage() {
  const ctx = await getCurrentUserContext();
  if (!hasPermission(ctx, "channels.read")) {
    return (
      <Forbidden
        title="Channel manager is restricted"
        reason="Ask an administrator for the channels.read permission to view ARI pushes, conflicts and sync health."
      />
    );
  }

  const db = getDb();
  const [grid, conflicts, health] = await Promise.all([
    getAriPushGrid({ days: 14 }).catch(() => ({
      dates: [],
      villas: [],
      channelKeys: [],
      anchor: "",
    })),
    detectDoubleBookings().catch(() => []),
    listConnectionSyncHealth().catch(() => []),
  ]);

  const failing = health.filter((h) => h.health === "down").length;
  const degraded = health.filter((h) => h.health === "warn").length;

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Channels", href: "/dashboard/channels" },
          { label: "Manager" },
        ]}
        eyebrow="Availability · rates · inventory"
        title="Channel manager"
        description="Push ARI to your OTA channels, resolve cross-channel double-bookings, and watch per-connection sync health. The push execution is simulated — the live OTA API integration is deferred to launch."
        actions={
          <Link href="/dashboard/channels" className="btn btn-secondary btn-sm">
            ← Channels
          </Link>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Villas in grid" value={String(grid.villas.length)} sub="active" />
        <Kpi
          label="Open conflicts"
          value={String(conflicts.length)}
          sub="cross-channel"
          tone={conflicts.length > 0 ? "gold" : undefined}
        />
        <Kpi
          label="Connections failing"
          value={String(failing)}
          sub="need a retry"
          tone={failing > 0 ? "gold" : undefined}
        />
        <Kpi
          label="Connections degraded"
          value={String(degraded)}
          sub="recent errors"
          tone={degraded > 0 ? "gold" : undefined}
        />
      </div>

      <DbStatusNotice />

      <Section
        eyebrow="(a) ARI push"
        title="Availability / rate / inventory grid"
      >
        {db ? (
          <AriPushGrid data={grid} />
        ) : (
          <p className="text-sm text-ink-tertiary">
            Connect a database to build the ARI grid.
          </p>
        )}
      </Section>

      <Section
        eyebrow="(b) Conflicts"
        title={`Double-booking resolution${conflicts.length ? ` · ${conflicts.length}` : ""}`}
      >
        <ConflictResolver conflicts={conflicts} />
      </Section>

      <Section eyebrow="(c) Sync health" title="Per-connection health & retry">
        <SyncHealth rows={health} />
      </Section>
    </div>
  );
}
