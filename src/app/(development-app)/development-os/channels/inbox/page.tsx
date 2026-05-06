import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { listChannelReservations } from "@/lib/channel-manager/queries";
import { CHANNEL_LABELS } from "@/components/development/channels/connect-channel-modal";
import {
  CHANNEL_NAMES,
  CHANNEL_RESERVATION_STATES,
  type ChannelName,
} from "@/lib/db/schema/channel-manager";

export const metadata: Metadata = { title: "Channel inbox · Channels" };
export const dynamic = "force-dynamic";

export default async function ChannelInboxPage({
  searchParams,
}: {
  searchParams: Promise<{
    channel?: string;
    state?: string;
    from?: string;
    to?: string;
    q?: string;
  }>;
}) {
  const sp = await searchParams;
  const channel = (CHANNEL_NAMES as readonly string[]).includes(sp.channel ?? "")
    ? (sp.channel as ChannelName)
    : undefined;
  const state = (CHANNEL_RESERVATION_STATES as readonly string[]).includes(
    sp.state ?? "",
  )
    ? sp.state
    : undefined;

  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Channel inbox" />
        <EmptyState
          title="Database not configured"
          description="Set DATABASE_URL."
        />
      </DevelopmentShell>
    );
  }

  const reservations = await listChannelReservations({
    channel,
    state,
    fromDate: sp.from,
    toDate: sp.to,
    search: sp.q,
    limit: 200,
  });

  const conflictCount = reservations.filter((r) => r.conflictPending).length;

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Channels", href: "/development-os/channels" },
          { label: "Inbox" },
        ]}
        eyebrow={`${reservations.length} reservation${reservations.length === 1 ? "" : "s"}${conflictCount > 0 ? ` · ${conflictCount} conflict${conflictCount === 1 ? "" : "s"}` : ""}`}
        title="Channel inbox"
        description="Every reservation pulled or webhook-pushed from any connected channel. Filter by channel + state + date range; click a row for the unified detail view."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/channels">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Channels
            </Link>
          </Button>
        }
      />

      <form
        method="GET"
        action="/development-os/channels/inbox"
        className="rounded-md border border-line-soft bg-surface p-3 grid grid-cols-1 md:grid-cols-5 gap-3 text-sm"
        data-testid="inbox-filter-form"
      >
        <FilterField label="Channel">
          <select
            name="channel"
            defaultValue={sp.channel ?? ""}
            className={inputCls}
          >
            <option value="">All channels</option>
            {CHANNEL_NAMES.map((c) =>
              c === "direct" ? null : (
                <option key={c} value={c}>
                  {CHANNEL_LABELS[c]}
                </option>
              ),
            )}
          </select>
        </FilterField>
        <FilterField label="State">
          <select
            name="state"
            defaultValue={sp.state ?? ""}
            className={inputCls}
          >
            <option value="">All states</option>
            {CHANNEL_RESERVATION_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Check-in from">
          <input
            type="date"
            name="from"
            defaultValue={sp.from ?? ""}
            className={inputCls}
          />
        </FilterField>
        <FilterField label="Check-out to">
          <input
            type="date"
            name="to"
            defaultValue={sp.to ?? ""}
            className={inputCls}
          />
        </FilterField>
        <FilterField label="Search">
          <input
            type="text"
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="name / email / external ID"
            className={inputCls}
          />
        </FilterField>
        <div className="md:col-span-5 flex items-center gap-2">
          <Button type="submit" size="sm">
            Apply
          </Button>
          {(sp.channel || sp.state || sp.from || sp.to || sp.q) && (
            <Button asChild variant="ghost" size="sm">
              <Link href="/development-os/channels/inbox">Clear</Link>
            </Button>
          )}
        </div>
      </form>

      {reservations.length === 0 ? (
        <EmptyState
          title="No reservations match"
          description="Try clearing filters, or wait for the next scheduled reservation pull (P1.G crons run every 5 min)."
        />
      ) : (
        <Section eyebrow="Inbox" title="All reservations">
          <Table>
            <THead>
              <TR>
                <TH>Channel</TH>
                <TH>External ID</TH>
                <TH>Guest</TH>
                <TH>Villa</TH>
                <TH>Check-in</TH>
                <TH>Check-out</TH>
                <TH>State</TH>
                <TH>Received</TH>
              </TR>
            </THead>
            <TBody>
              {reservations.map((r) => (
                <TR
                  key={r.id}
                  className={r.conflictPending ? "bg-warning-weak/40" : undefined}
                  data-testid={`inbox-row-${r.id}`}
                >
                  <TD className="text-xs">
                    <Badge tone="neutral">{CHANNEL_LABELS[r.channel]}</Badge>
                  </TD>
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
                    {r.guestEmail && (
                      <div className="text-[11px] text-ink-tertiary">
                        {r.guestEmail}
                      </div>
                    )}
                  </TD>
                  <TD className="text-xs">
                    {r.villaName ?? "—"}
                    <div className="text-[11px] font-mono text-ink-tertiary">
                      {r.villaCode}
                    </div>
                  </TD>
                  <TD className="text-xs">{r.checkIn}</TD>
                  <TD className="text-xs">{r.checkOut}</TD>
                  <TD>
                    <div className="flex items-center gap-1.5">
                      <Badge tone={stateTone(r.reservationState)}>
                        {r.reservationState}
                      </Badge>
                      {r.conflictPending && (
                        <span
                          title="Conflict pending"
                          className="text-warning"
                        >
                          <AlertTriangle className="w-3 h-3" />
                        </span>
                      )}
                    </div>
                  </TD>
                  <TD className="text-xs">
                    {r.receivedAt.toISOString().slice(0, 16).replace("T", " ")}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Section>
      )}
    </DevelopmentShell>
  );
}

const inputCls =
  "w-full rounded-md border border-line-soft bg-surface px-2 py-1.5 text-xs min-h-[36px]";

function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-ink-tertiary">
        {label}
      </span>
      {children}
    </label>
  );
}

function stateTone(
  s: string,
): "success" | "warning" | "danger" | "info" | "neutral" {
  switch (s) {
    case "confirmed":
      return "success";
    case "received":
    case "modified":
      return "info";
    case "cancelled":
    case "no_show":
      return "danger";
    case "completed":
      return "neutral";
    default:
      return "neutral";
  }
}
