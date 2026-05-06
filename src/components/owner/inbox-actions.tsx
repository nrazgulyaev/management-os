"use client";

import { useTransition, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  archiveOwnerInboxAction,
  markOwnerInboxReadAction,
} from "@/features/notifications/actions";

export function OwnerInboxRowActions({
  id,
  status,
}: {
  id: string;
  status: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (action: typeof markOwnerInboxReadAction) => {
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
          onClick={() => run(markOwnerInboxReadAction)}
        >
          Mark read
        </Button>
      )}
      {status !== "archived" && (
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => run(archiveOwnerInboxAction)}
        >
          Archive
        </Button>
      )}
      {error && <span className="text-xs text-danger ml-2">{error}</span>}
    </div>
  );
}
