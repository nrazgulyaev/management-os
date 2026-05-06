import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getChannelReservationById } from "@/lib/channel-manager/queries";
import { CHANNEL_LABELS } from "@/components/development/channels/connect-channel-modal";
import type { ChannelName } from "@/lib/db/schema/channel-manager";

export const metadata: Metadata = { title: "Reservation · Channel inbox" };
export const dynamic = "force-dynamic";

export default async function ReservationDetailPage({
  params,
}: {
  params: Promise<{ reservationId: string }>;
}) {
  const { reservationId } = await params;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Reservation" />
        <EmptyState
          title="Database not configured"
          description="Set DATABASE_URL."
        />
      </DevelopmentShell>
    );
  }
  const row = await getChannelReservationById(reservationId);
  if (!row) notFound();
  const r = row.reservation;
  const channel = row.channel as ChannelName;

  const fmtUsd = (b: bigint | null | string | number) => {
    if (b == null) return "—";
    const n = typeof b === "bigint" ? Number(b) : Number(b);
    return `${(n / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${r.currency}`;
  };

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Channels", href: "/development-os/channels" },
          { label: "Inbox", href: "/development-os/channels/inbox" },
          { label: r.externalReservationId },
        ]}
        eyebrow={`${CHANNEL_LABELS[channel]} · ${r.reservationState}`}
        title={`${r.guestFirstName ?? "Unknown"} ${r.guestLastName ?? "Guest"}`}
        description={`${r.checkIn} → ${r.checkOut}`}
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/channels/inbox">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Inbox
            </Link>
          </Button>
        }
      />

      {r.conflictPending && (
        <div className="rounded-md border border-warning/40 bg-warning-weak/30 p-3 text-xs text-warning flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5" />
          <div>
            <div className="font-medium">Conflict pending — operator action required</div>
            <div className="mt-1">
              This reservation overlaps an existing booking. Review and
              resolve via the channel manager service in P1.G.
            </div>
          </div>
        </div>
      )}

      <Section eyebrow="Guest" title="Contact info">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Field label="First name" value={r.guestFirstName ?? "—"} />
          <Field label="Last name" value={r.guestLastName ?? "—"} />
          <Field label="Email" value={r.guestEmail ?? "—"} mono />
          <Field label="Phone" value={r.guestPhone ?? "—"} mono />
          <Field label="Country" value={r.guestCountry ?? "—"} />
          <Field
            label="Adults / Children / Infants"
            value={`${r.numAdults ?? "—"} / ${r.numChildren ?? "—"} / ${r.numInfants ?? "—"}`}
          />
        </div>
      </Section>

      <Section eyebrow="Stay" title="Dates + villa">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Field label="Check-in" value={r.checkIn} mono />
          <Field label="Check-out" value={r.checkOut} mono />
          <Field label="Villa" value={row.villaName ?? row.villaCode ?? "—"} />
          <Field label="Villa code" value={row.villaCode ?? "—"} mono />
        </div>
      </Section>

      <Section eyebrow="Pricing" title="Amounts">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Field label="Total" value={fmtUsd(r.totalAmountMinor)} mono />
          <Field label="Channel commission" value={fmtUsd(r.channelCommissionMinor)} mono />
          <Field label="Taxes" value={fmtUsd(r.taxesMinor)} mono />
          <Field label="Service fees" value={fmtUsd(r.serviceFeesMinor)} mono />
        </div>
        <div className="mt-2 text-[11px] text-ink-tertiary">
          Payment collected by:{" "}
          <Badge tone="neutral">{r.paymentCollectedBy ?? "—"}</Badge>
          {r.paymentStatus && (
            <>
              {" · "}
              status: <Badge tone="neutral">{r.paymentStatus}</Badge>
            </>
          )}
        </div>
      </Section>

      <Section
        eyebrow="Linkage"
        title="Internal booking + commission record"
      >
        <div className="text-xs space-y-1">
          <div>
            Internal booking:{" "}
            {r.internalBookingId ? (
              <span className="font-mono">{r.internalBookingId}</span>
            ) : (
              <span className="text-ink-tertiary">
                not yet projected (workflow lands in P1.F)
              </span>
            )}
          </div>
          <div>
            Reservation state:{" "}
            <Badge tone="neutral">{r.reservationState}</Badge>
          </div>
        </div>
      </Section>

      {r.specialRequests && (
        <Section eyebrow="Notes" title="Special requests">
          <div className="rounded-md border border-line-soft p-3 text-sm whitespace-pre-wrap">
            {r.specialRequests}
          </div>
        </Section>
      )}

      <Section
        eyebrow="Raw payload"
        title="Source-of-truth from the channel"
      >
        <details>
          <summary className="cursor-pointer text-xs text-ink-secondary">
            Show raw JSON ({Object.keys((r.rawPayload as object) ?? {}).length}{" "}
            top-level fields)
          </summary>
          <pre
            className="mt-2 rounded-md border border-line-soft bg-muted/30 p-3 text-[11px] overflow-x-auto"
            data-testid="raw-payload"
          >
            {JSON.stringify(r.rawPayload, null, 2)}
          </pre>
        </details>
      </Section>
    </DevelopmentShell>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-ink-tertiary">
        {label}
      </div>
      <div className={mono ? "font-mono text-xs" : "text-sm"}>{value}</div>
    </div>
  );
}
