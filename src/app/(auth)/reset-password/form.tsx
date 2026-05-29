"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import {
  updatePasswordAction,
  type AuthResult,
} from "@/features/auth/actions";

const initial: AuthResult | null = null;

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button size="lg" type="submit" className="mt-2" disabled={pending}>
      {pending ? "Updating…" : "Update password"}
    </Button>
  );
}

export function ResetPasswordForm() {
  const [state, action] = useActionState(updatePasswordAction, initial);

  return (
    <form action={action} className="mt-10 flex flex-col gap-4">
      {state && !state.ok && (
        <div className="rounded-sm border border-danger/30 bg-danger-weak/40 px-3 py-2 text-xs text-ink">
          {state.error}
        </div>
      )}
      <label className="flex flex-col gap-2">
        <span className="text-label">New password</span>
        <input
          type="password"
          name="password"
          autoComplete="new-password"
          required
          minLength={12}
          placeholder="••••••••••••"
          className="h-11 px-3 rounded-sm border border-line-soft bg-surface text-sm text-ink focus:outline-none focus:border-line-strong transition-colors"
        />
      </label>
      <label className="flex flex-col gap-2">
        <span className="text-label">Confirm new password</span>
        <input
          type="password"
          name="confirmPassword"
          autoComplete="new-password"
          required
          minLength={12}
          placeholder="••••••••••••"
          className="h-11 px-3 rounded-sm border border-line-soft bg-surface text-sm text-ink focus:outline-none focus:border-line-strong transition-colors"
        />
      </label>
      <Submit />
    </form>
  );
}
