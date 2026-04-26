"use client";

import { useTransition, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  approveOperationTaskAction,
  updateOperationTaskStatusAction,
} from "@/features/operations/actions";

const NEXT_FOR: Record<string, { to: string; label: string }[]> = {
  open: [{ to: "in_progress", label: "Start" }],
  scheduled: [{ to: "in_progress", label: "Start" }],
  in_progress: [{ to: "needs_review", label: "Submit for review" }],
  needs_review: [],
  completed: [],
  blocked: [{ to: "in_progress", label: "Resume" }],
};

export function TaskActionBar({
  taskId,
  status,
  canApprove,
  canCancel,
}: {
  taskId: string;
  status: string;
  canApprove: boolean;
  canCancel: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const transition = (to: string) => {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", taskId);
      fd.set("status", to);
      const res = await updateOperationTaskStatusAction(null, fd);
      if (!res.ok) setError(res.error);
    });
  };

  const approve = () => {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", taskId);
      const res = await approveOperationTaskAction(null, fd);
      if (!res.ok) setError(res.error);
    });
  };

  const next = NEXT_FOR[status] ?? [];

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {next.map((n) => (
        <Button key={n.to} size="sm" disabled={pending} onClick={() => transition(n.to)}>
          {n.label}
        </Button>
      ))}
      {canApprove && (status === "completed" || status === "needs_review") && (
        <Button size="sm" variant="secondary" disabled={pending} onClick={approve}>
          Approve
        </Button>
      )}
      {canCancel && status !== "approved" && status !== "cancelled" && (
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => transition("cancelled")}
        >
          Cancel task
        </Button>
      )}
      {error && <span className="text-xs text-danger ml-2">{error}</span>}
    </div>
  );
}
