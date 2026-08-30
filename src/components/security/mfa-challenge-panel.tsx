"use client";

import { useState, useTransition } from "react";
import { ArrowRight, AlertCircle, KeyRound } from "lucide-react";
import { MfaVerifyForm } from "@/components/security/mfa-verify-form";
import { redeemRecoveryCodeAction } from "@/features/security-baseline/mfa-actions";

/**
 * MFA-ENFORCE-1 — the login-time challenge panel shown on `/login/mfa`.
 *
 * Default view: the shared <MfaVerifyForm mode="challenge" /> (six-digit
 * TOTP), whose verifyMfaChallengeAction now clears the `mfa_pending`
 * marker server-side and redirects to /dashboard on success.
 *
 * "Use a recovery code instead" reveals an input wired to
 * redeemRecoveryCodeAction, which on success likewise clears the marker and
 * redirects to /dashboard (server-side). On failure we surface the error
 * inline and keep the user on the challenge.
 */
export function MfaChallengePanel() {
  const [useRecovery, setUseRecovery] = useState(false);

  if (!useRecovery) {
    return (
      <div className="auth-stack">
        <MfaVerifyForm mode="challenge" />
        <button
          type="button"
          onClick={() => setUseRecovery(true)}
          className="auth-link self-start text-xs"
        >
          Use a recovery code instead
        </button>
      </div>
    );
  }

  return (
    <div className="auth-stack">
      <RecoveryCodeForm />
      <button
        type="button"
        onClick={() => setUseRecovery(false)}
        className="auth-link self-start text-xs"
      >
        Use your authenticator code instead
      </button>
    </div>
  );
}

function RecoveryCodeForm() {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        const trimmed = code.trim();
        if (trimmed.length < 8) {
          setError("Enter one of your recovery codes.");
          return;
        }
        startTransition(async () => {
          const fd = new FormData();
          fd.set("code", trimmed);
          // On success this server action clears the marker and
          // redirect()s to /dashboard — the transition follows it, so the
          // line below only runs on failure.
          const out = await redeemRecoveryCodeAction(null, fd);
          if (!out.ok) {
            setError(out.error ?? "We could not match that recovery code.");
          }
        });
      }}
      className="auth-stack"
    >
      <label className="field">
        <span className="field-label">Recovery code</span>
        <div className="auth-field-wrap">
          <KeyRound
            className="auth-field-icon w-4 h-4"
            strokeWidth={1.7}
            aria-hidden
          />
          <input
            name="code"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="xxxx-xxxx-xxxx"
            className="input auth-input font-mono"
            autoFocus
          />
        </div>
      </label>
      {error && (
        <div className="auth-notice auth-notice-danger">
          <AlertCircle className="auth-notice-ic w-4 h-4" strokeWidth={1.7} />
          <span>{error}</span>
        </div>
      )}
      <button
        type="submit"
        disabled={pending}
        className="btn btn-accent btn-lg auth-submit"
      >
        {pending ? (
          "Verifying…"
        ) : (
          <>
            Use recovery code <ArrowRight className="w-4 h-4" strokeWidth={1.8} />
          </>
        )}
      </button>
    </form>
  );
}
