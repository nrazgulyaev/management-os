"use client";

/**
 * Wire-up sweep — reverse an applied/draft shared-cost allocation.
 * reverseSharedCostAllocation existed ("use server") with no UI caller.
 */

import { useState, useTransition } from "react";
import { Loader2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reverseSharedCostAllocation } from "@/lib/development/server/shared-costs/shared-cost-actions";

export function SharedCostReverseButton({
  allocationId,
}: {
  allocationId: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done) {
    return <p className="text-xs text-ink-tertiary">Allocation reversed.</p>;
  }

  if (!open) {
    return (
      <Button size="sm" variant="secondary" onClick={() => { setError(null); setOpen(true); }}>
        <Undo2 className="w-3 h-3 mr-1" />
        Reverse allocation
      </Button>
    );
  }

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        const reason = (new FormData(e.currentTarget).get("reason") ?? "")
          .toString()
          .trim();
        setError(null);
        startTransition(async () => {
          try {
            await reverseSharedCostAllocation({ allocationId, reason });
            setDone(true);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Reverse failed");
          }
        });
      }}
    >
      <input
        name="reason"
        required
        minLength={3}
        placeholder="Reason for reversal"
        className="w-full max-w-md rounded border border-line-soft bg-surface px-2 py-1.5 text-sm"
      />
      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" type="submit" disabled={pending}>
          {pending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
          Confirm reversal
        </Button>
        <Button size="sm" variant="ghost" type="button" disabled={pending} onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </form>
  );
}
