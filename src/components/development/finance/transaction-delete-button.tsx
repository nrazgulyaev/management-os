"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { EntityModal } from "@/components/forms/entity-modal";
import { Button } from "@/components/ui/button";
import { deleteTransaction } from "@/lib/development/server/transaction-actions";

/**
 * HF-7 — per-row delete button for the transactions list.
 *
 * Confirmation modal calls the org-scoped deleteTransaction server
 * action. Failure paths (reconciled rows, capital-linked rows) come
 * back as an inline error in the modal.
 */
export function TransactionDeleteButton({
  transactionId,
  transactionCode,
}: {
  transactionId: string;
  transactionCode: string;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const out = await deleteTransaction(transactionId);
      if (out.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setError(out.reason);
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Delete ${transactionCode}`}
        className="inline-flex items-center justify-center w-7 h-7 rounded-md text-ink-tertiary hover:text-danger hover:bg-danger-weak/30 transition-colors"
      >
        <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
      </button>
      <EntityModal
        open={open}
        onClose={() => setOpen(false)}
        title={`Delete ${transactionCode}?`}
        size="sm"
      >
        <div className="px-5 md:px-6 py-5 flex flex-col gap-4">
          <p className="text-sm text-ink">
            This will permanently remove the transaction and reverse the
            bank-account balance change it caused. This action cannot be
            undone.
          </p>
          {error && (
            <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
              {error}
            </div>
          )}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-line-soft -mx-5 md:-mx-6 px-5 md:px-6 pt-4 mt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleDelete}
              disabled={pending}
              variant="destructive"
            >
              {pending ? "Deleting…" : "Delete transaction"}
            </Button>
          </div>
        </div>
      </EntityModal>
    </>
  );
}
