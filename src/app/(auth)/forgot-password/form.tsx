"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import {
  requestPasswordResetAction,
  type AuthResult,
} from "@/features/auth/actions";

const initial: AuthResult | null = null;

function Submit({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button size="lg" type="submit" className="mt-2" disabled={pending || disabled}>
      {pending ? "Sending link…" : "Send reset link"}
    </Button>
  );
}

export function ForgotPasswordForm({ supabaseReady }: { supabaseReady: boolean }) {
  const [state, action] = useActionState(requestPasswordResetAction, initial);

  if (state?.ok) {
    return (
      <div className="mt-10 rounded-2xl border border-line-soft bg-surface px-4 py-5 text-sm text-ink-secondary leading-relaxed">
        If an account exists for that email, we’ve sent a link to reset your
        password. Check your inbox (and spam) — the link expires shortly for
        security.
      </div>
    );
  }

  return (
    <form action={action} className="mt-10 flex flex-col gap-4">
      {state && !state.ok && (
        <div className="rounded-sm border border-danger/30 bg-danger-weak/40 px-3 py-2 text-xs text-ink">
          {state.error}
        </div>
      )}
      <label className="flex flex-col gap-2">
        <span className="text-label">Work email</span>
        <input
          type="email"
          name="email"
          autoComplete="email"
          required
          placeholder="you@company.com"
          disabled={!supabaseReady}
          className="h-11 px-3 rounded-sm border border-line-soft bg-surface text-sm text-ink focus:outline-none focus:border-line-strong transition-colors disabled:opacity-60"
        />
      </label>
      <Submit disabled={!supabaseReady} />
      {!supabaseReady && (
        <p className="text-[11px] text-ink-tertiary leading-relaxed">
          Password recovery becomes active once Supabase env vars are
          configured (see <code className="font-mono">.env.example</code>).
        </p>
      )}
    </form>
  );
}
