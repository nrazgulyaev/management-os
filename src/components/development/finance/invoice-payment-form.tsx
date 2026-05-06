"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { recordInvoicePayment } from "@/lib/development/server/invoices/invoice-actions";

/**
 * Inline payment recorder. Operator enters an amount; the action
 * refuses overpayment + cancelled/voided invoices, and flips status
 * to 'paid' when fully covered.
 *
 * The actual cash transaction is recorded separately via
 * `recordTransaction` — this only updates the invoice's paid_minor
 * + status. A future stage will atomically link the new transaction
 * to the invoice.
 */
export function InvoicePaymentForm({
  invoiceId,
  outstandingMinor,
  currency,
}: {
  invoiceId: string;
  outstandingMinor: string;
  currency: string;
}) {
  const [pending, startTransition] = useTransition();
  const outstandingMajor = Number(outstandingMinor) / 100;
  const [amount, setAmount] = useState<string>(outstandingMajor.toFixed(2));
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="rounded-md border border-line-soft bg-surface p-4 space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 flex-1 min-w-[200px]">
          <span className="text-[11px] uppercase tracking-wide text-ink-tertiary">
            Payment amount ({currency}, major units)
          </span>
          <input
            type="number"
            step="0.01"
            min="0.01"
            max={outstandingMajor}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="rounded border border-line-soft p-1.5 text-sm w-full"
          />
          <span className="text-[11px] text-ink-tertiary">
            Outstanding: {outstandingMajor.toFixed(2)}
          </span>
        </label>
        <Button
          size="sm"
          disabled={
            pending ||
            !amount ||
            Number(amount) <= 0 ||
            Number(amount) > outstandingMajor
          }
          onClick={() => {
            setError(null);
            startTransition(async () => {
              try {
                const minor = BigInt(
                  Math.round(Number(amount) * 100),
                ).toString();
                await recordInvoicePayment({
                  invoiceId,
                  amountMinor: minor,
                });
              } catch (e) {
                setError(e instanceof Error ? e.message : "Record payment failed");
              }
            });
          }}
        >
          {pending ? (
            <Loader2 className="w-3 h-3 animate-spin mr-1" />
          ) : null}
          Record payment
        </Button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      <p className="text-[11px] text-ink-tertiary">
        Records the payment against this invoice only. The corresponding cash
        transaction (matching the bank statement line) should be entered via
        the transactions ledger.
      </p>
    </div>
  );
}
