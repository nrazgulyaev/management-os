"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { setPayoutBatchStatusAction } from "@/features/finance/actions";
import type { ActionResult } from "@/features/projects/actions";

/**
 * Inline state-machine controls for a payout batch. Mirrors
 * `PAYOUT_BATCH_TRANSITIONS` in `src/features/finance/actions.ts` — the server
 * action re-validates the transition + org scope, so this is a UX affordance,
 * not the authority. Each button submits `{ id, next }` to
 * `setPayoutBatchStatusAction` (perm `finance.approve_payout`).
 *
 * Sibling of `PayoutLineStatusButtons`; same shape, batch-level transitions.
 */

const NEXT_LABEL: Record<string, string> = {
  approved: "Approve",
  paid: "Mark paid",
  cancelled: "Cancel",
  draft: "Reopen",
};

const NEXT_CLASS: Record<string, string> = {
  approved: "btn-primary",
  paid: "btn-accent",
  cancelled: "btn-ghost",
  draft: "btn-secondary",
};

// Keep in sync with PAYOUT_BATCH_TRANSITIONS (src/features/finance/actions.ts).
const TRANSITIONS: Record<string, string[]> = {
  draft: ["approved", "cancelled"],
  approved: ["paid", "cancelled"],
  paid: [],
  cancelled: [],
};

export function PayoutBatchStatusButtons({
  batchId,
  status,
}: {
  batchId: string;
  status: string;
}) {
  const [state, dispatch, pending] = useActionState<ActionResult | null, FormData>(
    setPayoutBatchStatusAction,
    null,
  );
  const router = useRouter();
  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  const nexts = TRANSITIONS[status] ?? [];
  if (nexts.length === 0) {
    return <span className="text-[12px] text-ink-4">—</span>;
  }

  return (
    <form action={dispatch} className="flex items-center gap-1.5 justify-end">
      <input type="hidden" name="id" value={batchId} />
      {state && !state.ok && state.error && (
        <span className="text-[11px] text-danger mr-1">{state.error}</span>
      )}
      {nexts.map((next) => (
        <button
          key={next}
          type="submit"
          name="next"
          value={next}
          disabled={pending}
          className={`btn btn-sm ${NEXT_CLASS[next] ?? "btn-secondary"}`}
        >
          {NEXT_LABEL[next] ?? next}
        </button>
      ))}
    </form>
  );
}
