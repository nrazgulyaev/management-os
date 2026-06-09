"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
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
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setConfirming(true)}
      >
        Mark as paid
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-ink-secondary">Confirm payment made?</span>
      <Button
        type="button"
        variant="primary"
        size="sm"
        onClick={submit}
        disabled={pending}
      >
        {pending ? "Saving…" : "Yes, mark paid"}
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => {
          setConfirming(false);
          setError(null);
        }}
        disabled={pending}
      >
        Cancel
      </Button>
      {error && (
        <span className="text-xs text-danger w-full">{error}</span>
      )}
    </div>
  );
}
