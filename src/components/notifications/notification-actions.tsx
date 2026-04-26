"use client";

import { useTransition, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  cancelNotificationAction,
  markNotificationFailedAction,
  markNotificationSentAction,
} from "@/features/notifications/actions";

export function NotificationActions({
  id,
  status,
  canManage,
  canWrite,
}: {
  id: string;
  status: string;
  canManage: boolean;
  canWrite: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (action: typeof markNotificationSentAction) => {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", id);
      const res = await action(null, fd);
      if (!res.ok) setError(res.error);
    });
  };

  if (status === "sent" || status === "cancelled") {
    return null;
  }

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {canManage && status === "queued" && (
        <Button size="sm" disabled={pending} onClick={() => run(markNotificationSentAction)}>
          Mark sent
        </Button>
      )}
      {canManage && status !== "failed" && (
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => run(markNotificationFailedAction)}
        >
          Mark failed
        </Button>
      )}
      {canWrite && status !== "cancelled" && (
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => run(cancelNotificationAction)}
        >
          Cancel
        </Button>
      )}
      {error && <span className="text-xs text-danger ml-2">{error}</span>}
    </div>
  );
}
