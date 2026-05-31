"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Mail, Lock, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signInAction, type AuthResult } from "@/features/auth/actions";
import { useFormStatus } from "react-dom";

const initial: AuthResult | null = null;

function Submit({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      size="lg"
      type="submit"
      className="mt-2 w-full justify-center gap-2"
      disabled={pending || disabled}
    >
      {pending ? "Signing in…" : "Continue"}
      {!pending && <ArrowRight className="w-4 h-4" strokeWidth={1.8} />}
    </Button>
  );
}

const inputClass =
  "h-12 w-full pl-10 pr-3 rounded-md border border-line-soft bg-surface text-sm text-ink placeholder:text-ink-tertiary focus:outline-none focus:border-line-strong transition-colors disabled:opacity-60";
const iconClass =
  "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-tertiary";

export function LoginForm({
  supabaseReady,
  product,
}: {
  supabaseReady: boolean;
  /** Sprint 2 — `x-product` value from the request host (one of
   *  "management" | "development" | "subscription" | "platform" | "").
   *  Threaded into the form as a hidden input so the server action can
   *  pick the post-login redirect target. */
  product?: string;
}) {
  const [state, action] = useActionState(signInAction, initial);

  return (
    <form action={action} className="mt-8 flex flex-col gap-4">
      {product ? (
        <input type="hidden" name="product" value={product} />
      ) : null}
      {state && !state.ok && (
        <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-3 py-2 text-xs text-ink">
          {state.error}
        </div>
      )}
      <label className="flex flex-col gap-2">
        <span className="text-label">Work email</span>
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
        <div className="flex items-center justify-between">
          <span className="text-label">Password</span>
          <Link
            href="/forgot-password"
            className="text-xs text-ink-tertiary hover:text-ink hover:underline underline-offset-2"
          >
            Forgot password?
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
      <Submit disabled={!supabaseReady} />
      {!supabaseReady && (
        <p className="text-[11px] text-ink-tertiary leading-relaxed">
          Email + password sign-in becomes active once Supabase env vars are
          configured (see <code className="font-mono">.env.example</code>).
        </p>
      )}
    </form>
  );
}
