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
import { upsertEmergencyContactAction } from "@/features/villa-guides/actions";

const TYPES = [
  "manager",
  "concierge",
  "emergency",
  "hospital",
  "police",
  "fire",
  "security",
  "maintenance",
  "driver",
  "other",
] as const;

export function ContactForm({
  villas,
  projects,
  onSuccess,
  onCancel,
}: {
  villas: { id: string; label: string }[];
  projects: { id: string; label: string }[];
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [state, dispatch] = useActionState(upsertEmergencyContactAction, null);
  useEffect(() => {
    if (state?.ok && state.contactId) {
      if (onSuccess) onSuccess();
      else router.push("/dashboard/villa-guides/emergency-contacts");
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
            <SubmitButton>Save</SubmitButton>
          </>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Villa (optional)">
            <select name="villaId" className={selectCls} defaultValue="">
              <option value="">— project / global —</option>
              {villas.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Project (optional)">
            <select name="projectId" className={selectCls} defaultValue="">
              <option value="">—</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Type" required>
            <select name="contactType" required className={selectCls} defaultValue="">
              <option value="">Select…</option>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Label" required>
            <input type="text" name="label" required maxLength={160} className={inputCls} />
          </Field>
          <Field label="Sort order">
            <input type="number" name="sortOrder" min={0} max={1000} defaultValue={0} className={inputCls} />
          </Field>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Phone">
            <input type="text" name="phone" maxLength={40} className={inputCls} />
          </Field>
          <Field label="WhatsApp">
            <input type="text" name="whatsapp" maxLength={40} className={inputCls} />
          </Field>
          <Field label="Email">
            <input type="email" name="email" maxLength={160} className={inputCls} />
          </Field>
        </div>
        <Field label="Address">
          <textarea name="address" rows={2} maxLength={500} className={textareaCls} />
        </Field>
        <Field label="Notes (Markdown)">
          <textarea name="notesMd" rows={3} maxLength={2000} className={textareaCls} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="guestVisible" defaultChecked />
          Visible to guest
        </label>
      </FormShell>
    </form>
  );
}
