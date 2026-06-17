"use client";

/**
 * "Cancel PO" action for the material PO detail page.
 *
 * Prompts for a cancellation reason (min 3 chars) and routes through
 * the org-scoped, audited `cancelMaterialPO` server action. The caller
 * is responsible for hiding this button once the PO is fully delivered
 * (or already cancelled) — it is only rendered for in-flight POs.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban } from "lucide-react";
import { cancelMaterialPO } from "@/lib/development/server/material-actions";

export function CancelPoButton({ poId }: { poId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleCancel() {
    const reason = window.prompt(
      "Reason for cancelling this PO (required, min 3 chars):",
    );
    if (reason === null) return;
    if (reason.trim().length < 3) {
      setError("Cancellation reason is required (min 3 characters).");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await cancelMaterialPO(poId, reason.trim());
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to cancel PO");
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={handleCancel}
        disabled={pending}
        className="btn btn-secondary justify-center w-full text-danger"
      >
        <Ban className="w-4 h-4" strokeWidth={1.75} />
        {pending ? "Cancelling…" : "Cancel PO"}
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
