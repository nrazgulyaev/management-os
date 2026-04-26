"use client";

import { useTransition, useState } from "react";
import { Button } from "@/components/ui/button";
import { updateMaintenanceTicketStatusAction } from "@/features/operations/actions";

const NEXT: Record<string, { to: string; label: string }[]> = {
  open: [
    { to: "triaged", label: "Triage" },
    { to: "scheduled", label: "Schedule" },
    { to: "in_progress", label: "Start" },
  ],
  triaged: [
    { to: "scheduled", label: "Schedule" },
    { to: "waiting_parts", label: "Wait on parts" },
    { to: "in_progress", label: "Start" },
  ],
  scheduled: [
    { to: "in_progress", label: "Start" },
    { to: "waiting_parts", label: "Wait on parts" },
  ],
  waiting_parts: [{ to: "in_progress", label: "Resume" }],
  in_progress: [{ to: "resolved", label: "Mark resolved" }],
  resolved: [{ to: "closed", label: "Close ticket" }],
  closed: [],
  cancelled: [],
};

export function MaintenanceStatusActions({
  id,
  status,
}: {
  id: string;
  status: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const transition = (to: string) => {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", id);
      fd.set("status", to);
      const res = await updateMaintenanceTicketStatusAction(null, fd);
      if (!res.ok) setError(res.error);
    });
  };

  const next = NEXT[status] ?? [];

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {next.map((n) => (
        <Button key={n.to} size="sm" disabled={pending} onClick={() => transition(n.to)}>
          {n.label}
        </Button>
      ))}
      {!["closed", "cancelled"].includes(status) && (
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => transition("cancelled")}
        >
          Cancel
        </Button>
      )}
      {error && <span className="text-xs text-danger ml-2">{error}</span>}
    </div>
  );
}
