"use client";

import { useActionState } from "react";
import { Field, FormShell, inputCls, selectCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { updateCurrentUserNotificationPreferenceAction } from "@/features/notifications/actions";
import type { ActionResult } from "@/features/projects/actions";

const initial: ActionResult | null = null;

const COMMON_TEMPLATES = [
  "low_stock_alert",
  "internal_daily_digest",
];

export function SelfPreferenceForm() {
  const [state, dispatch] = useActionState(
    updateCurrentUserNotificationPreferenceAction,
    initial,
  );
  return (
    <form action={dispatch}>
      <FormShell
        title="Update your preference"
        description="Per-template, per-channel toggle + optional quiet hours. Most-specific row wins (you > owner > role > global)."
        footer={<SubmitButton>Save preference</SubmitButton>}
      >
        {state && !state.ok && (
          <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
            {state.error}
          </div>
        )}
        {state?.ok && (
          <div className="rounded-md border border-success/30 bg-success-weak/40 px-4 py-2.5 text-sm text-ink">
            Saved.
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Channel" required>
            <select name="channel" defaultValue="in_app" className={selectCls}>
              <option value="in_app">In-app</option>
              <option value="email">Email</option>
              <option value="sms">SMS</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="telegram">Telegram</option>
            </select>
          </Field>
          <Field label="Template" required>
            <select
              name="templateKey"
              defaultValue={COMMON_TEMPLATES[0]}
              className={selectCls}
            >
              {COMMON_TEMPLATES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Enabled">
            <select name="enabled" defaultValue="true" className={selectCls}>
              <option value="true">On</option>
              <option value="false">Off</option>
            </select>
          </Field>
          <Field label="Quiet hours start" hint="HH:MM (24h)">
            <input
              name="quietHoursStart"
              placeholder="22:00"
              pattern="\d{2}:\d{2}"
              className={inputCls}
            />
          </Field>
          <Field label="Quiet hours end" hint="HH:MM (24h)">
            <input
              name="quietHoursEnd"
              placeholder="07:00"
              pattern="\d{2}:\d{2}"
              className={inputCls}
            />
          </Field>
        </div>
      </FormShell>
    </form>
  );
}
