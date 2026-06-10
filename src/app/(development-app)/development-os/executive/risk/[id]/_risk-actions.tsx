"use client";

/**
 * Executive risk drill-in — lifecycle action buttons.
 *
 * Thin client wrapper over the EXISTING risk-radar server actions
 * (acknowledge / resolve / mark-false-positive in
 * src/lib/development/server/risk-radar/risk-radar-actions.ts).
 * One useActionState reducer dispatches on the submitter's `intent`
 * value, so all three verbs share pending/error state.
 */

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import {
  acknowledgeAlert,
  resolveAlert,
  markFalsePositive,
} from "@/lib/development/server/risk-radar/risk-radar-actions";

type ActionState = { ok: boolean; error?: string } | null;

export function ExecutiveRiskActions({
  alertCode,
  status,
  userId,
}: {
  alertCode: string;
  status: string;
  userId: string;
}) {
  const router = useRouter();

  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    async (_prev, formData) => {
      const intent = String(formData.get("intent") ?? "");
      const resolutionNotes =
        String(formData.get("resolutionNotes") ?? "").trim() || undefined;

      let result: { ok: boolean; error?: string };
      if (intent === "acknowledge") {
        result = await acknowledgeAlert({ alertCode, userId });
      } else if (intent === "resolve") {
        result = await resolveAlert({ alertCode, userId, resolutionNotes });
      } else if (intent === "false_positive") {
        result = await markFalsePositive({
          alertCode,
          userId,
          resolutionNotes,
        });
      } else {
        return { ok: false, error: "Unknown action." };
      }

      if (result.ok) router.refresh();
      return result;
    },
    null,
  );

  const isOpenLike = ["open", "acknowledged", "investigating"].includes(
    status,
  );

  if (!isOpenLike) {
    return (
      <p className="mono text-[11px] text-[var(--ink-3)] uppercase tracking-[0.1em] m-0">
        Lifecycle closed · status {status.replace(/_/g, " ")}
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2.5">
      {status === "open" && (
        <button
          type="submit"
          name="intent"
          value="acknowledge"
          className="btn btn-amber btn-sm w-full justify-center"
          disabled={pending}
        >
          {pending ? "Working…" : "Acknowledge"}
        </button>
      )}
      <textarea
        name="resolutionNotes"
        rows={2}
        placeholder="Resolution notes (optional)"
        className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel,var(--bg-3))] px-3 py-2 text-[13px] text-ink"
        aria-label="Resolution notes"
      />
      <button
        type="submit"
        name="intent"
        value="resolve"
        className="btn btn-secondary btn-sm w-full justify-center"
        disabled={pending}
      >
        {pending ? "Working…" : "Resolve"}
      </button>
      <button
        type="submit"
        name="intent"
        value="false_positive"
        className="btn btn-secondary btn-sm w-full justify-center text-[var(--danger)]"
        disabled={pending}
      >
        {pending ? "Working…" : "Mark false positive"}
      </button>
      {state && !state.ok && (
        <span className="text-[12px] text-[var(--danger)]">
          {state.error ?? "Action failed."}
        </span>
      )}
    </form>
  );
}
