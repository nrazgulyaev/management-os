import type { Metadata } from "next";
import Link from "next/link";
import { Kpi } from "@/components/dashboard/primitives";
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
    <>
      <div className="page-header mb-0">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/channels">Channels</Link> / <span>Manager</span>
          </div>
          <h1>Channel manager</h1>
          <p className="text-[13.5px] text-ink-3 mt-2 max-w-[560px]">
            Push ARI to your OTA channels, resolve cross-channel double-bookings, and
            watch per-connection sync health. The push execution is simulated — the
            live OTA API integration is deferred to launch.
          </p>
        </div>
        <div className="actions">
          <Link href="/dashboard/channels" className="btn btn-secondary btn-sm">
            ← Channels
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mt-[18px] mb-[18px]">
        <Kpi label="villas in grid" value={String(grid.villas.length)} sub="active" />
        <Kpi
          label="open conflicts"
          value={String(conflicts.length)}
          sub="cross-channel"
          tone={conflicts.length > 0 ? "warn" : undefined}
        />
        <Kpi
          label="connections failing"
          value={String(failing)}
          sub="need a retry"
          tone={failing > 0 ? "warn" : undefined}
        />
        <Kpi
          label="connections degraded"
          value={String(degraded)}
          sub="recent errors"
          tone={degraded > 0 ? "gold" : undefined}
        />
      </div>

      <DbStatusNotice />

      <section className="mt-2">
        <div className="section-heading mb-[18px]">
          <div className="label mb-1.5">(a) ARI push</div>
          <h2 className="text-[28px]">Availability · rate · inventory grid</h2>
        </div>
        {db ? (
          <AriPushGrid data={grid} />
        ) : (
          <p className="text-sm text-ink-3">
            Connect a database to build the ARI grid.
          </p>
        )}
      </section>

      <section className="mt-10">
        <div className="section-heading mb-[18px]">
          <div className="label mb-1.5">(b) Conflicts</div>
          <h2 className="text-[28px]">
            Double-booking resolution
            {conflicts.length ? ` · ${conflicts.length}` : ""}
          </h2>
        </div>
        <ConflictResolver conflicts={conflicts} />
      </section>

      <section className="mt-10">
        <div className="section-heading mb-[18px]">
          <div className="label mb-1.5">(c) Sync health</div>
          <h2 className="text-[28px]">Per-connection health &amp; retry</h2>
        </div>
        <SyncHealth rows={health} />
      </section>
    </>
  );
}
