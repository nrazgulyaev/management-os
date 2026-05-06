"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { acceptMaintenanceWindowSuggestionAction } from "@/features/maintenance-intelligence/actions";

export function SuggestionRow({
  suggestion,
}: {
  suggestion: {
    id: string;
    suggestedStart: string;
    suggestedEnd: string;
    score: number;
    reason: string | null;
    conflictCount: number;
    status: string;
  };
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const accept = () => {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", suggestion.id);
      const res = await acceptMaintenanceWindowSuggestionAction(null, fd);
      if (!res.ok) setError(res.error);
    });
  };

  return (
    <li className="p-4 flex items-start justify-between gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge tone={suggestion.score >= 0.8 ? "success" : suggestion.score >= 0.6 ? "info" : "warning"}>
            score {suggestion.score.toFixed(2)}
          </Badge>
          <Badge tone={suggestion.status === "suggested" ? "info" : "neutral"}>
            {suggestion.status}
          </Badge>
          {suggestion.conflictCount > 0 && (
            <Badge tone="warning">{suggestion.conflictCount} conflicts</Badge>
          )}
        </div>
        <div className="text-sm text-ink mt-1.5 tabular-nums">
          {suggestion.suggestedStart.slice(0, 16).replace("T", " ")} →{" "}
          {suggestion.suggestedEnd.slice(0, 16).replace("T", " ")}
        </div>
        {suggestion.reason && (
          <div className="text-xs text-ink-tertiary mt-1">{suggestion.reason}</div>
        )}
        {error && <div className="text-xs text-danger mt-2">{error}</div>}
      </div>
      <div className="shrink-0">
        {suggestion.status === "suggested" && (
          <Button size="sm" variant="secondary" disabled={pending} onClick={accept}>
            Accept
          </Button>
        )}
      </div>
    </li>
  );
}
