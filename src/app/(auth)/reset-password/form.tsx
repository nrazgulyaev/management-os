"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Lock, ArrowRight, Check, AlertCircle } from "lucide-react";
import {
  updatePasswordAction,
  type AuthResult,
} from "@/features/auth/actions";

const initial: AuthResult | null = null;

const REQUIREMENTS = [
  "At least 12 characters",
  "One number or symbol",
  "Not a previous password",
];

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn btn-accent btn-lg auth-submit"
    >
      {pending ? (
        "Updating…"
      ) : (
        <>
          Update password <ArrowRight className="w-4 h-4" strokeWidth={1.8} />
        </>
      )}
    </button>
  );
}

export function ResetPasswordForm() {
  const [state, action] = useActionState(updatePasswordAction, initial);

  return (
    <form action={action} className="auth-stack">
      {state && !state.ok && (
        <div className="auth-notice auth-notice-danger">
          <AlertCircle className="auth-notice-ic w-4 h-4" strokeWidth={1.7} />
          <span>{state.error}</span>
        </div>
      )}
      <label className="field">
        <span className="field-label">New password</span>
        <div className="auth-field-wrap">
          <Lock className="auth-field-icon w-4 h-4" strokeWidth={1.7} aria-hidden />
          <input
            type="password"
            name="password"
            autoComplete="new-password"
            required
            minLength={12}
            placeholder="••••••••••••"
            className="input auth-input"
          />
        </div>
      </label>
      <label className="field">
        <span className="field-label">Confirm new password</span>
        <div className="auth-field-wrap">
          <Lock className="auth-field-icon w-4 h-4" strokeWidth={1.7} aria-hidden />
          <input
            type="password"
            name="confirmPassword"
            autoComplete="new-password"
            required
            minLength={12}
            placeholder="••••••••••••"
            className="input auth-input"
          />
        </div>
      </label>
      <div className="auth-reqs">
        {REQUIREMENTS.map((r) => (
          <div key={r} className="auth-req">
            <span className="auth-req-dot">
              <Check className="w-[11px] h-[11px]" strokeWidth={2.2} />
            </span>
            {r}
          </div>
        ))}
      </div>
      <Submit />
    </form>
  );
}
