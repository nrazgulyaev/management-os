"use client";

/**
 * W1c — Capital-call receipt control (client island).
 *
 * Mounts the `RecordCapitalReceivedModal` over the orphaned
 * `recordCapitalReceivedAction`. Each unpaid allocation row renders a
 * "Record receipt" button; clicking opens the modal pre-filled with the
 * expected amount. On submit we convert the modal's MAJOR-USD amount to
 * BIGINT minor units (cents) and call the server action, then refresh.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  RecordCapitalReceivedModal,
  type RecordReceivedValues,
} from "@/components/cfo/record-capital-received-modal";
import { recordCapitalReceivedAction } from "@/lib/development/server/capital-call-actions";

export interface ReceiptAllocation {
  id: string;
  investorName: string;
  expectedUsdMinor: number;
}

export function RecordReceiptButton({
  allocation,
}: {
  allocation: ReceiptAllocation;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(values: RecordReceivedValues) {
    setError(null);
    // The modal carries the amount in MAJOR USD; convert to minor (cents).
    const receivedUsdMinor = Math.round(values.receivedUsd * 100);
    return new Promise<void>((resolve) => {
      startTransition(async () => {
        try {
          await recordCapitalReceivedAction({
            allocationId: values.allocationId,
            receivedUsdMinor,
            receivedAt: values.receivedAt,
            wireRef: values.wireRef,
          });
          router.refresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not record receipt.");
        } finally {
          resolve();
        }
      });
    });
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        disabled={pending}
        onClick={() => setOpen(true)}
      >
        {pending ? "Recording…" : "Record receipt"}
      </button>
      {error && (
        <div className="text-[11px] text-danger mt-1">{error}</div>
      )}
      <RecordCapitalReceivedModal
        open={open}
        onOpenChange={setOpen}
        allocation={{
          id: allocation.id,
          investorName: allocation.investorName,
          // Modal displays + pre-fills in MAJOR USD.
          expectedUsd: allocation.expectedUsdMinor / 100,
        }}
        onSubmit={handleSubmit}
      />
    </>
  );
}
