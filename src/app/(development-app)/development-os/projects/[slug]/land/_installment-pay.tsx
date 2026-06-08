"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { recordLandInstallmentPaymentAction } from "./_installment-pay-action";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Record-payment control for a land acquisition installment. Wires the
 * orphaned markLandInstallmentPaid action: full or partial, dated. Hidden
 * once the installment is paid/cancelled.
 */
export function InstallmentPay({
  installmentId,
  slug,
  amountMinor,
  currency,
  status,
}: {
  installmentId: string;
  slug: string;
  /** remaining/total amount in MINOR units, as a string */
  amountMinor: string;
  currency: string;
  status: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const fullMajor = (Number(amountMinor) / 100).toString();
  const [amount, setAmount] = React.useState(fullMajor);
  const [paidDate, setPaidDate] = React.useState(todayIso());

  if (status === "paid" || status === "cancelled") {
    return <span className="text-ink-tertiary text-xs">—</span>;
  }

  function submit() {
    const major = Number(amount);
    if (!Number.isFinite(major) || major <= 0) {
      setError("Enter a positive amount.");
      return;
    }
    setError(null);
    const minor = BigInt(Math.round(major * 100)).toString();
    start(async () => {
      const res = await recordLandInstallmentPaymentAction({
        installmentId,
        slug,
        paidDate,
        paidAmountMinor: minor,
      });
      if (!res.ok) {
        setError(res.error ?? "Failed.");
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[11px] px-2 py-0.5 rounded border border-line-soft bg-surface hover:bg-muted/50"
      >
        Record payment
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <input
        type="number"
        min={0}
        step="0.01"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="w-24 text-xs px-1.5 py-0.5 rounded border border-line-soft bg-surface font-mono text-right"
        aria-label="Amount"
      />
      <span className="text-[10px] text-ink-tertiary font-mono">{currency}</span>
      <input
        type="date"
        value={paidDate}
        onChange={(e) => setPaidDate(e.target.value)}
        className="text-[11px] px-1.5 py-0.5 rounded border border-line-soft bg-surface"
        aria-label="Paid date"
      />
      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="text-[11px] px-2 py-0.5 rounded border border-ink/30 bg-surface hover:bg-muted/50 disabled:opacity-50"
      >
        {pending ? "…" : "Confirm"}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        disabled={pending}
        className="text-[11px] px-2 py-0.5 rounded border border-line-soft bg-surface hover:bg-muted/40"
      >
        Cancel
      </button>
      {error && <span className="text-[10px] text-danger w-full">{error}</span>}
    </div>
  );
}
