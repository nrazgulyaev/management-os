"use client";

import { useState, useTransition } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, RevokeConfirmDialog } from "@/components/ui/primitives";
import {
  disableMfaAction,
  revokeMfaFactorAction,
  startMfaEnrollmentAction,
} from "@/features/security-baseline/mfa-actions";

function PendingButton({
  label,
  busyLabel,
  small,
  variant,
}: {
  label: string;
  busyLabel: string;
  small?: boolean;
  variant?: "primary" | "secondary" | "destructive";
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size={small ? "sm" : undefined}
      variant={variant ?? "primary"}
      disabled={pending}
    >
      {pending ? busyLabel : label}
    </Button>
  );
}

export function StartEnrolmentButton() {
  const [state, action] = useFormState(startMfaEnrollmentAction, null);
  return (
    <form action={action} className="flex flex-col gap-2">
      <PendingButton label="Start MFA enrolment" busyLabel="Starting…" />
      {state && state.ok && state.otpauthUrl && (
        <div className="rounded-md border border-line-soft bg-surface p-4 text-xs flex flex-col gap-2">
          <p className="text-ink">
            Scan this code in your authenticator app, then enter the 6-digit
            code on the next screen.
          </p>
          <code className="font-mono text-[10px] break-all">
            {state.otpauthUrl}
          </code>
          {state.secret && (
            <p className="text-ink-tertiary">
              Or enter manually:{" "}
              <code className="font-mono text-ink">{state.secret}</code>
            </p>
          )}
          <a
            href="/setup/mfa/verify"
            className="inline-flex items-center justify-center h-8 px-3 rounded-full bg-ink text-ink-inverse text-xs font-medium self-start"
          >
            Continue to verify
          </a>
        </div>
      )}
      {state && !state.ok && (
        <p className="text-[11px] text-danger">{state.error}</p>
      )}
    </form>
  );
}

/**
 * Stage 10.E.7 — wrapped MFA disable + revoke actions in confirm
 * dialogs from the 10.D primitives. Both are destructive (account
 * security implications); the dialog ensures intentional action.
 */
export function DisableMfaButton({ factorId }: { factorId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="destructive"
        disabled={pending}
        onClick={() => setConfirmOpen(true)}
      >
        {pending ? "…" : "Disable MFA"}
      </Button>
      {error && (
        <span className="text-[11px] text-danger ml-2">{error}</span>
      )}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={async () => {
          await new Promise<void>((resolve, reject) => {
            startTransition(async () => {
              setError(null);
              const fd = new FormData();
              fd.set("factorId", factorId);
              const res = await disableMfaAction(null, fd);
              if (!res || !res.ok) {
                const msg = res?.error ?? "Disable failed";
                setError(msg);
                reject(new Error(msg));
                return;
              }
              resolve();
            });
          });
        }}
        title="Disable MFA?"
        description="Disabling MFA reduces account security. The next sign-in will only require the password."
        confirmLabel="Disable"
        tone="destructive"
        warning="Re-enable MFA from the same panel; an administrator may also force re-enrolment."
      />
    </>
  );
}

export function RevokeMfaFactorButton({ factorId }: { factorId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="destructive"
        disabled={pending}
        onClick={() => setConfirmOpen(true)}
      >
        {pending ? "…" : "Revoke"}
      </Button>
      {error && (
        <span className="text-[11px] text-danger ml-2">{error}</span>
      )}
      <RevokeConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={async () => {
          await new Promise<void>((resolve, reject) => {
            startTransition(async () => {
              setError(null);
              const fd = new FormData();
              fd.set("factorId", factorId);
              const res = await revokeMfaFactorAction(null, fd);
              if (!res || !res.ok) {
                const msg = res?.error ?? "Revoke failed";
                setError(msg);
                reject(new Error(msg));
                return;
              }
              resolve();
            });
          });
        }}
        entityName="this MFA factor"
        description="The factor will be removed and cannot be used again. The user must re-enrol from scratch."
      />
    </>
  );
}
