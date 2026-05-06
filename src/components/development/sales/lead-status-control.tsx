"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { updateLeadStatus } from "@/lib/development/server/lead-actions";
import {
  LEAD_STATUSES,
  LEAD_STATUS_LABEL,
  type LeadStatus,
} from "@/lib/development/server/leads-constants";

export function LeadStatusControl({
  contactRoleId,
  currentStatus,
}: {
  contactRoleId: string;
  currentStatus: string;
}) {
  const [pending, startTransition] = React.useTransition();
  const [next, setNext] = React.useState<LeadStatus>(
    (LEAD_STATUSES as readonly string[]).includes(currentStatus)
      ? (currentStatus as LeadStatus)
      : "new",
  );
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  function submit() {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.append("contactRoleId", contactRoleId);
      fd.append("newStatus", next);
      if (notes) fd.append("notes", notes);
      const r = await updateLeadStatus(fd);
      if (!r.ok) setError(r.error ?? "Could not update.");
      setNotes("");
    });
  }

  const dirty = next !== currentStatus;

  return (
    <div className="rounded-md border border-line-soft bg-surface p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-label">Pipeline status</span>
        <span className="text-xs text-ink-tertiary font-mono">
          current: {currentStatus}
        </span>
      </div>
      <select
        value={next}
        onChange={(e) => setNext(e.target.value as LeadStatus)}
        className="h-10 rounded-sm border border-line-soft bg-surface px-3 text-sm text-ink focus:outline-none focus:border-line-strong"
      >
        {LEAD_STATUSES.map((s) => (
          <option key={s} value={s}>
            {LEAD_STATUS_LABEL[s]}
          </option>
        ))}
      </select>
      {dirty && (
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Reason / note for status change (optional)"
          className="h-9 rounded-sm border border-line-soft bg-surface px-3 text-sm text-ink focus:outline-none focus:border-line-strong"
        />
      )}
      {error && (
        <div className="rounded-sm border border-danger/30 bg-danger-weak/40 px-3 py-2 text-xs text-ink">
          {error}
        </div>
      )}
      <Button
        type="button"
        onClick={submit}
        disabled={!dirty || pending}
        className={cn(!dirty && "opacity-60")}
      >
        {pending ? "Saving…" : "Update status"}
      </Button>
    </div>
  );
}
