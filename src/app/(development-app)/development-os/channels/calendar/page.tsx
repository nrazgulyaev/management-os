import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { villas as villasTable } from "@/lib/db/schema/projects";
import { eq } from "drizzle-orm";
import { listChannelReservations } from "@/lib/channel-manager/queries";
import { CHANNEL_LABELS } from "@/components/development/channels/connect-channel-modal";
import type { ChannelName } from "@/lib/db/schema/channel-manager";

export const metadata: Metadata = { title: "Cross-channel calendar · Channels" };
export const dynamic = "force-dynamic";

/**
 * Stage 6.P1.E.4 — Cross-channel calendar block.
 *
 * Per-villa view of every reservation across every channel for the
 * current month + next 2 months. Color-coded by channel; conflict_pending
 * rows are bold-bordered for the operator's attention.
 *
 * P1.G's manual block toolbar (owner stay, maintenance, off-season)
 * lands as a separate add-action. For now the calendar is read-only —
 * already useful for spotting overlaps before the conflict-detection
 * cron runs.
 */
export default async function ChannelCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ villaId?: string }>;
}) {
  const sp = await searchParams;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Cross-channel calendar" />
        <EmptyState
          title="Database not configured"
          description="Set DATABASE_URL."
        />
      </DevelopmentShell>
    );
  }

  const villas = await db
    .select({
      id: villasTable.id,
      name: villasTable.name,
      unitCode: villasTable.unitCode,
    })
    .from(villasTable)
    .orderBy(villasTable.unitCode);

  const villaId =
    sp.villaId && villas.some((v) => v.id === sp.villaId)
      ? sp.villaId
      : (villas[0]?.id ?? undefined);

  const today = new Date();
  const fromDate = today.toISOString().slice(0, 10);
  const horizonDate = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 3, 0),
  )
    .toISOString()
    .slice(0, 10);

  const reservations = villaId
    ? await listChannelReservations({
        villaId,
        fromDate,
        toDate: horizonDate,
        limit: 200,
      })
    : [];

  const months = buildThreeMonths(today);

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Channels", href: "/development-os/channels" },
          { label: "Calendar" },
        ]}
        eyebrow="Cross-channel availability"
        title="Cross-channel calendar"
        description="Per-villa view of every channel's reservations for the next 3 months. Color-coded by source. Conflict-pending rows highlighted for operator review."
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
        action="/development-os/channels/calendar"
        className="rounded-md border border-line-soft bg-surface p-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm"
      >
        <label className="flex flex-col gap-1 md:col-span-2">
          <span className="text-[11px] uppercase tracking-wide text-ink-tertiary">
            Villa
          </span>
          <select
            name="villaId"
            defaultValue={villaId ?? ""}
            className="w-full rounded-md border border-line-soft bg-surface px-2 py-1.5 text-xs min-h-[36px]"
            data-testid="calendar-villa-select"
          >
            {villas.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name ?? v.unitCode} ({v.unitCode})
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end">
          <Button type="submit" size="sm">
            Show
          </Button>
        </div>
      </form>

      {!villaId ? (
        <EmptyState
          title="No villas yet"
          description="Add a villa first."
        />
      ) : reservations.length === 0 ? (
        <EmptyState
          title="No reservations in the next 3 months"
          description="Once channels are connected and a guest books, reservations land here automatically."
        />
      ) : (
        <Section
          eyebrow="Calendar"
          title={`${months[0].label} → ${months[2].label}`}
          description="Each colored bar is one reservation, positioned across its date span. Click any bar for the unified detail page."
        >
          <CalendarLegend />
          <div className="space-y-6 mt-4">
            {months.map((m) => (
              <MonthRow
                key={m.iso}
                year={m.year}
                monthZeroBased={m.month}
                label={m.label}
                reservations={reservations}
              />
            ))}
          </div>
        </Section>
      )}
    </DevelopmentShell>
  );
}

function CalendarLegend() {
  const visible: ChannelName[] = [
    "booking_com",
    "airbnb",
    "trip_com",
    "agoda",
    "expedia",
    "vrbo",
    "hotels_com",
  ];
  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px]">
      {visible.map((c) => (
        <span
          key={c}
          className={`inline-flex items-center gap-1.5 ${channelClass(c)} px-2 py-0.5 rounded-md`}
        >
          <span className="w-2 h-2 rounded-full bg-current opacity-70"></span>
          {CHANNEL_LABELS[c]}
        </span>
      ))}
    </div>
  );
}

