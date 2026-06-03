"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Mail, Lock, ArrowRight, ShieldCheck } from "lucide-react";
import { signInAction, type AuthResult } from "@/features/auth/actions";
import { useFormStatus } from "react-dom";

const initial: AuthResult | null = null;

// Icon overlay sits inside the relative wrapper; the input itself uses the
// shared `.input` primitive (terra focus-ring, radius 10, bg --paper) + inline
// paddingLeft/height to mirror the prototype's auth-screens.jsx <Field>.
const inputClass = "input disabled:opacity-60";
const inputStyle = { paddingLeft: 40, height: 46 } as const;
const iconClass =
  "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-tertiary";

function Submit({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="btn btn-accent btn-lg w-full justify-center mt-1 disabled:opacity-60"
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
    <form action={action} className="mt-7 flex flex-col gap-4">
      {product ? <input type="hidden" name="product" value={product} /> : null}

      {state && !state.ok && (
        <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-3 py-2 text-xs text-ink">
          {state.error}
        </div>
      )}

      <label className="field" style={{ gap: 7 }}>
        <span className="field-label">Work email</span>
        <div className="relative">
          <Mail className={iconClass} strokeWidth={1.7} aria-hidden />
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            placeholder="you@company.com"
            disabled={!supabaseReady}
            className={inputClass}
            style={inputStyle}
          />
        </div>
      </label>

      <label className="field" style={{ gap: 7 }}>
        <div className="flex items-baseline justify-between">
          <span className="field-label">Password</span>
          <Link
            href="/forgot-password"
            className="text-xs text-ink-secondary hover:text-ink underline underline-offset-2 decoration-line-strong"
          >
            Forgot?
          </Link>
        </div>
        <div className="relative">
          <Lock className={iconClass} strokeWidth={1.7} aria-hidden />
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            placeholder="••••••••"
            disabled={!supabaseReady}
            className={inputClass}
            style={inputStyle}
          />
        </div>
      </label>

      <label className="check" style={{ fontSize: 13.5 }}>
        <input type="checkbox" name="remember" defaultChecked />
        <span className="box" />
        Keep me signed in on this device
      </label>

      <Submit disabled={!supabaseReady} />

      {sso && (
        <>
          <div className="my-1 flex items-center gap-3">
            <span className="h-px flex-1" style={{ background: "var(--line)" }} />
            <span className="text-[11px] uppercase tracking-[0.18em] text-ink-tertiary">
              or
            </span>
            <span className="h-px flex-1" style={{ background: "var(--line)" }} />
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-lg w-full justify-center"
          >
            <ShieldCheck className="w-4 h-4" strokeWidth={1.7} /> Continue with SSO
          </button>
        </>
      )}

      {!supabaseReady && (
        <p className="text-[11px] text-ink-tertiary leading-relaxed">
          Email + password sign-in becomes active once Supabase env vars are
          configured (see <code className="font-mono">.env.example</code>).
        </p>
      )}
    </form>
  );
}
