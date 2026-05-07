"use client";

/**
 * Stage 7.F.A.2 — Maintenance ticket staff-assignment dropdown.
 *
 * Posts to `assignMaintenanceTicketAction` which bridges the assignment
 * via the ticket's linked operation_task (creating one if absent).
 */

import { useState, useTransition } from "react";
import { assignMaintenanceTicketAction } from "@/features/operations/actions";

export interface AssignableUser {
  id: string;
  fullName: string;
  email: string;
  roles: string[];
}

interface Props {
  ticketId: string;
  ticketStatus: string;
  currentAssigneeId: string | null;
  currentAssigneeName: string | null;
  users: AssignableUser[];
}

export function MaintenanceAssignDropdown({
  ticketId,
  ticketStatus,
  currentAssigneeId,
  currentAssigneeName,
  users,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (ticketStatus === "archived" || ticketStatus === "closed") {
    return (
      <div className="text-xs text-ink-tertiary">
        {currentAssigneeName ?? "—"}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-[10px] uppercase tracking-widest text-ink-tertiary">
        Assignee
      </div>
      <form
        action={(formData: FormData) => {
          formData.set("ticketId", ticketId);
          // assigneeId comes from select; scheduledFor optional
          startTransition(async () => {
            setError(null);
            setSuccess(null);
            const result = await assignMaintenanceTicketAction(null, formData);
            if (!result.ok) {
              setError(result.error ?? "Failed to assign");
            } else {
              setSuccess("Assigned ✓");
            }
          });
        }}
        className="flex items-end gap-2"
      >
        <select
          name="assigneeId"
          defaultValue={currentAssigneeId ?? ""}
          required
          disabled={pending}
          className="flex-1 rounded border border-stone-300 px-2 py-1 text-sm bg-white"
        >
          <option value="">— pick assignee —</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.fullName} {u.roles.length > 0 && `(${u.roles[0]})`}
            </option>
          ))}
        </select>
        <input
          type="date"
          name="scheduledFor"
          disabled={pending}
          className="rounded border border-stone-300 px-2 py-1 text-sm"
          title="Scheduled date (optional)"
        />
        <button
          type="submit"
          disabled={pending}
          className="text-xs px-3 py-1 rounded bg-stone-900 text-white hover:bg-stone-700 disabled:opacity-50"
        >
          {pending ? "..." : currentAssigneeId ? "Reassign" : "Assign"}
        </button>
      </form>
      {error && <div className="text-xs text-red-600">{error}</div>}
      {success && <div className="text-xs text-emerald-700">{success}</div>}
      {currentAssigneeName && !success && (
        <div className="text-xs text-ink-tertiary">
          Currently assigned: {currentAssigneeName}
        </div>
      )}
    </div>
  );
}
