"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FormShell,
  Field,
  inputCls,
  selectCls,
} from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { Button } from "@/components/ui/button";
import { createVillaMaintenancePlanAction } from "@/features/maintenance-intelligence/actions";

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

export interface TemplateOption {
  id: string;
  label: string;
  defaultFrequency: string;
  defaultIntervalDays: number | null;
  defaultDurationMinutes: number;
  defaultPriority: string;
  canBeDoneWhileOccupied: boolean;
  guestDisruptionLevel: string;
  requiresVillaEmpty: boolean;
}

export function PlanForm({
  villas,
  templates,
  onSuccess,
  onCancel,
}: {
  villas: { id: string; label: string }[];
  templates: TemplateOption[];
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [state, dispatch] = useActionState(
    createVillaMaintenancePlanAction,
    null,
  );
  const [templateId, setTemplateId] = useState<string>("");
  const tpl = useMemo(
    () => templates.find((t) => t.id === templateId),
    [templates, templateId],
  );

  useEffect(() => {
    if (state?.ok && state.planId) {
      if (onSuccess) onSuccess();
      else router.push(`/dashboard/maintenance-intelligence/plans/${state.planId}`);
    }
  }, [state, router, onSuccess]);

  return (
    <form action={dispatch}>
      <FormShell
        footer={
          <>
            {state && !state.ok && (
              <span className="text-xs text-danger mr-auto">{state.error}</span>
            )}
            <Button
              type="button"
              variant="ghost"
              onClick={() => (onCancel ? onCancel() : router.back())}
            >
              Cancel
            </Button>
            <SubmitButton>Create plan</SubmitButton>
          </>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Villa" required>
            <select name="villaId" required className={selectCls} defaultValue="">
              <option value="">Select villa…</option>
              {villas.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Template" required>
            <select
              name="templateId"
              required
              className={selectCls}
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
            >
              <option value="">Select template…</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Plan name" required>
          <input
            type="text"
            name="planName"
            required
            maxLength={160}
            className={inputCls}
            placeholder="e.g. AC service · ES-S5"
          />
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Frequency" required>
            <select
              name="frequency"
              required
              className={selectCls}
              defaultValue={tpl?.defaultFrequency ?? "monthly"}
              key={tpl?.defaultFrequency ?? "default"}
            >
              {FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Custom interval (days)">
            <input
              type="number"
              name="intervalDays"
              min={1}
              max={3650}
              defaultValue={tpl?.defaultIntervalDays ?? undefined}
              key={tpl?.defaultIntervalDays ?? "iv-default"}
              className={inputCls}
            />
          </Field>
          <Field label="Duration (minutes)">
            <input
              type="number"
              name="durationMinutes"
              min={5}
              max={1440}
              defaultValue={tpl?.defaultDurationMinutes ?? 60}
              key={tpl?.defaultDurationMinutes ?? "dm-default"}
              className={inputCls}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Priority">
            <select
              name="priority"
              className={selectCls}
              defaultValue={tpl?.defaultPriority ?? "normal"}
              key={tpl?.defaultPriority ?? "pr-default"}
            >
              <option value="low">low</option>
              <option value="normal">normal</option>
              <option value="high">high</option>
              <option value="urgent">urgent</option>
            </select>
          </Field>
          <Field label="Guest disruption">
            <select
              name="guestDisruptionLevel"
              className={selectCls}
              defaultValue={tpl?.guestDisruptionLevel ?? "low"}
              key={tpl?.guestDisruptionLevel ?? "gd-default"}
            >
              <option value="none">none</option>
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="canBeDoneWhileOccupied"
              defaultChecked={tpl?.canBeDoneWhileOccupied ?? true}
              key={`coc-${tpl?.id ?? "default"}`}
            />
            Can be done while occupied
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="requiresVillaEmpty"
              defaultChecked={tpl?.requiresVillaEmpty ?? false}
              key={`rve-${tpl?.id ?? "default"}`}
            />
            Requires villa empty
          </label>
        </div>
      </FormShell>
    </form>
  );
}
