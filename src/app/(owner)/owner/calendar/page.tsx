import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import {
  listOwnerCalendarRows,
} from "@/features/owner-intelligence/calendar-services";
import {
  classifyOwnerCalendarEvent,
  publicCalendarStatusLabel,
} from "@/features/owner-intelligence/calendar-pure";
import { listOwnerBookingSummariesForCurrentUser } from "@/features/owner-bookings/services";
import { publicStatusLabel } from "@/features/owner-bookings/calendar-pure";
import {
  OwnerCalendarGrid,
  type OwnerCalendarEvent as VisualCalendarEvent,
} from "@/components/owner/owner-calendar-grid";

export const metadata = { title: "My calendar" };
export const dynamic = "force-dynamic";

const BUCKET_TONES: Record<
  string,
  "neutral" | "info" | "warning" | "success" | "danger"
> = {
  guest_stay: "info",
  owner_stay: "success",
  maintenance: "warning",
  internal_hold: "neutral",
  out_of_order: "danger",
  operations: "neutral",
  review: "info",
};

const DIRECT_BOOKING_TONE = {
  confirmed: "accent" as const,
  in_house: "success" as const,
  completed: "success" as const,
  deposit_pending: "warning" as const,
  under_review: "info" as const,
  inquiry: "neutral" as const,
};

function visualKindFor(
  sourceType: string,
  publicStatus: string,
):
  | "direct_booking"
  | "ota"
  | "owner_stay"
  | "maintenance"
  | "internal_hold"
  | "pending_direct_booking" {
  if (sourceType === "direct_booking") {
    if (
      publicStatus === "deposit_pending" ||
      publicStatus === "under_review" ||
      publicStatus === "inquiry"
    )
      return "pending_direct_booking";
    return "direct_booking";
  }
  if (
    sourceType === "ota_airbnb" ||
    sourceType === "ota_booking_com" ||
    sourceType === "ota_vrbo"
  )
    return "ota";
  if (sourceType === "owner_stay") return "owner_stay";
  if (sourceType === "maintenance_block") return "maintenance";
  return "internal_hold";
}

function visualLabelFor(b: {
  villaCode: string | null;
  villaName: string | null;
  guestLabel: string | null;
  ownerLabel: string;
}): string {
  const villa = b.villaCode ?? b.villaName ?? "";
  const who = b.guestLabel ?? b.ownerLabel;
  return villa ? `${villa} · ${who}` : who;
}

function maskedInitials(label: string | null): string | null {
  if (!label) return null;
  const parts = label
    .split(/[\s·.]+/)
    .filter((p) => p.length > 0)
    .slice(0, 2);
  if (parts.length === 0) return null;
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
}

