"use client";

import { useActionState } from "react";
import { issueConciergeVerificationCodeAction } from "@/features/guest-stays/actions";
import type { ActionResult } from "@/features/projects/actions";

/**
 * Concierge-issue verification code control.
 *
 * For a walk-in guest whose token has NO email and NO phone, the normal
 * email/SMS code delivery is a dead end. An authorized operator clicks this to
 * generate a fresh one-time code (same mechanism the guest verify flow checks)
 * and reads it to the guest in person. The plaintext is shown once, here only —
 * the action is permission-gated + org-scoped + audited on the server.
 *
 * Visibility is gated by the page on `guest_stay.token.manage`.
 */
type State = (ActionResult & { code?: string; expiresInMinutes?: number }) | null;

export function ConciergeVerificationCode({ tokenId }: { tokenId: string }) {
  const [state, dispatch, pending] = useActionState<State, FormData>(
    issueConciergeVerificationCodeAction,
    null,
  );

  return (
    <div className="flex flex-col gap-3">
      <form action={dispatch}>
        <input type="hidden" name="tokenId" value={tokenId} />
        <button
          type="submit"
          disabled={pending}
          className="btn btn-secondary btn-sm"
        >
          {pending ? "Issuing…" : "Issue verification code (concierge)"}
        </button>
      </form>

      {state && !state.ok && state.error && (
        <p className="text-[12px] text-danger">{state.error}</p>
      )}

      {state?.ok && state.code && (
        <div className="rounded-md border border-line bg-surface-2 p-4 max-w-[420px]">
          <div className="text-[11px] uppercase tracking-widest text-ink-tertiary">
            Verification code
          </div>
          <div className="mono text-[28px] font-semibold tracking-[0.3em] mt-1">
            {state.code}
          </div>
          <p className="text-[12px] text-ink-3 mt-2">
            Read this to the guest. It expires like a normal code
            {state.expiresInMinutes ? ` (≈${state.expiresInMinutes} min)` : ""}.
            Issue a new one if it lapses.
          </p>
        </div>
      )}
    </div>
  );
}
