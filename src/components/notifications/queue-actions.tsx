"use client";

import { useTransition, useState } from "react";
import { Inbox, Send, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  deliverPendingNotificationsAction,
  queueDigestNowAction,
  retryNotificationAction,
} from "@/features/notifications/actions";

export function DeliverPendingButton() {
  const [pending, startTransition] = useTransition();
  const [info, setInfo] = useState<string | null>(null);

  const onClick = () => {
    setInfo(null);
    startTransition(async () => {
      const res = await deliverPendingNotificationsAction(null, new FormData());
      if (!res.ok) {
        setInfo(res.error);
        return;
      }
      const r = res as {
        sent?: number;
        failed?: number;
        suppressed?: number;
        notificationsChecked?: number;
      };
      setInfo(
        `Checked ${r.notificationsChecked ?? 0} · sent ${r.sent ?? 0} · failed ${r.failed ?? 0} · suppressed ${r.suppressed ?? 0}.`,
      );
    });
  };

  return (
    <div className="flex items-center gap-3">
      <Button onClick={onClick} disabled={pending}>
        <Send className="w-4 h-4" strokeWidth={1.75} />
        Deliver pending
      </Button>
      {info && <span className="text-xs text-ink-tertiary">{info}</span>}
    </div>
  );
}

export function QueueDigestNowButton() {
  const [pending, startTransition] = useTransition();
  const [info, setInfo] = useState<string | null>(null);
  const onClick = () => {
    setInfo(null);
    startTransition(async () => {
      const res = await queueDigestNowAction(null, new FormData());
      setInfo(res.ok ? "Digest queued." : res.error);
    });
  };
  return (
    <div className="flex items-center gap-3">
      <Button variant="secondary" onClick={onClick} disabled={pending}>
        <Inbox className="w-4 h-4" strokeWidth={1.75} />
        Queue digest now
      </Button>
      {info && <span className="text-xs text-ink-tertiary">{info}</span>}
    </div>
  );
}

export function RetryNotificationButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const onClick = () => {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", id);
      const res = await retryNotificationAction(null, fd);
      if (!res.ok) setError(res.error);
    });
  };
  return (
    <div className="flex items-center gap-1">
      <Button size="sm" variant="ghost" onClick={onClick} disabled={pending}>
        <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.75} />
        Retry
      </Button>
      {error && <span className="text-xs text-danger ml-2">{error}</span>}
    </div>
  );
}
