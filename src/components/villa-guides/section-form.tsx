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
import { upsertGuideSectionAction } from "@/features/villa-guides/actions";

const SECTION_KEYS = [
  "check_in",
  "wifi",
  "house_rules",
  "appliances",
  "amenities",
  "neighborhood",
  "transport",
  "emergency",
  "offline_pdf",
  "general",
] as const;

export function GuideSectionForm({
  villas,
  projects,
}: {
  villas: { id: string; label: string }[];
  projects: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [state, dispatch] = useActionState(upsertGuideSectionAction, null);
  useEffect(() => {
    if (state?.ok && state.sectionId) {
      router.push("/dashboard/villa-guides/sections");
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Section key" required>
            <select name="sectionKey" required className={selectCls} defaultValue="">
              <option value="">Select…</option>
              {SECTION_KEYS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Title" required>
            <input type="text" name="title" required maxLength={160} className={inputCls} />
          </Field>
        </div>
        <Field label="Body (Markdown)">
          <textarea
            name="bodyMd"
            rows={10}
            maxLength={8000}
            className={textareaCls}
            placeholder="Use markdown — headings, bullets, links."
          />
        </Field>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Sort order">
            <input type="number" name="sortOrder" min={0} max={1000} defaultValue={0} className={inputCls} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="guestVisible" defaultChecked />
            Visible to guest
          </label>
        </div>
      </FormShell>
    </form>
  );
}
