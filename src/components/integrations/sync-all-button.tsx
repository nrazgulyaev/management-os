"use client";

import { useState, useTransition } from "react";
import { RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { syncAllActiveCalendarFeedsAction } from "@/features/integrations/calendar-sync/actions";

export function SyncAllButton() {
  const [pending, startTransition] = useTransition();
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onClick = () => {
    setSummary(null);
    setError(null);
    startTransition(async () => {
      const res = await syncAllActiveCalendarFeedsAction();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const total = res.results ?? [];
      const inserted = total.reduce((acc, r) => acc + r.inserted, 0);
      const updated = total.reduce((acc, r) => acc + r.updated, 0);
      const conflicts = total.reduce((acc, r) => acc + r.conflicts, 0);
      setSummary(
        total.length === 0
          ? "No active feeds."
          : `Synced ${total.length} feed${total.length === 1 ? "" : "s"} · ${inserted} new · ${updated} updated · ${conflicts} conflicts.`,
      );
    });
  };

  return (
    <div className="flex items-center gap-3">
      <Button onClick={onClick} disabled={pending}>
        <RefreshCcw className="w-4 h-4" strokeWidth={1.75} />
        Sync all feeds
      </Button>
      {summary && <span className="text-xs text-ink-tertiary">{summary}</span>}
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
