"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import {
  archiveCalendarFeedAction,
  pauseCalendarFeedAction,
  resumeCalendarFeedAction,
  syncCalendarFeedAction,
} from "@/features/integrations/calendar-sync/actions";

export function FeedActions({ id, status }: { id: string; status: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const run = (action: typeof syncCalendarFeedAction) => {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", id);
      const res = await action(null, fd);
      if (!res.ok) setError(res.error);
      else if ("result" in res && res.result) {
        const r = res.result;
        setInfo(
          `${r.fetched} events · ${r.inserted} new · ${r.updated} updated · ${r.cancelled} cancelled`,
        );
      }
    });
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Button size="sm" disabled={pending} onClick={() => run(syncCalendarFeedAction)}>
        <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.75} />
        Sync now
      </Button>
      {status === "active" ? (
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => run(pauseCalendarFeedAction)}
        >
          Pause
        </Button>
      ) : status === "paused" || status === "error" ? (
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => run(resumeCalendarFeedAction)}
        >
          Resume
        </Button>
      ) : null}
      {status !== "archived" && (
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => run(archiveCalendarFeedAction)}
        >
          Archive
        </Button>
      )}
      {info && <span className="text-xs text-ink-tertiary ml-1">{info}</span>}
      {error && <span className="text-xs text-danger ml-1">{error}</span>}
    </div>
  );
}
