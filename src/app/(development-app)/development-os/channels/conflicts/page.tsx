import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { listConflictPendingReservations } from "@/lib/channel-manager/service";
import { ConflictResolutionActions } from "@/components/development/channels/conflict-resolution-actions";
import { CHANNEL_LABELS } from "@/components/development/channels/connect-channel-modal";

export const metadata: Metadata = { title: "Channel conflicts · Channels" };
export const dynamic = "force-dynamic";

export default async function ChannelConflictsPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <h1>Channel conflicts</h1>
          </div>
        </div>
        <EmptyState
          title="Database not configured"
          description="Set DATABASE_URL."
        />
      </DevelopmentShell>
    );
  }

  const conflicts = await listConflictPendingReservations();

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/channels">Channels</Link> /{" "}
            <span>Conflicts</span>
          </div>
          <h1>Channel conflicts</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Reservations that overlap an existing booking on the same villa. The
            first-received reservation stays primary; the second is held here
            until the operator confirms or rejects it.
          </p>
        </div>
        <div className="actions">
          <Link
            href="/development-os/channels"
            className="btn btn-secondary btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Channels
          </Link>
        </div>
      </div>

      {conflicts.length === 0 ? (
        <EmptyState
          title="No conflicts"
          description="When two channels confirm overlapping dates on the same villa, the second arrival lands here for operator review."
        />
      ) : (
        <div>
          <div className="label mb-2.5">Pending</div>
          <div className="space-y-3">
            {conflicts.map((c) => (
              <article
                key={c.id}
                className="rounded-md border border-warning/40 bg-warning-weak/20 p-4"
                data-testid={`conflict-card-${c.id}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-warning" />
                      <span className="text-sm font-medium">
                        {c.guestFirstName} {c.guestLastName}
                      </span>
                      <HandoffBadge tone="soft">{CHANNEL_LABELS[c.channel]}</HandoffBadge>
                    </div>
                    <div className="text-xs text-ink-secondary mt-1">
                      {c.checkIn} → {c.checkOut}
                    </div>
                    <div className="text-[11px] text-ink-tertiary mt-0.5">
                      Received {c.receivedAt.toISOString().slice(0, 16).replace("T", " ")}
                    </div>
                  </div>
                  <Link
                    href={`/development-os/channels/inbox/${c.id}`}
                    className="text-xs text-ink-secondary hover:underline"
                    data-testid={`conflict-detail-link-${c.id}`}
                  >
                    View detail →
                  </Link>
                </div>
                <div className="mt-3">
                  <ConflictResolutionActions
                    channelReservationId={c.id}
                    externalReservationId={c.externalReservationId}
                  />
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
    </DevelopmentShell>
  );
}
