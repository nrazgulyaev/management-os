"use client";

import * as React from "react";
import { Toggle } from "@/components/owner-portal/toggle";
import { updateOwnerNotificationPrefsAction } from "@/features/owner-portal/notification-prefs";
import type { OwnerNotificationPrefsView } from "@/features/owner-portal/notification-prefs-types";

/**
 * redesign owner-07 — interactive notification toggles.
 *
 * Drives the prototype <Toggle> rows and persists every change through
 * the existing `updateOwnerNotificationPrefsAction` (optimistic local
 * state + a transition). Keeps the live save behaviour the old
 * NotificationPrefsForm had, in the new SettingsRow look.
 */

const FIELDS: {
  key: keyof OwnerNotificationPrefsView;
  label: string;
  helper: string;
}[] = [
  { key: "statementReady", label: "Statement ready", helper: "Email when Mgmt approves your monthly statement." },
  { key: "taxDocReady", label: "Statement reminder", helper: "Email 3 days before auto-acknowledgement." },
  { key: "arrivalAlerts", label: "Guest arrivals", helper: "SMS the day before each arrival." },
  { key: "maintenanceUpdates", label: "Maintenance updates", helper: "Email when Mgmt files a maintenance ticket." },
  { key: "qReviewReminder", label: "Quarterly digest", helper: "Email Q-summary from the Director on quarter-close." },
  { key: "marketingUpdates", label: "Inbox replies", helper: "Email when Mgmt replies in your inbox." },
];

export function OwnerNotificationToggles({
  initial,
  disabled,
}: {
  initial: OwnerNotificationPrefsView;
  disabled?: boolean;
}) {
  const [prefs, setPrefs] = React.useState(initial);
  const [pending, startTransition] = React.useTransition();
  const [status, setStatus] = React.useState<"idle" | "saved" | "error">("idle");

  function update(key: keyof OwnerNotificationPrefsView, next: boolean) {
    const updated = { ...prefs, [key]: next };
    setPrefs(updated);
    const fd = new FormData();
    for (const f of FIELDS) if (updated[f.key]) fd.set(f.key, "on");
    startTransition(async () => {
      const res = await updateOwnerNotificationPrefsAction(null, fd);
      setStatus(res.ok ? "saved" : "error");
    });
  }

  return (
    <>
      {FIELDS.map((f) => (
        <div className="settings-row" key={f.key}>
          <div className="sr-label">
            <div className="sr-label-text">{f.label}</div>
          </div>
          <div className="text-[13px] text-ink-2 leading-snug">{f.helper}</div>
          <div className="sr-action">
            <Toggle
              checked={prefs[f.key]}
              onCheckedChange={(n) => update(f.key, n)}
              ariaLabel={f.label}
              disabled={disabled || pending}
            />
          </div>
        </div>
      ))}
      <div
        className="mono"
        aria-live="polite"
        style={{
          fontSize: 11,
          letterSpacing: "0.08em",
          padding: "6px 4px 0",
          color: status === "error" ? "var(--danger)" : "var(--ink-4)",
        }}
      >
        {disabled
          ? "Read-only while impersonating."
          : status === "saved"
            ? "Saved."
            : status === "error"
              ? "Couldn't save — try again."
              : "Changes save automatically."}
      </div>
    </>
  );
}
