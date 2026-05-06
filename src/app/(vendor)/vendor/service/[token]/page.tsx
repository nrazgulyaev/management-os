import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/ui/section";
import { getDb } from "@/lib/db/client";
import {
  guestServiceOrders,
  guestServices,
  guestServiceOptions,
} from "@/lib/db/schema/guest-services";
import { villas } from "@/lib/db/schema/projects";
import { bookings, guests } from "@/lib/db/schema/bookings";
import { serviceVendors } from "@/lib/db/schema/service-fulfilment";
import { getFulfilmentByVendorToken } from "@/features/service-fulfilment/services";
import { buildVendorSafeFulfilmentView } from "@/features/service-fulfilment/vendor-safe-projection";
import {
  VendorAcceptButton,
  VendorDeclineButton,
  VendorEtaForm,
  VendorMarkCompletedButton,
  VendorMarkInProgressButton,
} from "@/components/vendor/portal-actions";

export const metadata = { title: "Vendor portal" };
export const dynamic = "force-dynamic";

export default async function VendorPortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const ctx = await getFulfilmentByVendorToken(token);
  if (!ctx) notFound();
  const db = getDb();
  if (!db) notFound();

  // Hydrate the order, service, villa, and guest first-name only.
  const [pair] = await db
    .select({
      order: guestServiceOrders,
      service: guestServices,
      option: guestServiceOptions,
      villa: villas,
      booking: bookings,
      guestFullName: guests.fullName,
      guestPhone: guests.phone,
    })
    .from(guestServiceOrders)
    .leftJoin(
      guestServices,
      eq(guestServices.id, guestServiceOrders.serviceId),
    )
    .leftJoin(
      guestServiceOptions,
      eq(guestServiceOptions.id, guestServiceOrders.selectedOptionId),
    )
    .leftJoin(villas, eq(villas.id, guestServiceOrders.villaId))
    .leftJoin(bookings, eq(bookings.id, guestServiceOrders.bookingId))
    .leftJoin(guests, eq(guests.id, bookings.guestId))
    .where(eq(guestServiceOrders.id, ctx.fulfilment.orderId))
    .limit(1);
  if (!pair) notFound();
  const vendor = ctx.fulfilment.vendorId
    ? (
        await db
          .select()
          .from(serviceVendors)
          .where(eq(serviceVendors.id, ctx.fulfilment.vendorId))
          .limit(1)
      )[0] ?? null
    : null;

  const view = buildVendorSafeFulfilmentView({
    fulfilment: {
      id: ctx.fulfilment.id,
      fulfilmentCode: ctx.fulfilment.fulfilmentCode,
      status: ctx.fulfilment.status as Parameters<
        typeof buildVendorSafeFulfilmentView
      >[0]["fulfilment"]["status"],
      fulfilmentType: ctx.fulfilment.fulfilmentType as
        | "internal"
        | "vendor"
        | "hybrid",
      scheduledFor: ctx.fulfilment.scheduledFor,
      etaAt: ctx.fulfilment.etaAt,
      startedAt: ctx.fulfilment.startedAt,
      completedAt: ctx.fulfilment.completedAt,
      requiresGuestConfirmation: ctx.fulfilment.requiresGuestConfirmation,
      guestConfirmedAt: ctx.fulfilment.guestConfirmedAt,
      vendorReference: ctx.fulfilment.vendorReference,
      vendorNotes: ctx.fulfilment.vendorNotes,
    },
    order: {
      quantity: pair.order.quantity ?? null,
      selectedOptionLabel: pair.option?.label ?? null,
      requestedDate: pair.order.requestedDate ?? null,
      requestedTime: pair.order.requestedTime ?? null,
      guestNote: pair.order.guestNote ?? null,
    },
    service: {
      name: pair.service?.name ?? "Service",
      serviceType: pair.service?.serviceType ?? null,
    },
    villa: {
      label: pair.villa?.unitCode ?? null,
      serviceArea: vendor?.serviceArea ?? null,
    },
    guest: {
      fullName: pair.guestFullName ?? null,
      phone: pair.guestPhone ?? null,
      // We default `allowGuestContact` to false. To opt in for a
      // specific fulfilment, an admin would flip the flag in the
      // notes / payload — kept off here to keep the demo strict.
      allowGuestContact: false,
    },
  });

  const showActions = !ctx.fulfilment.completedAt;

  return (
    <div className="min-h-screen bg-canvas px-4 py-10 md:py-16">
      <div className="max-w-2xl mx-auto flex flex-col gap-8">
        <header className="flex flex-col gap-2">
          <span className="text-[11px] uppercase tracking-widest text-ink-tertiary">
            Vendor request
          </span>
          <h1 className="text-display text-2xl md:text-3xl font-medium text-ink">
            {view.service.name}
          </h1>
          <div className="font-mono text-xs text-ink-tertiary">
            {view.fulfilmentCode}
          </div>
          <Badge tone="neutral">{view.status.label}</Badge>
        </header>

        <div className="rounded-md border border-line-soft bg-surface px-5 py-3 text-[11px] text-ink-secondary leading-relaxed">
          <span className="font-medium text-ink">Privacy:</span> guest
          contact details are hidden unless an operator explicitly shared
          them with you. Use{" "}
          <span className="text-ink">Accept</span> /{" "}
          <span className="text-ink">Decline</span> to acknowledge the
          request, then update the ETA. Invoice metadata is captured for
          records only — payouts are settled separately.
        </div>

        <Section eyebrow="Schedule" title="When">
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <Pair label="Date" value={view.schedule.requestedDate ?? "—"} />
            <Pair label="Time" value={view.schedule.requestedTime ?? "—"} />
            <Pair
              label="Scheduled (UTC)"
              value={view.schedule.scheduledFor ?? "—"}
              mono
            />
            <Pair label="ETA (UTC)" value={view.schedule.etaAt ?? "—"} mono />
          </dl>
        </Section>

        <Section eyebrow="Where" title={view.villa.label ?? "Villa"}>
          <p className="text-sm text-ink-secondary">
            Area: {view.villa.area ?? "—"}
          </p>
        </Section>

        <Section
          eyebrow="Guest"
          title={`${view.guest.label}${view.guest.quantity ? ` · ${view.guest.quantity} pax` : ""}`}
        >
          {view.guest.note && (
            <p className="text-sm text-ink-secondary">{view.guest.note}</p>
          )}
          {view.guest.phone && (
            <p className="mt-2 text-xs text-ink-tertiary">
              Guest phone: {view.guest.phone}
            </p>
          )}
          {!view.guest.phone && (
            <p className="mt-2 text-xs text-ink-tertiary">
              Guest contact is not shared by default — message the concierge if
              you need it.
            </p>
          )}
        </Section>

        {showActions && (
          <Section eyebrow="Actions" title="Update this request">
            <div className="flex flex-col gap-3">
              {view.status.awaitingVendor && (
                <div className="flex flex-wrap items-center gap-3">
                  <VendorAcceptButton token={token} />
                  <VendorDeclineButton token={token} />
                </div>
              )}
              <VendorEtaForm token={token} />
              <div className="flex items-center gap-3">
                <VendorMarkInProgressButton token={token} />
                <VendorMarkCompletedButton token={token} />
              </div>
            </div>
          </Section>
        )}
        <p className="text-xs text-ink-tertiary">
          This page is a one-off vendor view. It does not show owner finance,
          margin, internal notes, or unrelated bookings.
        </p>
      </div>
    </div>
  );
}

function Pair({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-md border border-line-soft bg-surface p-4">
      <dt className="text-[10px] uppercase tracking-widest text-ink-tertiary">
        {label}
      </dt>
      <dd className={`mt-1 text-ink ${mono ? "font-mono text-xs" : "text-sm"}`}>
        {value}
      </dd>
    </div>
  );
}
