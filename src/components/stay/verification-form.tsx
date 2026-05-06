"use client";

import { useActionState } from "react";
import {
  issueStayVerificationAction,
  submitStayVerificationAction,
  type VerifyActionState,
} from "@/features/guest-stays/verification-actions";

export interface VerificationFormProps {
  token: string;
  recipientMasked: string | null;
  hasContact: boolean;
  attemptsLeft: number;
}

export function VerificationForm({
  token,
  recipientMasked,
  hasContact,
  attemptsLeft,
}: VerificationFormProps) {
  const [submitState, dispatchSubmit] = useActionState(
    submitStayVerificationAction,
    null as VerifyActionState,
  );
  const [resendState, dispatchResend] = useActionState(
    issueStayVerificationAction,
    null as VerifyActionState,
  );

  return (
    <div className="rounded-xl border border-line-soft bg-surface p-6 md:p-8 flex flex-col gap-6">
      <div>
        <h1 className="text-display text-2xl md:text-3xl font-medium text-ink">
          Verify your stay
        </h1>
        <p className="text-sm text-ink-secondary mt-3">
          {hasContact
            ? `We've sent a 6-digit code to ${recipientMasked ?? "your contact on file"}. Enter it below to unlock your stay.`
            : "Your stay needs verifying before we can show your door code, Wi-Fi, and other private details. Contact concierge to receive a code."}
        </p>
      </div>

      {hasContact && (
        <form action={dispatchSubmit} className="flex flex-col gap-4">
          <input type="hidden" name="token" value={token} />
          <label className="flex flex-col gap-2">
            <span className="text-[11px] uppercase tracking-widest text-ink-tertiary">
              6-digit code
            </span>
            <input
              type="text"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              required
              maxLength={6}
              placeholder="000000"
              className="h-14 px-4 rounded-md border border-line-soft bg-canvas text-2xl font-mono tracking-[0.5em] text-center"
            />
          </label>
          <p className="text-xs text-ink-tertiary">
            Codes expire after 10 minutes. {attemptsLeft > 0 && (
              <>You have {attemptsLeft} {attemptsLeft === 1 ? "attempt" : "attempts"} left.</>
            )}
          </p>
          {submitState && !submitState.ok && (
            <p className="text-xs text-danger">{submitState.error}</p>
          )}
          <button
            type="submit"
            className="h-12 px-5 rounded-full bg-ink text-ink-inverse text-sm font-medium hover:bg-ink/90 transition-colors"
          >
            Verify
          </button>
        </form>
      )}

      <div className="border-t border-line-soft pt-5">
        <form action={dispatchResend} className="flex items-center gap-3">
          <input type="hidden" name="token" value={token} />
          <button
            type="submit"
            className="text-xs text-ink hover:underline underline-offset-4"
          >
            {hasContact ? "Send a new code" : "Send code"}
          </button>
          {resendState?.ok && (
            <span className="text-xs text-success">
              Sent. Check your messages.
            </span>
          )}
          {resendState && !resendState.ok && (
            <span className="text-xs text-danger">{resendState.error}</span>
          )}
        </form>
        {resendState?.ok && resendState.codePreview && (
          <p className="text-[11px] text-ink-tertiary mt-2 font-mono">
            Dev fallback (no provider configured) · code:{" "}
            <span className="text-ink">{resendState.codePreview}</span>
          </p>
        )}
      </div>

      {!hasContact && (
        <div className="rounded-md border border-warning/40 bg-warning-weak/30 p-4 text-xs text-ink-secondary">
          Your host hasn&apos;t added an email or phone to this stay link.
          Reach out to them directly and they can issue a fresh link.
        </div>
      )}
    </div>
  );
}
