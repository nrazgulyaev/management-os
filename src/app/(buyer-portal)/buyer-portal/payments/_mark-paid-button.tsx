"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { markBuyerInstallmentPaid } from "@/lib/buyer-portal/payment-actions";

/**
 * Manual "mark paid" control for a buyer installment milestone. There is no
 * real payment-service-provider yet (Indonesia rails deferred to launch) — the
 * buyer confirms an off-platform payment and the operator reconciles. The
 * server action re-validates ownership before writing. Full remaining balance
 * only; no partials from the buyer side.
 */
export function MarkPaidButton({ milestoneId }: { milestoneId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function submit() {
    setError(null);
    start(async () => {
      const res = await markBuyerInstallmentPaid({ milestoneId });
      if (!res.ok) {
        setError(res.error ?? "Failed to record payment.");
        return;
      }
      setConfirming(false);
      router.refresh();
    });
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-xs px-3 py-1.5 rounded border border-stone-400 bg-white text-stone-800 hover:bg-stone-100"
      >
        Mark as paid
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-stone-600">Confirm payment made?</span>
      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="text-xs px-3 py-1.5 rounded border border-stone-700 bg-stone-800 text-white hover:bg-stone-900 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Yes, mark paid"}
      </button>
      <button
        type="button"
        onClick={() => {
          setConfirming(false);
          setError(null);
        }}
        disabled={pending}
        className="text-xs px-3 py-1.5 rounded border border-stone-300 bg-white text-stone-600 hover:bg-stone-100 disabled:opacity-50"
      >
        Cancel
      </button>
      {error && (
        <span className="text-xs text-red-700 w-full">{error}</span>
      )}
    </div>
  );
}
