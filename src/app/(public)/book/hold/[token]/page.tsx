import { notFound, redirect } from "next/navigation";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { GuestShell } from "@/components/layout/guest-shell";
import { handleGetHold } from "@/features/direct-booking/public-api";
import { CheckoutForm } from "@/components/book/checkout-form";

export const metadata = { title: "Confirm your stay" };
export const dynamic = "force-dynamic";

export default async function BookingHoldPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const out = await handleGetHold(token);
  if (out.status !== 200) notFound();
  const view = out.body as Extract<typeof out.body, { holdCode: string }>;
  if (view.status === "expired") {
    return <Redirect token={token} target="expired" />;
  }
  if (view.status === "cancelled") {
    return <Redirect token={token} target="cancelled" />;
  }
  // A hold that has already been converted to a booking (or rejected) is
  // terminal: the checkout form below would let the guest re-submit and
  // then fail with a confusing `hold_<status>` error. Send them to the
  // status page, which renders the correct stage (booking confirmed /
  // not confirmed) for these states.
  if (view.status === "converted" || view.status === "rejected") {
    redirect(`/book/hold/${token}/status`);
  }
  return (
    <GuestShell villaName={view.villa.label} dates={`${view.checkIn} → ${view.checkOut}`}>
      <div className="flex flex-col gap-8">
        <header className="flex flex-col gap-2">
          <span className="text-[11px] uppercase tracking-widest text-ink-tertiary">
            Direct booking
          </span>
          <h1 className="text-display text-2xl md:text-3xl font-medium text-ink">
            Confirm your stay at {view.villa.label}
          </h1>
          <Badge tone="info">{view.statusLabel}</Badge>
        </header>
        <Section eyebrow="Summary" title="Your reservation">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Pair label="Check-in" value={view.checkIn} />
            <Pair label="Check-out" value={view.checkOut} />
            <Pair label="Nights" value={String(view.nights)} />
            <Pair label="Guests" value={String(view.guestCount)} />
            <Pair
              label="Total"
              value={`${formatMoney(view.totalMinor)} ${view.currency}`}
              mono
            />
            <Pair
              label="Avg / night"
              value={`${formatMoney(view.averageNightlyMinor)} ${view.currency}`}
              mono
            />
          </dl>
          <p className="mt-3 text-xs text-ink-tertiary">
            This is a request for booking — your hold expires at{" "}
            {new Date(view.expiresAt).toUTCString()}. Our concierge will
            confirm availability before any commitment is made. No payment is
            collected here.
          </p>
        </Section>
        <Section eyebrow="Your details" title="Contact">
          <CheckoutForm
            token={token}
            holdCode={view.holdCode}
            defaultGuestCount={view.guestCount}
          />
        </Section>
      </div>
    </GuestShell>
  );
}

function Redirect({ token, target }: { token: string; target: string }) {
  return (
    <GuestShell villaName="Booking">
      <div className="flex flex-col gap-4">
        <h1 className="text-display text-2xl text-ink">
          {target === "expired" ? "This hold has expired" : "Hold cancelled"}
        </h1>
        <p className="text-sm text-ink-secondary">
          Please run a new search and start a fresh quote.
        </p>
        <a
          href={`/book/hold/${token}/${target}`}
          className="text-xs text-ink underline underline-offset-4"
        >
          Open status page →
        </a>
      </div>
    </GuestShell>
  );
}

function Pair({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md border border-line-soft bg-surface p-4">
      <dt className="text-[10px] uppercase tracking-widest text-ink-tertiary">{label}</dt>
      <dd className={`mt-1 text-ink ${mono ? "font-mono text-xs" : "text-sm"}`}>{value}</dd>
    </div>
  );
}

function formatMoney(minor: string): string {
  const big = BigInt(minor);
  const major = big / 100n;
  const rest = big % 100n;
  const sign = big < 0n ? "-" : "";
  const absMajor = big < 0n ? -major : major;
  const absRest = big < 0n ? -rest : rest;
  return `${sign}${absMajor.toString()}.${String(absRest).padStart(2, "0")}`;
}
