import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import {
  getOwnerVillaCalendar,
  listOwnerVillasForCurrentUser,
} from "@/features/owner-intelligence/calendar-services";
import {
  classifyOwnerCalendarEvent,
  publicCalendarStatusLabel,
} from "@/features/owner-intelligence/calendar-pure";
import { listOwnerBookingSummariesForOwner } from "@/features/owner-bookings/services";
import { publicStatusLabel } from "@/features/owner-bookings/calendar-pure";
import {
  OwnerCalendarGrid,
  type OwnerCalendarEvent as VisualCalendarEvent,
} from "@/components/owner/owner-calendar-grid";

export const metadata = { title: "Villa calendar" };
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

export default async function OwnerVillaCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const villas = await listOwnerVillasForCurrentUser();
  const villa = villas.find((v) => v.villaId === id);
  if (!villa) notFound();
  const today = new Date();
  const from =
    (sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) && sp.from) ||
    formatISODate(today);
  const to =
    (sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) && sp.to) ||
    formatISODate(
      new Date(today.getTime() + 60 * 24 * 60 * 60 * 1000),
    );
  const events = await getOwnerVillaCalendar(id, from, to);
  const directBookings = await listOwnerBookingSummariesForOwner(
    villa.ownerId,
    {
      villaId: id,
      sourceType: "direct_booking",
      from,
      to,
    },
  );
  const allOwnerBookings = await listOwnerBookingSummariesForOwner(
    villa.ownerId,
    { villaId: id, from, to },
  );
  const visualEvents: VisualCalendarEvent[] = allOwnerBookings.map((b) => {
    const kind = visualKindFor(b.sourceType, b.publicStatus);
    return {
      id: b.id,
      kind,
      startDate: b.checkIn,
      endDate: b.checkOut,
      label: visualLabelFor(b),
      sublabel: b.channelLabel ?? null,
      initials: maskedInitials(b.guestLabel),
    };
  });
  const monthDate = new Date(today);
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "My villas", href: "/owner/villas" },
          {
            label: villa.villaName ?? villa.villaCode ?? id,
            href: `/owner/villas`,
          },
          { label: "Calendar" },
        ]}
        title={`${villa.villaName ?? villa.villaCode ?? "Villa"} calendar`}
        description={`${villa.projectName ?? ""} · ${from} → ${to}`}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href={`/owner/villas/${id}/health`}
              className="h-9 px-4 rounded-full border border-line-soft text-xs text-ink-secondary hover:border-line-strong"
            >
              Health report
            </Link>
            <Link
              href={`/owner/villas/${id}/timeline`}
              className="h-9 px-4 rounded-full border border-line-soft text-xs text-ink-secondary hover:border-line-strong"
            >
              Timeline
            </Link>
          </div>
        }
      />
      <Section
        eyebrow="Calendar"
        title="Month view"
        description="Visual grid of every booking, owner stay, maintenance window, and internal hold for this villa."
        action={
          <span className="text-[11px] text-ink-tertiary">
            {allOwnerBookings.length} event{allOwnerBookings.length === 1 ? "" : "s"}
          </span>
        }
      >
        <OwnerCalendarGrid
          monthDate={monthDate}
          prevHref={`/owner/villas/${id}/calendar`}
          nextHref={`/owner/villas/${id}/calendar`}
          events={visualEvents}
          villaLabel={villa.villaName ?? villa.villaCode ?? null}
        />
      </Section>

      <Link
        href="/owner/calendar"
        className="inline-flex items-center gap-1.5 text-xs text-ink-tertiary hover:text-ink"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> All villas
      </Link>
      {directBookings.length > 0 && (
        <Section
          eyebrow="Direct bookings"
          title={`${directBookings.length} direct booking${directBookings.length === 1 ? "" : "s"}`}
        >
          <ul className="rounded-md border border-line-soft bg-surface divide-y divide-line-soft">
            {directBookings.map((s) => (
              <li
                key={s.id}
                className="px-4 py-3 flex items-start justify-between gap-4"
              >
                <div>
                  <div className="font-mono text-xs text-ink-tertiary">
                    {s.checkIn} → {s.checkOut}
                  </div>
                  <div className="text-sm text-ink font-medium">
                    {s.ownerLabel}
                  </div>
                  <div className="text-[11px] text-ink-tertiary">
                    {s.guestLabel ?? "Guest"} ·{" "}
                    {s.guestCount ? `${s.guestCount} pax` : "—"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone="accent">{publicStatusLabel(s.publicStatus)}</Badge>
                  <Link
                    href={`/owner/bookings/${s.id}`}
                    className="text-xs text-ink hover:underline underline-offset-4"
                  >
                    Open →
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}
      <Section eyebrow="Schedule" title={`${events.length} events`}>
        {events.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            Nothing scheduled in this range.
          </p>
        ) : (
          <ul className="rounded-md border border-line-soft bg-surface divide-y divide-line-soft">
            {events.map((event) => (
              <li
                key={event.id}
                className="px-4 py-3 flex items-start justify-between gap-4"
              >
                <div className="flex flex-col gap-1">
                  <span className="font-mono text-xs text-ink-tertiary">
                    {event.startDate}
                    {event.endDate !== event.startDate
                      ? ` → ${event.endDate}`
                      : ""}
                  </span>
                  <span className="text-sm text-ink font-medium">
                    {event.title}
                  </span>
                  <div className="flex items-center gap-2 text-[11px] text-ink-tertiary">
                    {event.guestDisplayName && (
                      <span>Guest: {event.guestDisplayName}</span>
                    )}
                    {event.guestCount !== null && (
                      <span>· {event.guestCount} pax</span>
                    )}
                    {event.guestCountry && (
                      <span>· {event.guestCountry}</span>
                    )}
                    {event.channelLabel && (
                      <span>· via {event.channelLabel}</span>
                    )}
                  </div>
                </div>
                <Badge
                  tone={
                    BUCKET_TONES[
                      classifyOwnerCalendarEvent(event.source)
                    ] ?? "neutral"
                  }
                >
                  {publicCalendarStatusLabel(event)}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function formatISODate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
