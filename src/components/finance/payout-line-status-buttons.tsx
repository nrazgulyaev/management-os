"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { setPayoutLineStatusAction } from "@/features/finance/actions";
import type { ActionResult } from "@/features/projects/actions";

/**
 * Inline state-machine controls for a payout line. Mirrors
 * `PAYOUT_LINE_TRANSITIONS` in `src/features/finance/actions.ts` — the server
 * action re-validates the transition + org scope, so this is a UX affordance,
 * not the authority. Each button submits `{ id, next }` to
 * `setPayoutLineStatusAction` (perm `finance.approve_payout`).
 */

const NEXT_LABEL: Record<string, string> = {
  approved: "Approve",
  paid: "Mark paid",
  failed: "Mark failed",
  cancelled: "Cancel",
  pending: "Reopen",
};

const NEXT_CLASS: Record<string, string> = {
  approved: "btn-primary",
  paid: "btn-accent",
  failed: "btn-secondary",
  cancelled: "btn-ghost",
  pending: "btn-secondary",
};

// Keep in sync with PAYOUT_LINE_TRANSITIONS (src/features/finance/actions.ts).
const TRANSITIONS: Record<string, string[]> = {
  pending: ["approved", "cancelled"],
  approved: ["paid", "failed", "cancelled"],
  // "Reopen" → pending sends a failed/cancelled line back to the start of the
  // approve→paid lifecycle.
  failed: ["approved", "cancelled", "pending"],
  paid: [],
  cancelled: ["pending"],
};

export function PayoutLineStatusButtons({
  lineId,
  status,
}: {
  lineId: string;
  status: string;
}) {
  const [state, dispatch, pending] = useActionState<ActionResult | null, FormData>(
    setPayoutLineStatusAction,
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
      <input type="hidden" name="id" value={lineId} />
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
