"use client";

import { useState, useTransition } from "react";
import {
  resendInvitationAction,
  revokeAccessAction,
} from "@/features/team/actions";

interface InvitationProps {
  kind: "invitation";
  invitationId: string;
}
interface UserProps {
  kind: "user";
  userId: string;
  currentStatus: string;
}
type Props = InvitationProps | UserProps;

export function TeamRowActions(props: Props) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handle(action: () => Promise<{ ok: boolean; error?: string }>): void {
    setFeedback(null);
    setError(null);
    startTransition(async () => {
      const r = await action();
      if (r.ok) setFeedback("✓");
      else setError(r.error ?? "Failed.");
    });
  }

  if (props.kind === "invitation") {
    return (
      <div className="inline-flex items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            handle(async () => {
              const r = await resendInvitationAction(props.invitationId);
              return r.ok ? { ok: true } : { ok: false, error: r.error };
            })
          }
          className="rounded-full border border-line-soft bg-surface px-3 py-1 text-xs hover:bg-muted/40 disabled:opacity-60"
        >
          {pending ? "…" : "Resend"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!confirm("Revoke this pending invitation?")) return;
            handle(async () => {
              const r = await revokeAccessAction({
                invitationId: props.invitationId,
              });
              return r.ok ? { ok: true } : { ok: false, error: r.error };
            });
          }}
          className="rounded-full border border-danger/30 bg-danger-weak/20 px-3 py-1 text-xs text-danger hover:bg-danger-weak/40 disabled:opacity-60"
        >
          Revoke
        </button>
        {feedback && <span className="text-xs text-success">{feedback}</span>}
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>
    );
  }

  // user kind
  if (props.currentStatus !== "active") {
    return (
      <span className="text-xs text-ink-tertiary">
        {props.currentStatus === "suspended" ? "Access revoked" : "—"}
      </span>
    );
  }
  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (
            !confirm(
              "Revoke this user's access? Their roles will be deactivated and they can no longer sign in to your workspace.",
            )
          )
            return;
          handle(async () => {
            const r = await revokeAccessAction({ userId: props.userId });
            return r.ok ? { ok: true } : { ok: false, error: r.error };
          });
        }}
        className="rounded-full border border-danger/30 bg-danger-weak/20 px-3 py-1 text-xs text-danger hover:bg-danger-weak/40 disabled:opacity-60"
      >
        Revoke access
      </button>
      {feedback && <span className="text-xs text-success">{feedback}</span>}
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
