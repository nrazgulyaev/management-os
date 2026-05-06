"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import {
  acknowledgeStatementWarningAction,
  dismissStatementWarningAction,
  rebuildAllStatementTransparencyAction,
  rebuildStatementTransparencyAction,
  rebuildStatementTransparencyForOwnerAction,
  resolveStatementWarningAction,
} from "@/features/statement-transparency/actions";

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

export function RebuildAllTransparencyButton() {
  const [state, action] = useFormState(
    rebuildAllStatementTransparencyAction,
    null,
  );
  return (
    <form action={action}>
      <PendingButton label="Rebuild all transparency" busyLabel="Rebuilding…" />
      {state && state.ok && (
        <p className="text-[11px] text-success mt-1">
          {state.statementsProcessed ?? 0} statement
          {state.statementsProcessed === 1 ? "" : "s"} rebuilt ·{" "}
          {state.totalGroupsInserted ?? 0} groups ·{" "}
          {state.totalWarningsInserted ?? 0} warnings.
        </p>
      )}
      {state && !state.ok && (
        <p className="text-[11px] text-danger mt-1">{state.error}</p>
      )}
    </form>
  );
}

export function RebuildStatementButton({
  statementId,
}: {
  statementId: string;
}) {
  const [state, action] = useFormState(
    rebuildStatementTransparencyAction,
    null,
  );
  return (
    <form action={action} className="inline-block">
      <input type="hidden" name="statementId" value={statementId} />
      <PendingButton label="Rebuild" busyLabel="…" small />
      {state && state.ok && (
        <span className="text-[11px] text-success ml-2">Done.</span>
      )}
      {state && !state.ok && (
        <span className="text-[11px] text-danger ml-2">{state.error}</span>
      )}
    </form>
  );
}

export function RebuildOwnerTransparencyForm() {
  const [state, action] = useFormState(
    rebuildStatementTransparencyForOwnerAction,
    null,
  );
  return (
    <form action={action} className="flex items-center gap-2">
      <input
        name="ownerId"
        placeholder="Owner UUID"
        className="rounded-md border border-line-soft bg-surface px-3 py-2 text-sm font-mono w-72"
        required
      />
      <PendingButton label="Rebuild owner" busyLabel="Rebuilding…" />
      {state && state.ok && (
        <span className="text-[11px] text-success">
          {state.statementsProcessed ?? 0} statement
          {state.statementsProcessed === 1 ? "" : "s"}.
        </span>
      )}
      {state && !state.ok && (
        <span className="text-[11px] text-danger">{state.error}</span>
      )}
    </form>
  );
}

export function AcknowledgeWarningButton({
  warningId,
}: {
  warningId: string;
}) {
  const [_state, action] = useFormState(acknowledgeStatementWarningAction, null);
  return (
    <form action={action} className="inline-block">
      <input type="hidden" name="warningId" value={warningId} />
      <PendingButton label="Acknowledge" busyLabel="…" small />
    </form>
  );
}

export function ResolveWarningButton({ warningId }: { warningId: string }) {
  const [_state, action] = useFormState(resolveStatementWarningAction, null);
  return (
    <form action={action} className="inline-block">
      <input type="hidden" name="warningId" value={warningId} />
      <PendingButton label="Resolve" busyLabel="…" small variant="secondary" />
    </form>
  );
}

export function DismissWarningButton({ warningId }: { warningId: string }) {
  const [_state, action] = useFormState(dismissStatementWarningAction, null);
  return (
    <form action={action} className="inline-block">
      <input type="hidden" name="warningId" value={warningId} />
      <PendingButton label="Dismiss" busyLabel="…" small variant="destructive" />
    </form>
  );
}
