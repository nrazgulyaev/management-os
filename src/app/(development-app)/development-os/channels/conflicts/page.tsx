import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
        <PageHeader title="Channel conflicts" />
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
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Channels", href: "/development-os/channels" },
          { label: "Conflicts" },
        ]}
        eyebrow={
          conflicts.length === 0
            ? "All clear"
            : `${conflicts.length} conflict${conflicts.length === 1 ? "" : "s"} awaiting resolution`
        }
        title="Channel conflicts"
        description="Reservations that overlap an existing booking on the same villa. The first-received reservation stays primary; the second is held here until the operator confirms or rejects it."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/channels">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Channels
            </Link>
          </Button>
        }
      />

      {conflicts.length === 0 ? (
        <EmptyState
          title="No conflicts"
          description="When two channels confirm overlapping dates on the same villa, the second arrival lands here for operator review."
        />
      ) : (
        <Section eyebrow="Pending" title={`${conflicts.length} to resolve`}>
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
                      <Badge tone="neutral">{CHANNEL_LABELS[c.channel]}</Badge>
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
        </Section>
      )}
    </DevelopmentShell>
  );
}
