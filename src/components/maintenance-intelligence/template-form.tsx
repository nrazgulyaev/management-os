"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  FormShell,
  Field,
  inputCls,
  selectCls,
  textareaCls,
} from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { Button } from "@/components/ui/button";
import { createMaintenanceTemplateAction } from "@/features/maintenance-intelligence/actions";

const CATEGORIES = [
  "ac",
  "pool",
  "pest_control",
  "garden",
  "pump",
  "water_system",
  "electrical",
  "smart_lock",
  "wifi",
  "roof",
  "drainage",
  "fire_safety",
  "general",
] as const;
const FREQUENCIES = [
  "daily",
  "twice_weekly",
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
  "yearly",
  "custom",
] as const;

export function TemplateForm() {
  const router = useRouter();
  const [state, dispatch] = useActionState(createMaintenanceTemplateAction, null);
  useEffect(() => {
    if (state?.ok && state.templateId) {
      router.push("/dashboard/maintenance-intelligence/templates");
    }
  }, [state, router]);
  return (
    <form action={dispatch}>
      <FormShell
        footer={
          <>
            {state && !state.ok && (
              <span className="text-xs text-danger mr-auto">{state.error}</span>
            )}
            <Button type="button" variant="ghost" onClick={() => router.back()}>
              Cancel
            </Button>
            <SubmitButton>Create template</SubmitButton>
          </>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Key" required>
            <input
              type="text"
              name="key"
              required
              maxLength={80}
              className={inputCls}
              placeholder="ac_quarterly_service"
            />
          </Field>
          <Field label="Name" required>
            <input type="text" name="name" required maxLength={160} className={inputCls} />
          </Field>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Category" required>
            <select name="category" required className={selectCls} defaultValue="">
              <option value="">Select…</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Default frequency" required>
            <select name="defaultFrequency" required className={selectCls} defaultValue="monthly">
              {FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Custom interval (days)">
            <input type="number" name="defaultIntervalDays" min={1} max={3650} className={inputCls} />
          </Field>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Duration (minutes)">
            <input
              type="number"
              name="defaultDurationMinutes"
              min={5}
              max={1440}
              defaultValue={60}
              className={inputCls}
            />
          </Field>
          <Field label="Default priority">
            <select name="defaultPriority" className={selectCls} defaultValue="normal">
              <option value="low">low</option>
              <option value="normal">normal</option>
              <option value="high">high</option>
              <option value="urgent">urgent</option>
            </select>
          </Field>
          <Field label="Guest disruption">
            <select name="guestDisruptionLevel" className={selectCls} defaultValue="low">
              <option value="none">none</option>
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="canBeDoneWhileOccupied" defaultChecked />
            Can be done while occupied
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="requiresVillaEmpty" />
            Requires villa empty
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="requiresOwnerVisibility" />
            Visible to owner
          </label>
        </div>
        <Field label="Description">
          <textarea name="description" rows={3} maxLength={1000} className={textareaCls} />
        </Field>
      </FormShell>
    </form>
  );
}
