"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputCls, selectCls, textareaCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { EntityModal } from "@/components/forms/entity-modal";
import { createLead } from "@/lib/development/server/lead-actions";

/**
 * Stage 6.P0.5 — Add Lead modal.
 *
 * Per Q3 decision: contacts are merged into leads. The createLead
 * action does the atomic upsert (contact + contact_role + lead) — this
 * form just collects the human-fields and posts FormData to it.
 *
 * Workflow verb: "Add lead" (the "Create lead" / "New lead" alternatives
 * read poorly when the form also dedupes existing contacts).
 */

const COMMUNICATION_CHANNELS = [
  { value: "email", label: "Email" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "phone", label: "Phone" },
  { value: "in_person", label: "In person" },
] as const;

export interface ProjectOption {
  id: string;
  name: string;
}

export interface LeadSourceOption {
  id: string;
  displayName: string;
}

export function LeadModalForm({
  projects,
  leadSources,
}: {
  projects: ProjectOption[];
  leadSources: LeadSourceOption[];
}) {
  const [open, setOpen] = useState(false);
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
        setOpen(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to add lead");
      }
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} data-testid="lead-add-trigger">
        <Plus className="w-4 h-4" strokeWidth={1.75} />
        Add lead
      </Button>
      <EntityModal
        open={open}
        onClose={() => setOpen(false)}
        title="Add lead"
        description="The lead form looks up the contact by email/phone — if a contact already exists, the new lead role attaches to it instead of creating a duplicate."
        size="lg"
      >
        <form action={handleSubmit} className="px-5 md:px-6 py-5 flex flex-col gap-5">
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
                  <option key={s.id} value={s.id}>{s.displayName}</option>
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
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-line-soft -mx-5 md:-mx-6 px-5 md:px-6 pt-4 mt-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <SubmitButton disabled={pending} pendingLabel="Adding…">Add lead</SubmitButton>
          </div>
        </form>
      </EntityModal>
    </>
  );
}
