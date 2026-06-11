"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, inputCls, selectCls, textareaCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { createLead } from "@/lib/development/server/lead-actions";
import { DEVELOPMENT_APP_PATH } from "@/lib/development/constants";

/**
 * Full-page "Capture new lead" form for the sales-manager cabinet CTA.
 * Posts FormData straight to the org-scoped `createLead` action (atomic
 * contact + role + lead upsert) and routes to the new lead workspace on
 * success. Same fields as the in-board <LeadModalForm>.
 */

const COMMUNICATION_CHANNELS = [
  { value: "email", label: "Email" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "phone", label: "Phone" },
  { value: "in_person", label: "In person" },
] as const;

export interface Option {
  id: string;
  name: string;
}

export function CaptureLeadForm({
  projects,
  leadSources,
}: {
  projects: Option[];
  leadSources: Option[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await createLead(formData);
        if (!result.ok) {
          setError(result.error ?? "Failed to add lead");
          return;
        }
        router.push(`${DEVELOPMENT_APP_PATH}/sales/${result.contactRoleId}`);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to add lead");
      }
    });
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-5 max-w-2xl">
      {error && (
        <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
          {error}
        </div>
      )}
      <Field label="Full name" required>
        <input name="fullName" required minLength={2} placeholder="Jane Doe" className={inputCls} />
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Field label="Email" hint="Either email or phone is required">
          <input name="email" type="email" inputMode="email" className={inputCls} />
        </Field>
        <Field label="Phone" hint="E.164 format preferred">
          <input name="phone" type="tel" inputMode="tel" placeholder="+62…" className={inputCls} />
        </Field>
        <Field label="Preferred language">
          <select name="preferredLanguage" defaultValue="en" className={selectCls}>
            <option value="en">English</option>
            <option value="ru">Russian</option>
            <option value="id">Indonesian</option>
            <option value="zh">Chinese</option>
          </select>
        </Field>
        <Field label="Preferred communication channel">
          <select name="preferredCommunicationChannel" defaultValue="" className={selectCls}>
            <option value="">— unspecified —</option>
            {COMMUNICATION_CHANNELS.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Project of interest">
          <select name="projectId" defaultValue="" className={selectCls}>
            <option value="">— general inquiry —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Lead source">
          <select name="sourceId" defaultValue="" className={selectCls}>
            <option value="">— unattributed —</option>
            {leadSources.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Initial message" hint="What did the lead say or ask?">
        <textarea name="initialMessage" rows={3} className={textareaCls} maxLength={2000} />
      </Field>
      <Field label="Internal notes">
        <textarea name="notes" rows={2} className={textareaCls} maxLength={2000} placeholder="Optional" />
      </Field>
      <div className="flex items-center justify-end gap-3 pt-2 border-t border-line-soft">
        <Button type="button" variant="ghost" onClick={() => router.push(`${DEVELOPMENT_APP_PATH}/sales`)} disabled={pending}>
          Cancel
        </Button>
        <SubmitButton disabled={pending} pendingLabel="Adding…">Add lead</SubmitButton>
      </div>
    </form>
  );
}
