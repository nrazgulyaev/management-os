"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { transitionQaQcIssue } from "@/lib/development/server/qa-qc/qa-qc-actions";
import {
  QA_QC_VALID_TRANSITIONS,
  type QaQcStatus,
} from "@/lib/development/server/qa-qc/qa-qc-helpers";

/**
 * Operator-side: transition a QA/QC issue. The button set is computed
 * from the pure helper's transition table, so the UI stays in sync with
 * the validation rules automatically.
 */
export function QaQcTransitionActions({
  issueId,
  status,
}: {
  issueId: string;
  status: QaQcStatus;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const allowedTransitions = QA_QC_VALID_TRANSITIONS[status] ?? [];

  function transition(to: QaQcStatus) {
    setError(null);
    startTransition(async () => {
      try {
        await transitionQaQcIssue({ issueId, to });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Transition failed");
      }
    });
  }

  if (allowedTransitions.length === 0) {
    return (
      <p className="text-xs text-ink-tertiary">
        Status {status} is terminal — no further transitions allowed.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {allowedTransitions.map((to) => (
          <Button
            key={to}
            size="sm"
            variant={to === "closed" ? "secondary" : undefined}
            disabled={pending}
            onClick={() => transition(to)}
          >
            {pending && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
            → {to.replace(/_/g, " ")}
          </Button>
        ))}
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
