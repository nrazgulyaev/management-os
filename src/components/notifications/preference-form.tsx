"use client";

import Link from "next/link";
import { useState } from "react";
import { Field, FormShell, inputCls, selectCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { Button } from "@/components/ui/button";
import { useModalOrRouteForm } from "@/lib/forms/use-modal-or-route-form";
import { updateNotificationPreferenceAction } from "@/features/notifications/actions";
import type { ActionResult } from "@/features/projects/actions";

/**
 * Operator-level notification-preference editor. Backed by
 * `updateNotificationPreferenceAction` (perm `notifications.manage`,
 * org-scoped, upsert). The action keys insert-vs-update off the `id`
 * field: present → update the matching row, absent → insert a new row.
 *
 * Scope is mutually exclusive in practice (user > owner > role > global)
 * but the action stores whatever scope columns are posted; the form lets
 * the operator pick exactly one scope target (or none = global).
 *
 * Follows the Modal-First contract (`onSuccess`/`onCancel`) so the same
 * component drives both the "Add preference" modal and per-row "Edit".
 */

const CHANNELS = ["in_app", "email", "whatsapp", "sms", "telegram"] as const;

const CHANNEL_LABELS: Record<string, string> = {
  in_app: "In-app",
  email: "Email",
  whatsapp: "WhatsApp",
  sms: "SMS",
  telegram: "Telegram",
};

// Mirrors RoleKey (src/features/auth/permission-matrix.ts). The action
// stores role_key as free text (≤60), so this is a convenience picker,
// not an enforced enum.
const ROLE_KEYS = [
  "super_admin",
  "director",
  "operations_manager",
  "property_manager",
  "booking_manager",
  "revenue_manager",
  "finance_manager",
  "accountant",
  "concierge",
  "housekeeping_supervisor",
  "housekeeper",
  "technician",
  "procurement_manager",
  "security",
  "sales_manager",
  "investor_owner",
  "investor_viewer",
  "agent",
] as const;

export interface PreferenceFormValues {
  id?: string;
  appUserId?: string | null;
  ownerId?: string | null;
  roleKey?: string | null;
  channel?: string;
  templateKey?: string;
  enabled?: boolean;
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
}

export function PreferenceForm({
  initial,
  onSuccess,
  onCancel,
}: {
  /** When supplied, the form pre-fills + posts the row id (update path). */
  initial?: PreferenceFormValues;
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const { state, submitAction, pending } = useModalOrRouteForm<ActionResult>(
    updateNotificationPreferenceAction,
    { onSuccess },
  );
  // "scope" is a UI-only selector that decides which scope field renders;
  // the action reads appUserId / ownerId / roleKey directly from FormData.
  const initialScope: "global" | "user" | "owner" | "role" = initial?.appUserId
    ? "user"
    : initial?.ownerId
      ? "owner"
      : initial?.roleKey
        ? "role"
        : "global";
  const [scope, setScope] = useState(initialScope);

  return (
    <form action={submitAction}>
      <FormShell
        title={initial?.id ? "Edit preference" : "Add preference"}
        description="Per-user / per-owner / per-role channel preference with optional quiet hours. Most-specific row wins (you > owner > role > global)."
        footer={
          <>
            {onCancel && (
              <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
                Cancel
              </Button>
            )}
            <SubmitButton>{initial?.id ? "Save changes" : "Add preference"}</SubmitButton>
          </>
        }
      >
        {state && !state.ok && state.error && (
          <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
            {state.error}
          </div>
        )}

        {/* Upsert key — present only when editing an existing row. */}
        {initial?.id && <input type="hidden" name="id" value={initial.id} />}

        <Field label="Scope" hint="Who this preference applies to.">
          <select
            value={scope}
            onChange={(e) =>
              setScope(e.target.value as "global" | "user" | "owner" | "role")
            }
            className={selectCls}
          >
            <option value="global">Global (everyone)</option>
            <option value="user">Specific user</option>
            <option value="owner">Specific owner</option>
            <option value="role">Role</option>
          </select>
        </Field>

        {scope === "user" && (
          <Field
            label="App user ID"
            hint="UUID of the app_user this preference targets."
          >
            <input
              name="appUserId"
              defaultValue={initial?.appUserId ?? ""}
              placeholder="00000000-0000-0000-0000-000000000000"
              className={inputCls}
            />
          </Field>
        )}

        {scope === "owner" && (
          <Field label="Owner ID" hint="UUID of the owner this preference targets.">
            <input
              name="ownerId"
              defaultValue={initial?.ownerId ?? ""}
              placeholder="00000000-0000-0000-0000-000000000000"
              className={inputCls}
            />
          </Field>
        )}

        {scope === "role" && (
          <Field label="Role" hint="Applies to everyone holding this role.">
            <select
              name="roleKey"
              defaultValue={initial?.roleKey ?? ROLE_KEYS[0]}
              className={selectCls}
            >
              {ROLE_KEYS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Channel" required>
            <select
              name="channel"
              defaultValue={initial?.channel ?? "in_app"}
              className={selectCls}
            >
              {CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {CHANNEL_LABELS[c]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Template" required hint="Template key, e.g. low_stock_alert">
            <input
              name="templateKey"
              defaultValue={initial?.templateKey ?? ""}
              placeholder="low_stock_alert"
              className={inputCls}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Enabled">
            <select
              name="enabled"
              defaultValue={initial?.enabled === false ? "false" : "true"}
              className={selectCls}
            >
              <option value="true">On</option>
              <option value="false">Off</option>
            </select>
          </Field>
          <Field label="Quiet hours start" hint="HH:MM (24h)">
            <input
              name="quietHoursStart"
              defaultValue={initial?.quietHoursStart ?? ""}
              placeholder="22:00"
              pattern="\d{2}:\d{2}"
              className={inputCls}
            />
          </Field>
          <Field label="Quiet hours end" hint="HH:MM (24h)">
            <input
              name="quietHoursEnd"
              defaultValue={initial?.quietHoursEnd ?? ""}
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