function MonthRow({
  year,
  monthZeroBased,
  label,
  reservations,
}: {
  year: number;
  monthZeroBased: number;
  label: string;
  reservations: Awaited<ReturnType<typeof listChannelReservations>>;
}) {
  const daysInMonth = new Date(
    Date.UTC(year, monthZeroBased + 1, 0),
  ).getUTCDate();
  const monthStart = `${year}-${String(monthZeroBased + 1).padStart(2, "0")}-01`;
  const monthEnd = `${year}-${String(monthZeroBased + 1).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

  const overlapping = reservations.filter((r) => {
    return r.checkOut >= monthStart && r.checkIn <= monthEnd;
  });

  return (
    <div className="space-y-2" data-testid={`calendar-month-${year}-${monthZeroBased + 1}`}>
      <div className="text-sm font-medium">{label}</div>
      <div className="overflow-x-auto">
        <div className="min-w-[700px]">
          <div
            className="grid gap-px text-[10px] text-ink-tertiary"
            style={{ gridTemplateColumns: `repeat(${daysInMonth}, 1fr)` }}
          >
            {Array.from({ length: daysInMonth }, (_, i) => (
              <div key={i} className="text-center py-1 border-b border-line-soft">
                {i + 1}
              </div>
            ))}
          </div>
          <div className="space-y-1 mt-1">
            {overlapping.map((r) => (
              <ReservationBar
                key={r.id}
                reservation={r}
                year={year}
                monthZeroBased={monthZeroBased}
                daysInMonth={daysInMonth}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ReservationBar({
  reservation,
  year,
  monthZeroBased,
  daysInMonth,
}: {
  reservation: Awaited<ReturnType<typeof listChannelReservations>>[number];
  year: number;
  monthZeroBased: number;
  daysInMonth: number;
}) {
  const monthStart = new Date(Date.UTC(year, monthZeroBased, 1));
  const checkIn = new Date(reservation.checkIn);
  const checkOut = new Date(reservation.checkOut);
  const startDay = Math.max(
    1,
    Math.floor((checkIn.getTime() - monthStart.getTime()) / 86_400_000) + 1,
  );
  const endDay = Math.min(
    daysInMonth,
    Math.floor((checkOut.getTime() - monthStart.getTime()) / 86_400_000) + 1,
  );
  const startCol = Math.max(1, startDay);
  const endCol = Math.max(startCol, endDay);
  return (
    <Link
      href={`/development-os/channels/inbox/${reservation.id}`}
      className={`block text-[11px] px-2 py-1 rounded-md ${channelClass(reservation.channel)} ${reservation.conflictPending ? "ring-2 ring-warning" : ""}`}
      style={{
        gridColumnStart: startCol,
        gridColumnEnd: endCol + 1,
      }}
      data-testid={`calendar-bar-${reservation.id}`}
    >
      <div
        className="grid gap-px"
        style={{ gridTemplateColumns: `repeat(${daysInMonth}, 1fr)` }}
      >
        <div
          className="rounded-md px-1.5"
          style={{
            gridColumnStart: startCol,
            gridColumnEnd: endCol + 1,
          }}
        >
          <span className="font-medium">
            {reservation.guestFirstName} {reservation.guestLastName}
          </span>
          <span className="ml-2 opacity-70">
            {CHANNEL_LABELS[reservation.channel]}
          </span>
          {reservation.conflictPending && (
            <Badge tone="warning" className="ml-2">
              conflict
            </Badge>
          )}
        </div>
      </div>
    </Link>
  );
}

function channelClass(c: ChannelName): string {
  switch (c) {
    case "booking_com":
      return "bg-blue-100 text-blue-900";
    case "airbnb":
      return "bg-pink-100 text-pink-900";
    case "trip_com":
      return "bg-orange-100 text-orange-900";
    case "agoda":
      return "bg-purple-100 text-purple-900";
    case "expedia":
      return "bg-yellow-100 text-yellow-900";
    case "vrbo":
      return "bg-green-100 text-green-900";
    case "hotels_com":
      return "bg-rose-100 text-rose-900";
    case "direct":
      return "bg-stone-100 text-stone-900";
  }
}

function buildThreeMonths(today: Date): Array<{
  year: number;
  month: number;
  label: string;
  iso: string;
}> {
  const out: Array<{ year: number; month: number; label: string; iso: string }> = [];
  for (let i = 0; i < 3; i++) {
    const year = today.getUTCFullYear();
    let month = today.getUTCMonth() + i;
    let y = year;
    while (month > 11) {
      month -= 12;
      y += 1;
    }
    const date = new Date(Date.UTC(y, month, 1));
    out.push({
      year: y,
      month,
      iso: date.toISOString().slice(0, 7),
      label: date.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }),
    });
  }
  return out;
}
