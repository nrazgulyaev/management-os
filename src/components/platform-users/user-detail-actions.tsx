/**
 * Platform Admin OS — per-user action buttons.
 *
 * Three actions on /platform/users/[id]:
 *   - View dashboard — link into the user's org (read-only nav, no mutation)
 *   - Send password reset — emails a Supabase recovery link
 *   - Reset MFA — revokes the user's TOTP factor + recovery codes
 *
 * The two mutating actions open a confirm dialog, call the server action,
 * and surface the result inline. Audit events are written server-side; the
 * client only orchestrates confirmation + feedback.
 */

"use client";

import * as React from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EntityModal } from "@/components/forms/entity-modal";
import {
  resetMfaAction,
  sendPasswordResetAction,
} from "@/lib/platform-users/actions";

export function UserDetailActions({
  userId,
  email,
  organizationCode,
  mfaEnrolled,
}: {
  userId: string;
  email: string;
  organizationCode: string | null;
  mfaEnrolled: boolean;
}) {
  const [openAction, setOpenAction] = React.useState<
    "reset" | "mfa" | null
  >(null);
  const close = () => setOpenAction(null);

  return (
    <>
      {organizationCode ? (
        <Button asChild variant="secondary">
          <Link href={`/platform/${organizationCode}`}>
            View dashboard
            <ArrowUpRight className="w-4 h-4" strokeWidth={1.75} />
          </Link>
        </Button>
      ) : (
        <Button variant="secondary" disabled title="No organization linked">
          View dashboard
        </Button>
      )}

      <Button variant="secondary" onClick={() => setOpenAction("reset")}>
        Send password reset
      </Button>

      <Button
        variant="secondary"
        disabled={!mfaEnrolled}
        title={mfaEnrolled ? undefined : "No active MFA factor to reset"}
        onClick={() => setOpenAction("mfa")}
      >
        Reset MFA
      </Button>

      <EntityModal
        open={openAction === "reset"}
        onClose={close}
        title="Send password reset"
        description={`Email a password-reset link to ${email}. Audit-logged.`}
        size="md"
      >
        {openAction === "reset" && (
          <ConfirmForm
            confirmLabel="Send reset email"
            pendingLabel="Sending…"
            body={
              <>
                A Supabase recovery link will be emailed to{" "}
                <strong>{email}</strong>. The user sets a new password via the
                standard reset flow — no password is exposed to the operator.
              </>
            }
            run={() => sendPasswordResetAction(userId)}
            onDone={close}
          />
        )}
      </EntityModal>

      <EntityModal
        open={openAction === "mfa"}
        onClose={close}
        title="Reset MFA"
        description={`Revoke the MFA factor for ${email}. Audit-logged.`}
        size="md"
      >
        {openAction === "mfa" && (
          <ConfirmForm
            confirmLabel="Reset MFA"
            pendingLabel="Resetting…"
            destructive
            body={
              <>
                This revokes <strong>{email}</strong>'s current TOTP factor and
                all active recovery codes. The user will be prompted to
                re-enrol MFA on their next sign-in. Use only after verifying
                the request out-of-band (lost device, etc.).
              </>
            }
            run={() => resetMfaAction(userId)}
            onDone={close}
          />
        )}
      </EntityModal>
    </>
  );
}

function ConfirmForm({
  confirmLabel,
  pendingLabel,
  body,
  run,
  onDone,
  destructive = false,
}: {
  confirmLabel: string;
  pendingLabel: string;
  body: React.ReactNode;
  run: () => Promise<{ ok: boolean; error?: string }>;
  onDone: () => void;
  destructive?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = React.useState<string | null>(null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setErr(null);
        startTransition(async () => {
          const res = await run();
          if (!res.ok) {
            setErr(res.error ?? "Failed");
            return;
          }
          router.refresh();
          onDone();
        });
      }}
      className="flex flex-col gap-4 px-5 py-5"
    >
      <p className="text-sm text-ink-secondary leading-relaxed">{body}</p>
      {err && <p className="text-xs text-danger">{err}</p>}
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={pending}
          variant={destructive ? "destructive" : "primary"}
        >
          {pending ? pendingLabel : confirmLabel}
        </Button>
      </div>
    </form>
  );
}
