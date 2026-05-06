"use client";

import { useState, useTransition } from "react";
import { Loader2, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { selectQuotation } from "@/lib/development/server/procurement/procurement-actions";

/**
 * Select a winning quotation. Atomic on the server: marks winner +
 * rejects siblings + creates PO + links PR. The partial unique index
 * `procurement_quotations_selected_unique` enforces single-winner at
 * the DB level.
 */
export function QuotationSelectButton({
  quotationId,
}: {
  quotationId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showReason, setShowReason] = useState(false);

  return (
    <div className="space-y-2">
      {showReason ? (
        <div className="space-y-2">
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Selection reason (optional)"
            className="w-full rounded border border-line-soft p-1.5 text-xs"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={pending}
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  try {
                    await selectQuotation({
                      quotationId,
                      selectionReason: reason || undefined,
                    });
                  } catch (e) {
                    setError(
                      e instanceof Error ? e.message : "Select failed",
                    );
                  }
                });
              }}
            >
              {pending ? (
                <Loader2 className="w-3 h-3 animate-spin mr-1" />
              ) : (
                <CheckCircle className="w-3 h-3 mr-1" />
              )}
              Confirm + create PO
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowReason(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setShowReason(true)}
        >
          <CheckCircle className="w-3 h-3 mr-1" />
          Select this quotation
        </Button>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
