"use client";

import { useState, useTransition } from "react";
import { inviteTeamMemberAction } from "@/features/team/actions";

// Cabinet (Dev-OS) roles only. `owner` is intentionally NOT here — owner
// invitations are created from the owner record's "Invite to portal" action.
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
  const [acceptUrl, setAcceptUrl] = useState<string | null>(null);

  function submit(formData: FormData) {
    setError(null);
    setSuccess(null);
    setAcceptUrl(null);
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
      // Honest messaging: only claim "sent" when the email was REALLY
      // delivered. In dry-run / no-RESEND mode, surface the link to share.
      if (result.emailDelivered) {
        setSuccess(`Invitation sent to ${email}.`);
      } else {
        setSuccess(
          `Invite created for ${email} — email not sent (dry-run). Share this link:`,
        );
        setAcceptUrl(result.acceptUrl);
      }
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
          <button type="submit" disabled={pending} className="btn btn-accent btn-sm">
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
        {acceptUrl && (
          <div className="rounded border border-line-soft bg-muted/20 px-3 py-2">
            <code className="mono text-[11px] break-all text-ink-2">{acceptUrl}</code>
          </div>
        )}
      </div>
    </form>
  );
}
