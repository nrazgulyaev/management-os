"use client";

import { useState, useTransition } from "react";
import { Loader2, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { approveSharedCostAllocation } from "@/lib/development/server/shared-costs/shared-cost-actions";

/**
 * Approve a draft allocation. Atomic on the server: marks status
 * 'applied' + creates derivative dev_transactions per line all in
 * one transaction.
 */
export function SharedCostApproveButton({
  allocationId,
}: {
  allocationId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <Button
        size="sm"
        disabled={pending || result != null}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              const out = await approveSharedCostAllocation({ allocationId });
              setResult(`Created ${out.derivativeCount} derivative transactions.`);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Approve failed");
            }
          });
        }}
      >
        {pending ? (
          <Loader2 className="w-3 h-3 animate-spin mr-1" />
        ) : (
          <CheckCircle className="w-3 h-3 mr-1" />
        )}
        Approve allocation
      </Button>
      {error && <p className="text-xs text-danger">{error}</p>}
      {result && <p className="text-xs text-success">{result}</p>}
    </div>
  );
}
