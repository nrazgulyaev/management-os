"use client";

import { useTransition, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  archiveInAppNotificationAction,
  markInAppNotificationReadAction,
} from "@/features/notifications/actions";

export function InboxRowActions({ id, status }: { id: string; status: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (action: typeof markInAppNotificationReadAction) => {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", id);
      const res = await action(null, fd);
      if (!res.ok) setError(res.error);
    });
  };

  return (
    <div className="flex items-center gap-1">
      {status === "unread" && (
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => run(markInAppNotificationReadAction)}
        >
          Mark read
        </Button>
      )}
      {status !== "archived" && (
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => run(archiveInAppNotificationAction)}
        >
          Archive
        </Button>
      )}
      {error && <span className="text-xs text-danger ml-2">{error}</span>}
    </div>
  );
}
