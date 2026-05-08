"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { RevokeConfirmDialog } from "@/components/ui/primitives";
import { revokeGuestStayTokenAction } from "@/features/guest-stays/actions";

/**
 * Stage 10.E.7 — wrapped the destructive Revoke action in
 * <RevokeConfirmDialog> from the 10.D primitives. Revocation kills
 * an active guest stay token immediately; the confirm dialog ensures
 * an operator can't bump the button accidentally.
 */
export function RevokeTokenButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState<string>("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        placeholder="Reason (optional)"
        className="h-9 px-3 rounded-sm border border-line-soft bg-canvas text-sm text-ink"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={400}
      />
      {error && <span className="text-xs text-danger">{error}</span>}
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => setConfirmOpen(true)}
      >
        {pending ? "Revoking…" : "Revoke"}
      </Button>
      <RevokeConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={async () => {
          setError(null);
          await new Promise<void>((resolve, reject) => {
            startTransition(async () => {
              const fd = new FormData();
              fd.set("id", id);
              if (reason.trim()) fd.set("reason", reason.trim());
              const res = await revokeGuestStayTokenAction(null, fd);
              if (!res.ok) {
                setError(res.error);
                reject(new Error(res.error));
                return;
              }
              resolve();
            });
          });
        }}
        entityName="this guest stay token"
        description="Once revoked, the guest's stay-app session ends immediately. They will need a new token to re-enter."
      />
    </div>
  );
}
