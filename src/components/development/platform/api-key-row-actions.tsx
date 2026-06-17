"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { revokeApiKey } from "@/lib/development/server/api/api-key-actions";

/**
 * Per-row revoke control for the API keys table. Calls the existing
 * org-scoped `revokeApiKey` action (it derives org + actor server-side;
 * never trusts a client org). Two-click confirm to avoid accidental
 * revocation. Only rendered for active keys.
 */
export function ApiKeyRevokeButton({ keyId }: { keyId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const revoke = () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await revokeApiKey({ keyId, reason: "Revoked from settings" });
      if (result.ok) {
        setConfirming(false);
        router.refresh();
      } else {
        setError(result.error ?? "Revoke failed");
      }
    });
  };

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={revoke}
        disabled={pending}
        className="text-xs text-danger hover:underline disabled:opacity-50"
        data-testid={`api-key-revoke-${keyId}`}
      >
        {pending && <Loader2 className="w-3 h-3 animate-spin inline mr-1" />}
        {confirming ? "Confirm revoke" : "Revoke"}
      </button>
      {confirming && !pending && (
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="text-xs text-ink-3 hover:underline"
        >
          Cancel
        </button>
      )}
      {error && <span className="text-[10px] text-danger">{error}</span>}
    </span>
  );
}
