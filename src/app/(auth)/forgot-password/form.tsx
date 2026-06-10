"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Mail, ArrowRight, AlertCircle, CheckCircle2 } from "lucide-react";
import {
  requestPasswordResetAction,
  type AuthResult,
} from "@/features/auth/actions";

const initial: AuthResult | null = null;

function Submit({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="btn btn-accent btn-lg auth-submit"
    >
      {pending ? (
        "Sending link…"
      ) : (
        <>
          Send reset link <ArrowRight className="w-4 h-4" strokeWidth={1.8} />
        </>
      )}
    </button>
  );
}

export function ForgotPasswordForm({ supabaseReady }: { supabaseReady: boolean }) {
  const [state, action] = useActionState(requestPasswordResetAction, initial);

  if (state?.ok) {
    return (
      <div className="auth-notice auth-notice-ok">
        <CheckCircle2 className="auth-notice-ic w-4 h-4" strokeWidth={1.7} />
        <span>
          If an account exists for that email, we&apos;ve sent a link to reset
          your password. Check your inbox (and spam) — the link expires shortly
          for security.
        </span>
      </div>
    );
  }

  return (
    <form action={action} className="auth-stack">
      {state && !state.ok && (
        <div className="auth-notice auth-notice-danger">
          <AlertCircle className="auth-notice-ic w-4 h-4" strokeWidth={1.7} />
          <span>{state.error}</span>
        </div>
      )}
      <label className="field">
        <span className="field-label">Work email</span>
        <div className="auth-field-wrap">
          <Mail className="auth-field-icon w-4 h-4" strokeWidth={1.7} aria-hidden />
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            placeholder="you@company.com"
            disabled={!supabaseReady}
            className="input auth-input disabled:opacity-60"
          />
        </div>
      </label>
      <Submit disabled={!supabaseReady} />
      {!supabaseReady && (
        <p className="field-help leading-relaxed">
          Password recovery becomes active once Supabase env vars are
          configured (see <code className="font-mono">.env.example</code>).
        </p>
      )}
    </form>
  );
}
