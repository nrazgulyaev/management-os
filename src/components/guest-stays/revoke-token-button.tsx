"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { revokeGuestStayTokenAction } from "@/features/guest-stays/actions";

export function RevokeTokenButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState<string>("");
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
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const fd = new FormData();
            fd.set("id", id);
            if (reason.trim()) fd.set("reason", reason.trim());
            const res = await revokeGuestStayTokenAction(null, fd);
            if (!res.ok) setError(res.error);
          });
        }}
      >
        {pending ? "Revoking…" : "Revoke"}
      </Button>
    </div>
  );
}
