"use client";

/**
 * DOMAIN 2 — assign/revoke INTERNAL (user_roles) cabinet roles from the app.
 *
 * Until now these could only be set by scripts. A super_admin / director can
 * now grant or revoke the dashboard cabinet roles (housekeeper, accountant,
 * director, …) here. Writes go through assignInternalRoleAction /
 * revokeInternalRoleAction (org-scoped + audited + permission-gated).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import {
  assignInternalRoleAction,
  revokeInternalRoleAction,
} from "@/features/team/actions";

interface Props {
  userId: string;
  userEmail: string;
  currentRoleKeys: string[];
  assignableRoles: Array<{ key: string; label: string }>;
  canManage: boolean;
}

export function InternalRolesForm({
  userId,
  userEmail,
  currentRoleKeys,
  assignableRoles,
  canManage,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>(
    assignableRoles[0]?.key ?? "",
  );

  const held = new Set(currentRoleKeys);
  const labelOf = (key: string) =>
    assignableRoles.find((r) => r.key === key)?.label ?? key.replace(/_/g, " ");

  function assign() {
    setError(null);
    setSuccess(null);
    if (!selected) return;
    startTransition(async () => {
      const r = await assignInternalRoleAction({ userId, roleKey: selected });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSuccess(
        r.alreadyHeld
          ? `${userEmail} already had the ${labelOf(selected)} role.`
          : `${userEmail} is now ${labelOf(selected)}.`,
      );
      router.refresh();
    });
  }

  function revoke(roleKey: string) {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const r = await revokeInternalRoleAction({ userId, roleKey });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSuccess(`Removed ${labelOf(roleKey)} from ${userEmail}.`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <p className="label mb-1.5">Current internal roles</p>
        {currentRoleKeys.length === 0 ? (
          <p className="text-xs text-ink-3">
            None. This user has no internal cabinet access yet.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {currentRoleKeys.map((k) => (
              <span key={k} className="inline-flex items-center gap-1.5">
                <Badge tone="info">{k.replace(/_/g, " ")}</Badge>
                {canManage && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => revoke(k)}
                    className="btn btn-ghost btn-sm"
                    title={`Remove ${labelOf(k)}`}
                  >
                    Remove
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
      </div>

      {canManage ? (
        assignableRoles.length === 0 ? (
          <p className="text-xs text-ink-3">
            No assignable internal roles are seeded in this database.
          </p>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <label className="block text-sm">
              <span className="text-ink-secondary">Add internal role</span>
              <select
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                className="mt-1 w-64 rounded border border-line-soft bg-canvas px-3 py-2 text-sm"
              >
                {assignableRoles.map((r) => (
                  <option key={r.key} value={r.key} disabled={held.has(r.key)}>
                    {r.label}
                    {held.has(r.key) ? " (held)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={pending || !selected || held.has(selected)}
              onClick={assign}
              className="btn btn-accent btn-sm"
            >
              {pending ? "Saving…" : "Grant role"}
            </button>
          </div>
        )
      ) : (
        <p className="text-xs text-ink-3">
          Only a super admin or director can change internal roles.
        </p>
      )}

      {error && (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="text-xs text-success" role="status">
          {success}
        </p>
      )}
    </div>
  );
}
