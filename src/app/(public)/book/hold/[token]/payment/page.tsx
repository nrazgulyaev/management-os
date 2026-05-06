import { notFound } from "next/navigation";
import { GuestShell } from "@/components/layout/guest-shell";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import {
  handleGetDepositForHold,
  handleGetHold,
} from "@/features/direct-booking/public-api";
import { NotifyPaidButton } from "@/components/book/notify-paid-button";

export const metadata = { title: "Deposit · request confirmation" };
export const dynamic = "force-dynamic";

export default async function HoldPaymentPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const holdOut = await handleGetHold(token);
  if (holdOut.status !== 200) notFound();
  const hold = holdOut.body as Extract<typeof holdOut.body, { holdCode: string }>;
  const depositOut = await handleGetDepositForHold(token);
  if (depositOut.status !== 200) notFound();
  const deposit = depositOut.body as Extract<
    typeof depositOut.body,
    { depositCode: string }
  >;
  const isPayable = ["pending", "draft", "requires_action"].includes(
    deposit.status,
  );
  return (
    <GuestShell
      villaName={hold.villa.label}
      dates={`${hold.checkIn} → ${hold.checkOut}`}
    >
      <div className="flex flex-col gap-8">
        <header className="flex flex-col gap-2">
          <span className="text-[11px] uppercase tracking-widest text-ink-tertiary">
            Deposit · request confirmation
          </span>
          <h1 className="text-display text-2xl md:text-3xl font-medium text-ink">
            Reserve your stay at {hold.villa.label}
          </h1>
          <Badge tone="info">{deposit.statusLabel}</Badge>
        </header>
        <Section eyebrow="Deposit" title="Amount">
          <div className="rounded-md border border-line-soft bg-surface p-5 flex flex-col gap-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-ink-tertiary">Hold</span>
              <span className="font-mono text-xs">{hold.holdCode}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-tertiary">Deposit</span>
              <span className="font-mono text-xs">{deposit.depositCode}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-tertiary">Amount</span>
              <span className="font-mono text-sm text-ink">
                {formatMoney(deposit.amountMinor)} {deposit.currency}
              </span>
            </div>
          </div>
          <p className="mt-3 text-xs text-ink-tertiary">{deposit.message}</p>
          <p className="mt-2 text-xs text-ink-tertiary">
            This is a demo / manual flow — no card details are collected on
            this page. Our concierge will share secure payment instructions
            (bank transfer or our payment partner) and verify your deposit
            before issuing the confirmed booking.
          </p>
        </Section>
        {isPayable && (
          <Section eyebrow="Action" title="Already sent the payment?">
            <p className="text-sm text-ink-secondary">
              Tap the button below to let our team know — they'll verify and
              issue the confirmed booking.
            </p>
            <div className="mt-3">
              <NotifyPaidButton token={token} />
            </div>
          </Section>
        )}
      </div>
    </GuestShell>
  );
}

function formatMoney(minor: string): string {
  const big = BigInt(minor);
  const major = big / 100n;
  const rest = big % 100n;
  return `${major}.${String(rest).padStart(2, "0")}`;
}
