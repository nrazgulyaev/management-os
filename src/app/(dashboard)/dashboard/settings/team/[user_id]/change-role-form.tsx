"use client";

import { useState, useTransition } from "react";
import { updateUserRoleAction } from "@/features/team/actions";
import {
  ROLE_DESCRIPTIONS,
} from "@/features/team/role-descriptions";
import {
  VALID_CABINET_ROLES,
  type CabinetRoleKey,
} from "@/features/team/role-keys";

interface Props {
  userId: string;
  userEmail: string;
  currentRoleKey: string | null;
}

export function ChangeRoleForm({ userId, userEmail, currentRoleKey }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<CabinetRoleKey>(
    (currentRoleKey as CabinetRoleKey) ?? "marketing_staff",
  );
  const selectedDesc = ROLE_DESCRIPTIONS[selectedRole];

  function submit(formData: FormData) {
    setError(null);
    setSuccess(null);
    const reason = String(formData.get("reason") ?? "").trim();
    startTransition(async () => {
      const result = await updateUserRoleAction({
        userId,
        newRoleKey: selectedRole,
        scope: "company_wide",
        reason: reason || undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess(
        result.previousRoleKey === result.newRoleKey
          ? `${userEmail} already has the ${selectedDesc.label} role — no change.`
          : `${userEmail} is now ${selectedDesc.label}.`,
      );
    });
  }

  return (
    <form action={submit} className="space-y-4 max-w-2xl">
      <div>
        <label className="block text-sm">
          <span className="text-ink-secondary">New role</span>
          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value as CabinetRoleKey)}
            className="mt-1 w-full rounded border border-line-soft bg-canvas px-3 py-2 text-sm"
          >
            {VALID_CABINET_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_DESCRIPTIONS[r].label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="rounded border border-line-soft bg-muted/20 p-4 text-sm">
        <p className="font-medium">{selectedDesc.label}</p>
        <p className="mt-1 text-xs text-ink-secondary">{selectedDesc.blurb}</p>
        <ul className="mt-3 space-y-1 text-xs text-ink-secondary list-disc list-inside">
          {selectedDesc.highlights.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      </div>

      <div>
        <label className="block text-sm">
          <span className="text-ink-secondary">Reason (optional)</span>
          <input
            type="text"
            name="reason"
            maxLength={500}
            className="mt-1 w-full rounded border border-line-soft bg-canvas px-3 py-2 text-sm"
            placeholder="e.g. promotion to admin · project handoff"
          />
        </label>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center rounded-full bg-ink px-4 py-2 text-sm font-medium text-ink-inverse hover:bg-ink/90 disabled:opacity-60"
        >
          {pending ? "Updating…" : "Save role change"}
        </button>
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

      <p className="text-xs text-ink-tertiary">
        Changing the role replaces the user's current cabinet grant. The old
        grant is preserved in the history table for audit. Internal-bypass
        access (super_admin in user_roles) is not affected — it is reserved
        for founder + audit-bot accounts.
      </p>
    </form>
  );
}
