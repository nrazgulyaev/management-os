"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { refreshOperationsCopilotSummaryAction } from "@/features/ai/operations-copilot/actions";

export function OperationsCopilotRefreshButton() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [lastStatus, setLastStatus] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const r = await refreshOperationsCopilotSummaryAction();
            if (!r.ok) {
              setError(r.errorMessage ?? "refresh failed");
              return;
            }
            setLastStatus(
              r.fallbackUsed
                ? `fallback (${r.errorMessage ?? "no key / dry-run"})`
                : `succeeded in ${r.latencyMs}ms`,
            );
          });
        }}
      >
        <RefreshCw className="w-4 h-4 mr-1.5" />
        {pending ? "Refreshing…" : "Refresh"}
      </Button>
      {error && <span className="text-xs text-danger">{error}</span>}
      {lastStatus && !error && (
        <span className="text-xs text-ink-tertiary">{lastStatus}</span>
      )}
    </div>
  );
}
