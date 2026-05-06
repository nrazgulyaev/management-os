import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { GuestShell } from "@/components/layout/guest-shell";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { getGuestStaySummaryByToken } from "@/features/guest-stays/services";
import { getGuestServiceFulfilmentById } from "@/features/service-fulfilment/services";
import {
  guestFacingFulfilmentStatus,
  canGuestRate,
  type FulfilmentStatus,
} from "@/features/service-fulfilment/status-pure";
import {
  GuestConfirmFulfilmentButton,
  GuestServiceRatingForm,
} from "@/components/stay/rating-form";

export const metadata = { title: "Service request" };
export const dynamic = "force-dynamic";

export default async function GuestServiceOrderDetailPage({
  params,
}: {
  params: Promise<{ token: string; id: string }>;
}) {
  const { token, id } = await params;
  const stayResult = await getGuestStaySummaryByToken(token);
  if (!stayResult.ok) notFound();
  const stay = stayResult.summary.base;
  const detail = await getGuestServiceFulfilmentById(id);
  if (!detail) notFound();
  // Token gate: the stay token on the order must match the stay token
  // we resolved from the URL.
  if (detail.order?.guestStayTokenId !== stay.tokenId) notFound();

  const f = detail.fulfilment;
  const guest = guestFacingFulfilmentStatus(f.status as FulfilmentStatus);
  const villaLabel = stay.villaName ?? stay.villaCode ?? "Your villa";
  const myRating = detail.ratings.find(
    (r) => r.stayTokenId === stay.tokenId,
  );

  return (
    <GuestShell
      villaName={villaLabel}
      dates={`${stay.checkIn} → ${stay.checkOut}`}
    >
      <div className="flex flex-col gap-8">
        <Link
          href={`/stay/${token}/services/orders`}
          className="inline-flex items-center gap-1.5 text-xs text-ink-tertiary hover:text-ink"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Your requests
        </Link>
        <header className="flex flex-col gap-2">
          <span className="text-[11px] uppercase tracking-widest text-ink-tertiary">
            Service request
          </span>
          <h1 className="text-display text-2xl md:text-3xl font-medium text-ink">
            {detail.service?.name ?? "Service"}
          </h1>
          <Badge tone={guest.tone}>{guest.label}</Badge>
        </header>

        <Section eyebrow="Details" title="What you asked for">
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <Pair
              label="Selected option"
              value={detail.selectedOptionLabel ?? "—"}
            />
            <Pair
              label="Quantity"
              value={
                detail.order?.quantity != null
                  ? String(detail.order.quantity)
                  : "—"
              }
            />
            <Pair
              label="Date"
              value={detail.order?.requestedDate ?? "—"}
            />
            <Pair
              label="Time"
              value={detail.order?.requestedTime ?? "—"}
            />
            {f.scheduledFor && (
              <Pair
                label="Scheduled (UTC)"
                value={f.scheduledFor.toISOString().slice(0, 16).replace("T", " ")}
              />
            )}
            {f.etaAt && (
              <Pair
                label="ETA (UTC)"
                value={f.etaAt.toISOString().slice(0, 16).replace("T", " ")}
              />
            )}
          </dl>
          {f.status === "triage" || f.status === "awaiting_vendor" || f.status === "new" ? (
            <p className="mt-4 text-xs text-ink-tertiary">
              Request received. Our concierge will confirm availability before
              it is scheduled.
            </p>
          ) : null}
        </Section>

        {f.requiresGuestConfirmation && !f.guestConfirmedAt && (
          <Section eyebrow="Action needed" title="Confirm the timing">
            <p className="text-sm text-ink-secondary mb-3">
              Tap to confirm the proposed schedule.
            </p>
            <GuestConfirmFulfilmentButton
              fulfilmentId={f.id}
              stayTokenId={stay.tokenId}
            />
          </Section>
        )}

        {canGuestRate(f.status as FulfilmentStatus) && (
          <Section
            eyebrow="Rating"
            title={myRating ? "Thanks for your feedback" : "Rate this service"}
          >
            {myRating ? (
              <div className="rounded-md border border-line-soft bg-surface p-4">
                <div className="text-2xl text-ink">
                  {"★".repeat(myRating.rating)}
                  {"☆".repeat(5 - myRating.rating)}
                </div>
                {myRating.comment && (
                  <p className="mt-2 text-xs text-ink-tertiary">
                    {myRating.comment}
                  </p>
                )}
              </div>
            ) : (
              <GuestServiceRatingForm
                fulfilmentId={f.id}
                stayTokenId={stay.tokenId}
              />
            )}
          </Section>
        )}
      </div>
    </GuestShell>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line-soft bg-surface p-4">
      <dt className="text-[10px] uppercase tracking-widest text-ink-tertiary">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-ink">{value}</dd>
    </div>
  );
}
