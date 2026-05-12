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
import { upsertWifiAction } from "@/features/villa-guides/actions";

export interface WifiFormDefaults {
  id: string;
  villaId: string | null;
  projectId: string | null;
  networkName: string;
  instructionsMd: string | null;
  hasCiphertext: boolean;
}

export function WifiForm({
  villas,
  projects,
  wifi,
  onSuccess,
  onCancel,
}: {
  villas: { id: string; label: string }[];
  projects: { id: string; label: string }[];
  wifi?: WifiFormDefaults;
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [state, dispatch] = useActionState(upsertWifiAction, null);
  useEffect(() => {
    if (state?.ok && state.wifiId) {
      if (onSuccess) onSuccess();
      else router.push("/dashboard/villa-guides/wifi");
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
        {wifi && <input type="hidden" name="id" value={wifi.id} />}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Villa (optional)">
            <select
              name="villaId"
              className={selectCls}
              defaultValue={wifi?.villaId ?? ""}
            >
              <option value="">— project / global —</option>
              {villas.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Project (optional)">
            <select
              name="projectId"
              className={selectCls}
              defaultValue={wifi?.projectId ?? ""}
            >
              <option value="">—</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Network name" required>
            <input
              type="text"
              name="networkName"
              required
              maxLength={160}
              defaultValue={wifi?.networkName ?? ""}
              className={inputCls}
            />
          </Field>
          <Field label="Password — encrypted at rest (AES-256-GCM)">
            <input
              type="password"
              name="displayPassword"
              maxLength={160}
              autoComplete="off"
              className={inputCls}
              placeholder="Leave blank to keep the current password"
            />
          </Field>
        </div>
        <Field label="Instructions (Markdown)">
          <textarea
            name="instructionsMd"
            rows={4}
            maxLength={2000}
            defaultValue={wifi?.instructionsMd ?? ""}
            className={textareaCls}
          />
        </Field>
      </FormShell>
    </form>
  );
}
