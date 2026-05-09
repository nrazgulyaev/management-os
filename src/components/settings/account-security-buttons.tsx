/**
 * Stage 10.M.2 — Account-security client controls.
 *
 * Two self-serve actions for the per-user account-security page:
 *   - <ChangePasswordForm> — old/new/confirm form, calls
 *     `changePasswordAction` (Supabase Auth update + audit event).
 *   - <SignOutOtherSessionsButton> — confirm dialog → calls
 *     `signOutOtherSessionsAction` (Supabase signOut scope:'others').
 *
 * Both use the 10.D primitives for confirms + leave the user on the
 * page after success (router.refresh) so the audit log row appears.
 */
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/primitives";
import {
  changePasswordAction,
  signOutOtherSessionsAction,
} from "@/features/auth/account-security-actions";

export function ChangePasswordForm() {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (newPassword.length < 12) {
      setError("Password must be at least 12 characters.");
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.set("newPassword", newPassword);
      fd.set("confirmPassword", confirmPassword);
      const res = await changePasswordAction(null, fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setNewPassword("");
      setConfirmPassword("");
      setSuccess(res.message ?? "Password updated.");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3 max-w-md">
      <label className="block text-sm">
        <span className="text-ink-secondary">New password</span>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
          minLength={12}
          required
          className="mt-1 block w-full rounded border border-line-soft p-2 text-sm font-mono"
        />
      </label>
      <label className="block text-sm">
        <span className="text-ink-secondary">Confirm new password</span>
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          minLength={12}
          required
          className="mt-1 block w-full rounded border border-line-soft p-2 text-sm font-mono"
        />
      </label>
      <Button type="submit" disabled={pending}>
        {pending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
        Change password
      </Button>
      {error && <p className="text-xs text-danger">{error}</p>}
      {success && <p className="text-xs text-success">{success}</p>}
      <p className="text-xs text-ink-tertiary">
        Minimum 12 characters. Use a passphrase plus a digit + symbol; or
        let your password manager generate one.
      </p>
    </form>
  );
}

export function SignOutOtherSessionsButton() {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  return (
    <>
      <Button
        type="button"
        variant="destructive"
        disabled={pending}
        onClick={() => setConfirmOpen(true)}
      >
        {pending ? "Signing out…" : "Sign out other sessions"}
      </Button>
      {error && (
        <p className="text-xs text-danger mt-2">{error}</p>
      )}
      {success && (
        <p className="text-xs text-success mt-2">{success}</p>
      )}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Sign out other sessions?"
        description="Every other browser, tab, or device currently signed in as you will be signed out and will need to authenticate again. The current device stays signed in."
        confirmLabel="Sign out everywhere else"
        tone="destructive"
        warning="If you suspect a compromised session, also rotate your password right after."
        onConfirm={async () => {
          await new Promise<void>((resolve, reject) => {
            startTransition(async () => {
              setError(null);
              setSuccess(null);
              const res = await signOutOtherSessionsAction();
              if (!res.ok) {
                setError(res.error);
                reject(new Error(res.error));
                return;
              }
              setSuccess(res.message ?? "Other sessions signed out.");
              router.refresh();
              resolve();
            });
          });
        }}
      />
    </>
  );
}
