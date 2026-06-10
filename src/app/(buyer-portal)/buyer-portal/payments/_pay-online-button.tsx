"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { startBuyerInstallmentCheckout } from "@/features/payments/buyer-installment-checkout";

/**
 * "Pay online" control for a buyer installment — only rendered when the
 * org has a configured + ACTIVE Xendit connection (the server action
 * re-checks). Creates / resumes a Xendit hosted invoice (QRIS, e-wallets,
 * bank Virtual Accounts) and redirects the buyer to its checkout URL.
 * The webhook marks the installment paid; the manual "Mark as paid"
 * flow next to this button is unchanged.
 */
export function PayOnlineButton({
  milestoneId,
  hasOpenCheckout,
}: {
  milestoneId: string;
  hasOpenCheckout: boolean;
}) {
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function submit() {
    setError(null);
    start(async () => {
      const res = await startBuyerInstallmentCheckout({ milestoneId });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      window.location.assign(res.checkoutUrl);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="primary"
        size="sm"
        onClick={submit}
        disabled={pending}
      >
        {pending
          ? "Opening…"
          : hasOpenCheckout
            ? "Resume online payment"
            : "Pay online"}
      </Button>
      {error && (
        <span className="text-xs text-danger max-w-[280px] text-right">
          {error}
        </span>
      )}
    </div>
  );
}
