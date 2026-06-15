"use client";

/**
 * Wire-up — composer island for `schedulePushNotification`.
 *
 * `schedulePushNotification` had no caller. This island drives the
 * `composePushNotificationAction` "use server" adapter (../_actions.ts),
 * which org-scopes + permission-gates the send and returns the resulting
 * `dispatchCode`. Mirrors the canonical inline island
 * (development-os/cashflow-forecast/_controls.tsx): object-signature action
 * called inside `useTransition`, then `router.refresh()` to re-pull the
 * dispatch log.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Field, inputCls, selectCls, textareaCls } from "@/components/admin/form-shell";
import {
  composePushNotificationAction,
  type ComposePushInput,
} from "../_actions";
import type {
  OrgRoleLite,
  OrgSubscriptionLite,
  OrgUserLite,
} from "./_queries";

// Mirrors the `NotificationType` union in
// src/lib/development/server/push/dispatch-helpers.ts.
const NOTIFICATION_TYPES = [
  "critical_risks",
  "cash_gaps",
  "qa_qc_critical",
  "sales_followup_reminders",
  "schedule_slip_critical",
  "agent_output_ready",
  "missed_followup",
  "test_notification",
] as const;

type Target = "role" | "user" | "subscription";

export function ComposePushForm({
  users,
  subscriptions,
  roles,
}: {
  users: OrgUserLite[];
  subscriptions: OrgSubscriptionLite[];
  roles: OrgRoleLite[];
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [target, setTarget] = React.useState<Target>("role");
  const [targetValue, setTargetValue] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState<string | null>(null);

  // Reset the dependent target value whenever the target kind changes.
  React.useEffect(() => {
    setTargetValue("");
  }, [target]);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    setOk(null);
    const fd = new FormData(e.currentTarget);
    const input: ComposePushInput = {
      title: (fd.get("title") ?? "").toString().trim(),
      body: (fd.get("body") ?? "").toString().trim(),
      notificationType: (fd.get("notificationType") ?? "").toString(),
      target,
      targetValue: targetValue.trim(),
    };
    if (!input.targetValue) {
      setErr("Pick a recipient for the selected target.");
      return;
    }
    start(async () => {
      const r = await composePushNotificationAction(input);
      if (!r.ok) {
        setErr(r.error ?? "Failed to send.");
        return;
      }
      setOk(r.dispatchCode ?? "queued");
      (e.target as HTMLFormElement).reset?.();
      setTargetValue("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <Field label="Title" required>
        <input
          name="title"
          required
          minLength={2}
          maxLength={200}
          className={inputCls}
          placeholder="Cash gap flagged on Aurora"
        />
      </Field>

      <Field label="Body" required>
        <textarea
          name="body"
          required
          minLength={2}
          maxLength={500}
          rows={3}
          className={textareaCls}
          placeholder="Projected balance dips below reserve in week 6 — review forecast."
        />
      </Field>

      <Field label="Notification type" required>
        <select name="notificationType" className={selectCls} defaultValue="test_notification">
          {NOTIFICATION_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Field label="Target" required>
          <select
            className={selectCls}
            value={target}
            onChange={(e) => setTarget(e.target.value as Target)}
          >
            <option value="role">Role</option>
            <option value="user">User</option>
            <option value="subscription">Device (subscription)</option>
          </select>
        </Field>

        <Field
          label={
            target === "role"
              ? "Role"
              : target === "user"
                ? "User"
                : "Device"
          }
          required
          hint={
            target === "role"
              ? "Every active device of users holding this role."
              : target === "user"
                ? "All active devices for this user."
                : "A single subscribed device."
          }
        >
          <select
            className={selectCls}
            value={targetValue}
            onChange={(e) => setTargetValue(e.target.value)}
          >
            <option value="" disabled>
              Select…
            </option>
            {target === "role" &&
              roles.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.name} ({r.key})
                </option>
              ))}
            {target === "user" &&
              users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName} — {u.email}
                </option>
              ))}
            {target === "subscription" &&
              subscriptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.deviceLabel ?? "Unnamed device"}
                  {s.userFullName ? ` — ${s.userFullName}` : ""}
                  {s.deviceType ? ` (${s.deviceType})` : ""}
                </option>
              ))}
          </select>
        </Field>
      </div>

      {err && (
        <div className="rounded-sm border border-danger/30 bg-danger/5 px-3 py-2 text-[12px] text-danger">
          {err}
        </div>
      )}
      {ok && (
        <div className="rounded-sm border border-ok/30 bg-ok/5 px-3 py-2 text-[12px] text-ink-secondary">
          Push scheduled — dispatch code{" "}
          <span className="mono font-medium text-ink">{ok}</span>. See the
          dispatch log below for status.
        </div>
      )}

      <div className="flex items-center justify-end">
        <button
          type="submit"
          disabled={pending}
          className="btn btn-primary btn-sm disabled:opacity-50"
        >
          {pending ? "Sending…" : "Send push notification"}
        </button>
      </div>
    </form>
  );
}
