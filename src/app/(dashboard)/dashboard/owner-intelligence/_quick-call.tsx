"use client";

/**
 * 1-tap "schedule founder call" on a high-risk owner row — mock §04
 * mobile principle 3. Logs a founder-call intervention via the existing
 * churn action (audited, owners.write-gated server side).
 */

import { useActionState } from "react";
import { PhoneCall } from "lucide-react";
import {
  scheduleFounderCallAction,
  type ChurnActionResult,
} from "@/features/owners/churn-actions";

export function QuickCallButton({ ownerId }: { ownerId: string }) {
  const [state, dispatch, pending] = useActionState<ChurnActionResult | null, FormData>(
    scheduleFounderCallAction,
    null,
  );

  if (state?.ok) {
    return <span className="text-[11px] text-success whitespace-nowrap">Call logged</span>;
  }

  return (
    <form action={dispatch} className="inline-flex flex-col items-end gap-0.5">
      <input type="hidden" name="ownerId" value={ownerId} />
      <button
        type="submit"
        disabled={pending}
        title="Schedule founder call"
        className="btn btn-secondary btn-sm inline-flex items-center gap-1.5"
      >
        <PhoneCall className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden />
        {pending ? "Logging…" : "Call"}
      </button>
      {state && !state.ok && (
        <span className="text-[11px] text-danger">{state.error}</span>
      )}
    </form>
  );
}
