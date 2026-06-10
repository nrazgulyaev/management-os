/**
 * Platform Billing — "Payments not connected" band.
 *
 * The founder's constraint, stated on-page: no PSP exists yet (Xendit
 * for Indonesia / Stripe for international are deferred to platform
 * launch), so there are NO real invoices, payments, refunds or dunning
 * runs to show. Instead of dead buttons or empty fake ledgers, this
 * band names exactly which billing surfaces unlock when the PSP
 * integration lands. Server component, zero interactivity on purpose.
 */

import { CreditCard } from "lucide-react";

const LOCKED_CAPABILITIES: Array<{ label: string; detail: string }> = [
  {
    label: "Invoice ledger",
    detail: "Per-org invoices with status, amounts and PSP references",
  },
  {
    label: "Failed-payments triage",
    detail: "Decline reasons, retry history and at-risk MRR queue",
  },
  {
    label: "Refunds & credits",
    detail: "Operator-issued refunds with a full audit trail",
  },
  {
    label: "Dunning",
    detail: "Automated retry / reminder sequences on payment failure",
  },
];

export function PaymentsNotConnectedBand() {
  return (
    <section
      aria-label="Payments not connected"
      className="rounded-3xl border border-dashed border-line-soft bg-muted/30 p-6 md:p-7 flex flex-col gap-4"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line-soft bg-surface">
          <CreditCard className="h-4 w-4 text-ink-tertiary" strokeWidth={1.75} />
        </span>
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold text-ink">
            Payments not connected
          </h2>
          <p className="text-xs text-ink-secondary leading-relaxed max-w-[72ch]">
            No payment provider is integrated yet — Xendit (QRIS, e-wallets,
            virtual accounts) for Indonesia and Stripe for international are
            scheduled for platform launch. Until then this console tracks
            subscription billing only: plan assignments, comp grants and MRR
            derived from the plan catalog. Nothing on this page represents
            money actually collected.
          </p>
        </div>
      </div>

      <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {LOCKED_CAPABILITIES.map((cap) => (
          <li
            key={cap.label}
            className="rounded-2xl border border-line-soft bg-surface px-4 py-3 flex flex-col gap-1"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-medium text-ink">
                {cap.label}
              </span>
              <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-tertiary border border-line-soft rounded-full px-2 py-0.5">
                at launch
              </span>
            </div>
            <span className="text-xs text-ink-tertiary leading-relaxed">
              {cap.detail}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