export default async function OwnerCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ horizon?: string }>;
}) {
  const sp = await searchParams;
  const horizonDays =
    sp.horizon === "30" || sp.horizon === "60" || sp.horizon === "90"
      ? Number(sp.horizon)
      : 60;
  const today = new Date();
  const fromIso = formatISODate(today);
  const toIso = formatISODate(
    new Date(today.getTime() + horizonDays * 24 * 60 * 60 * 1000),
  );
  const rows = await listOwnerCalendarRows({
    from: fromIso,
    to: toIso,
  });
  const directBookings = await listOwnerBookingSummariesForCurrentUser({
    from: fromIso,
    to: toIso,
    sourceType: "direct_booking",
  });
  // P116B — fetch every owner-visible booking (no source filter) for the
  // visual calendar grid above.
  const allOwnerBookings = await listOwnerBookingSummariesForCurrentUser({
    from: fromIso,
    to: toIso,
  });
  const visualEvents: VisualCalendarEvent[] = allOwnerBookings.map((b) => ({
    id: b.id,
    kind: visualKindFor(b.sourceType, b.publicStatus),
    startDate: b.checkIn,
    endDate: b.checkOut,
    label: visualLabelFor(b),
    sublabel: b.channelLabel ?? null,
    initials: maskedInitials(b.guestLabel),
  }));
  const monthDate = new Date(today);
  const prevDate = new Date(monthDate);
  prevDate.setUTCMonth(prevDate.getUTCMonth() - 1);
  const nextDate = new Date(monthDate);
  nextDate.setUTCMonth(nextDate.getUTCMonth() + 1);
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[{ label: "Calendar" }]}
        title="My villa calendar"
        description="Owner-safe view of bookings, owner stays, maintenance, internal holds, and out-of-order windows. Guest names are masked; emails, phones, and access codes never appear here."
        actions={
          <div className="flex items-center gap-2">
            {[30, 60, 90].map((d) => (
              <Link
                key={d}
                href={`/owner/calendar?horizon=${d}`}
                className={`h-8 px-3 inline-flex items-center rounded-full text-xs ${
                  horizonDays === d
                    ? "bg-ink text-ink-inverse"
                    : "border border-line-soft text-ink-secondary hover:border-line-strong"
                }`}
              >
                {d} days
              </Link>
            ))}
          </div>
        }
      />
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink-tertiary">
          <span className="text-label">Legend:</span>
          <Badge tone="accent">Direct booking</Badge>
          <Badge tone="info">OTA stay</Badge>
          <Badge tone="success">Owner stay</Badge>
          <Badge tone="warning">Maintenance</Badge>
          <Badge tone="neutral">Internal hold</Badge>
        </div>
        <p className="text-[11px] text-ink-tertiary leading-relaxed max-w-3xl">
          <span className="text-ink-secondary">Direct booking</span> = booked
          via Arconique (no OTA commission).{" "}
          <span className="text-ink-secondary">OTA stay</span> = booked via
          Booking.com / Airbnb / similar.{" "}
          <span className="text-ink-secondary">Owner stay</span> = you or
          someone you authorised. Pending direct bookings show as{" "}
          <span className="text-ink-secondary">Pending</span> until the
          deposit clears.
        </p>
      </div>
      <Section
        eyebrow="Calendar"
        title="Month view"
        description="Visual grid of every booking, owner stay, maintenance window, and internal hold across your villas."
        action={
          <span className="text-[11px] text-ink-tertiary">
            {allOwnerBookings.length} event{allOwnerBookings.length === 1 ? "" : "s"}
          </span>
        }
      >
        <OwnerCalendarGrid
          monthDate={monthDate}
          prevHref={`/owner/calendar?horizon=${horizonDays}`}
          nextHref={`/owner/calendar?horizon=${horizonDays}`}
          events={visualEvents}
        />
      </Section>

      {directBookings.length > 0 && (
        <Section
          eyebrow="Direct bookings"
          title="Direct bookings affecting your villas"
          description="Pending direct-booking holds that block dates show as Pending; expired and cancelled requests are not shown."
        >
          <div className="rounded-md border border-line-soft bg-surface overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-canvas/50 text-left">
                <tr className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                  <th className="px-4 py-3">Villa</th>
                  <th className="px-4 py-3">Dates</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Guest</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {directBookings.map((s) => (
                  <tr key={s.id} className="border-t border-line-soft">
                    <td className="px-4 py-3 text-xs">
                      {s.villaName ?? s.villaCode ?? "—"}
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums text-xs">
                      {s.checkIn} → {s.checkOut}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        tone={
                          DIRECT_BOOKING_TONE[
                            s.publicStatus as keyof typeof DIRECT_BOOKING_TONE
                          ] ?? "neutral"
                        }
                      >
                        {publicStatusLabel(s.publicStatus)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {s.guestLabel ?? "—"}
                      {s.guestCountry && (
                        <span className="text-[11px] text-ink-tertiary ml-2">
                          · {s.guestCountry}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/owner/bookings/${s.id}`}
                        className="text-xs text-ink hover:underline underline-offset-4"
                      >
                        Open →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-8 text-sm text-ink-tertiary">
          You don&apos;t have any villas linked to your account yet. Talk to
          your property manager if you think this is wrong.
        </p>
      ) : (
        rows.map((row) => (
          <Section
            key={row.villa.villaId}
            eyebrow={row.villa.projectName ?? "Villa"}
            title={row.villa.villaName ?? row.villa.villaCode ?? "Your villa"}
            description={`${row.events.length} event${row.events.length === 1 ? "" : "s"} in this window.`}
            action={
              <Link
                href={`/owner/villas/${row.villa.villaId}/calendar`}
                className="text-xs text-ink hover:underline underline-offset-4"
              >
                Open villa calendar →
              </Link>
            }
          >
            {row.events.length === 0 ? (
              <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
                Nothing scheduled in this window.
              </p>
            ) : (
              <div className="rounded-md border border-line-soft bg-surface overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-canvas/50 text-left">
                    <tr className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                      <th className="px-4 py-3">Dates</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Guest</th>
                      <th className="px-4 py-3">Channel</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {row.events.map((event) => (
                      <tr
                        key={event.id}
                        className="border-t border-line-soft"
                      >
                        <td className="px-4 py-3 font-mono tabular-nums text-xs">
                          {event.startDate}
                          {event.endDate !== event.startDate
                            ? ` → ${event.endDate}`
                            : ""}
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            tone={
                              BUCKET_TONES[
                                classifyOwnerCalendarEvent(event.source)
                              ] ?? "neutral"
                            }
                          >
                            {publicCalendarStatusLabel(event)}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {event.guestDisplayName ?? "—"}
                          {event.guestCount && (
                            <span className="text-[11px] text-ink-tertiary ml-2">
                              · {event.guestCount} pax
                            </span>
                          )}
                          {event.guestCountry && (
                            <span className="text-[11px] text-ink-tertiary ml-2">
                              · {event.guestCountry}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-ink-tertiary">
                          {event.channelLabel ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-ink-tertiary capitalize">
                          {event.status.replace("_", " ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        ))
      )}
    </div>
  );
}

function formatISODate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
