"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Mail, Lock, ArrowRight, ShieldCheck, AlertCircle } from "lucide-react";
import { signInAction, type AuthResult } from "@/features/auth/actions";
import { useFormStatus } from "react-dom";

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
        "Signing in…"
      ) : (
        <>
          Continue <ArrowRight className="w-4 h-4" strokeWidth={1.8} />
        </>
      )}
    </button>
  );
}

export function LoginForm({
  supabaseReady,
  product,
  sso,
}: {
  supabaseReady: boolean;
  /** `x-product` value — threaded as a hidden input so the server action
   *  can pick the post-login redirect target. Auth logic unchanged. */
  product?: string;
  /** Whether to show the "Continue with SSO" affordance (per mockup). */
  sso?: boolean;
}) {
  const [state, action] = useActionState(signInAction, initial);

  return (
    <form action={action} className="auth-stack">
      {product ? <input type="hidden" name="product" value={product} /> : null}

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

      <label className="field">
        <div className="auth-pw-head">
          <span className="field-label">Password</span>
          <Link href="/forgot-password" className="auth-link text-xs">
            Forgot?
          </Link>
        </div>
        <div className="auth-field-wrap">
          <Lock className="auth-field-icon w-4 h-4" strokeWidth={1.7} aria-hidden />
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            placeholder="••••••••"
            disabled={!supabaseReady}
            className="input auth-input disabled:opacity-60"
          />
        </div>
      </label>

      <label className="check text-[13.5px]">
        <input type="checkbox" name="remember" defaultChecked />
        <span className="box" />
        Keep me signed in on this device
      </label>

      <Submit disabled={!supabaseReady} />

      {sso && (
        <>
          <div className="auth-or">
            <span>or</span>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-lg auth-submit"
          >
            <ShieldCheck className="w-4 h-4" strokeWidth={1.7} /> Continue with SSO
          </button>
        </>
      )}

      {!supabaseReady && (
        <p className="field-help leading-relaxed">
          Email + password sign-in becomes active once Supabase env vars are
          configured (see <code className="font-mono">.env.example</code>).
        </p>
      )}
    </form>
  );
}
