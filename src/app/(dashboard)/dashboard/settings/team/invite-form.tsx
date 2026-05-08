"use client";

import { useState, useTransition } from "react";
import { inviteTeamMemberAction } from "@/features/team/actions";

const VALID_ROLES = [
  "marketing_staff",
  "qs_analyst",
  "procurement_manager",
  "warehouse_manager",
  "site_supervisor",
  "sales_manager",
  "project_manager",
  "cfo_accountant",
  "executive_ceo",
  "admin",
] as const;

export function InviteForm() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function submit(formData: FormData) {
    setError(null);
    setSuccess(null);
    const email = String(formData.get("email") ?? "").trim();
    const roleKey = String(formData.get("roleKey") ?? "");
    const notes = String(formData.get("notes") ?? "").trim();

    startTransition(async () => {
      const result = await inviteTeamMemberAction({
        email,
        roleKey: roleKey as (typeof VALID_ROLES)[number],
        scope: "company_wide",
        notes: notes || undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess(
        result.emailQueued
          ? `Invitation sent to ${email}.`
          : `Invitation created for ${email}, but email delivery is in dry-run mode (RESEND_API_KEY missing).`,
      );
    });
  }

  return (
    <form action={submit} className="grid grid-cols-1 md:grid-cols-3 gap-3 max-w-3xl">
      <label className="block text-sm">
        <span className="text-ink-secondary">Email</span>
        <input
          name="email"
          type="email"
          required
          className="mt-1 w-full rounded border border-line-soft bg-canvas px-3 py-2 text-sm"
          placeholder="teammate@company.com"
        />
      </label>
      <label className="block text-sm">
        <span className="text-ink-secondary">Role</span>
        <select
          name="roleKey"
          required
          defaultValue="marketing_staff"
          className="mt-1 w-full rounded border border-line-soft bg-canvas px-3 py-2 text-sm"
        >
          {VALID_ROLES.map((r) => (
            <option key={r} value={r}>
              {r.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm md:col-span-1">
        <span className="text-ink-secondary">Notes (optional)</span>
        <input
          name="notes"
          type="text"
          maxLength={500}
          className="mt-1 w-full rounded border border-line-soft bg-canvas px-3 py-2 text-sm"
          placeholder="e.g. project alpha lead"
        />
      </label>
      <div className="md:col-span-3 flex flex-col gap-2 mt-2">
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center rounded-full bg-ink px-4 py-2 text-sm font-medium text-ink-inverse hover:bg-ink/90 disabled:opacity-60"
          >
            {pending ? "Sending…" : "Send invitation"}
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
      </div>
    </form>
  );
}
