"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
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

export function DisableMfaButton({ factorId }: { factorId: string }) {
  const [state, action] = useFormState(disableMfaAction, null);
  return (
    <form action={action} className="inline-block">
      <input type="hidden" name="factorId" value={factorId} />
      <PendingButton
        label="Disable MFA"
        busyLabel="…"
        small
        variant="destructive"
      />
      {state && !state.ok && (
        <span className="text-[11px] text-danger ml-2">{state.error}</span>
      )}
    </form>
  );
}

export function RevokeMfaFactorButton({ factorId }: { factorId: string }) {
  const [state, action] = useFormState(revokeMfaFactorAction, null);
  return (
    <form action={action} className="inline-block">
      <input type="hidden" name="factorId" value={factorId} />
      <PendingButton label="Revoke" busyLabel="…" small variant="destructive" />
      {state && !state.ok && (
        <span className="text-[11px] text-danger ml-2">{state.error}</span>
      )}
    </form>
  );
}
