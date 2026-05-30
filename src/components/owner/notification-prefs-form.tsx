"use client";

import { useActionState } from "react";
import { updateOwnerNotificationPrefsAction } from "@/features/owner-portal/notification-prefs";
import type { OwnerNotificationPrefsView } from "@/features/owner-portal/notification-prefs-types";

const TOGGLES: {
  name: keyof OwnerNotificationPrefsView;
  label: string;
  helper: string;
}[] = [
  { name: "statementReady", label: "Statement ready", helper: "Email me when a new monthly statement is published." },
  { name: "maintenanceUpdates", label: "Maintenance updates", helper: "Tickets opened or resolved on my villas." },
  { name: "qReviewReminder", label: "Quarterly review reminder", helper: "Nudge ahead of each quarterly portfolio review." },
  { name: "arrivalAlerts", label: "Arrival alerts", helper: "When a guest checks in to one of my villas." },
  { name: "marketingUpdates", label: "Product & marketing", helper: "Occasional Arconique product news. Off by default." },
  { name: "taxDocReady", label: "Tax documents", helper: "Email me when a tax document is available." },
];

export function NotificationPrefsForm({
  initial,
}: {
  initial: OwnerNotificationPrefsView;
}) {
  const [state, dispatch] = useActionState(updateOwnerNotificationPrefsAction, null);

  return (
    <form action={dispatch} className="flex flex-col gap-3">
      <div className="flex flex-col divide-y divide-line-soft rounded-md border border-line-soft bg-canvas">
        {TOGGLES.map((t) => (
          <label
            key={t.name}
            className="flex items-center justify-between gap-4 px-4 py-3 cursor-pointer"
          >
            <span className="flex flex-col">
              <span className="text-sm text-ink">{t.label}</span>
              <span className="text-xs text-ink-tertiary">{t.helper}</span>
            </span>
            <input
              type="checkbox"
              name={t.name}
              defaultChecked={initial[t.name]}
              className="h-4 w-4 accent-ink shrink-0"
            />
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          className="h-9 px-4 rounded-full bg-ink text-ink-inverse text-xs font-medium hover:bg-ink/90"
        >
          Save notifications
        </button>
        {state?.ok && <span className="text-xs text-success">Saved.</span>}
        {state && !state.ok && (
          <span className="text-xs text-danger">{state.error}</span>
        )}
      </div>
      <p className="text-xs text-ink-tertiary">
        Unchecked boxes mean we won&apos;t email you about that event. Critical
        account and security notices are always sent.
      </p>
    </form>
  );
}
