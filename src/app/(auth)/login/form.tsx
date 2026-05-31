"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Mail, Lock, ArrowRight, ShieldCheck } from "lucide-react";
import { signInAction, type AuthResult } from "@/features/auth/actions";
import { useFormStatus } from "react-dom";

const initial: AuthResult | null = null;

const inputClass =
  "h-12 w-full pl-10 pr-3 rounded-md border border-line bg-surface text-sm text-ink placeholder:text-ink-tertiary focus:outline-none focus:border-line-strong transition-colors disabled:opacity-60";
const iconClass =
  "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-tertiary";

function Submit({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="mt-1 h-12 w-full rounded-full inline-flex items-center justify-center gap-2 text-sm font-medium transition-[background,opacity] disabled:opacity-60"
      style={{ background: "var(--terra)", color: "var(--paper, #fff)" }}
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

      <label className="flex flex-col gap-2">
        <span className="label">Work email</span>
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
          />
        </div>
      </label>

      <label className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <span className="label">Password</span>
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
          />
        </div>
      </label>

      <label className="flex items-center gap-2 text-[13.5px] text-ink-secondary select-none">
        <input
          type="checkbox"
          name="remember"
          defaultChecked
          className="h-4 w-4 rounded-sm"
          style={{ accentColor: "var(--ink)" }}
        />
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
            className="h-12 w-full rounded-full inline-flex items-center justify-center gap-2 text-sm font-medium border border-line-strong bg-surface text-ink transition-colors hover:bg-muted"
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
