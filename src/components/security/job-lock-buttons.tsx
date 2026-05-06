"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import {
  expireStaleJobLocksAction,
  forceReleaseJobLockAction,
} from "@/features/jobs/lock-actions";

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

export function ExpireStaleLocksButton() {
  const [state, action] = useFormState(expireStaleJobLocksAction, null);
  return (
    <form action={action}>
      <PendingButton label="Expire stale locks" busyLabel="…" />
      {state && state.ok && (
        <span className="text-[11px] text-success ml-2">
          {state.expired ?? 0} expired.
        </span>
      )}
      {state && !state.ok && (
        <span className="text-[11px] text-danger ml-2">{state.error}</span>
      )}
    </form>
  );
}

export function ForceReleaseLockButton({ jobKey }: { jobKey: string }) {
  const [state, action] = useFormState(forceReleaseJobLockAction, null);
  return (
    <form action={action} className="inline-block">
      <input type="hidden" name="jobKey" value={jobKey} />
      <PendingButton
        label="Force release"
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
