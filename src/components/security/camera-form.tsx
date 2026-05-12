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
import { createSecurityCameraDeviceAction } from "@/features/security/actions";

export function CameraForm({
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
  const [state, dispatch] = useActionState(
    createSecurityCameraDeviceAction,
    null,
  );

  useEffect(() => {
    if (state?.ok && state.cameraId) {
      if (onSuccess) onSuccess();
      else router.push("/dashboard/security/cameras");
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
            <SubmitButton>Create camera</SubmitButton>
          </>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Name" required>
            <input
              type="text"
              name="name"
              required
              maxLength={160}
              className={inputCls}
            />
          </Field>
          <Field label="Location label" required>
            <input
              type="text"
              name="locationLabel"
              required
              maxLength={160}
              className={inputCls}
              placeholder="e.g. Front gate, Pool deck"
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          <Field label="Villa (optional)">
            <select name="villaId" className={selectCls} defaultValue="">
              <option value="">—</option>
              {villas.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Provider">
            <input
              type="text"
              name="provider"
              maxLength={80}
              className={inputCls}
              placeholder="e.g. Reolink, Ubiquiti, Dahua"
            />
          </Field>
          <Field label="External app URL">
            <input
              type="url"
              name="externalAppUrl"
              maxLength={500}
              className={inputCls}
              placeholder="https://reolink.com/app/…"
            />
          </Field>
        </div>

        <Field label="Access role">
          <select name="accessRole" className={selectCls} defaultValue="">
            <option value="">—</option>
            <option value="security">security</option>
            <option value="operations_manager">operations_manager</option>
            <option value="super_admin">super_admin</option>
          </select>
        </Field>

        <Field label="Notes">
          <textarea name="notes" rows={3} maxLength={1000} className={textareaCls} />
        </Field>
      </FormShell>
    </form>
  );
}
