"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { createLead } from "@/lib/development/server/lead-actions";
import { DEVELOPMENT_APP_PATH } from "@/lib/development/constants";

export function NewLeadDrawer({
  open,
  onOpenChange,
  projects,
  sources,
  agents,
  defaultProjectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: { id: string; name: string }[];
  sources: { code: string; category: string; id: string; campaignName?: string | null }[];
  agents: { id: string; name: string }[];
  defaultProjectId?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({});
  const [aiNote, setAiNote] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onOpenChange(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  React.useEffect(() => {
    if (!open) {
      setError(null);
      setFieldErrors({});
      setAiNote(null);
    }
  }, [open]);

  function onSubmit(formData: FormData) {
    setError(null);
    setFieldErrors({});
    setAiNote(null);
    startTransition(async () => {
      const result = await createLead(formData);
      if (!result.ok) {
        setError(result.error);
        if (result.fieldErrors) setFieldErrors(result.fieldErrors);
        return;
      }
      onOpenChange(false);
      router.push(`${DEVELOPMENT_APP_PATH}/sales/${result.contactRoleId}`);
      router.refresh();
    });
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]"
        onClick={() => onOpenChange(false)}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-lead-title"
        className="absolute right-0 top-0 h-full w-full max-w-md bg-canvas border-l border-line-soft shadow-[var(--shadow-floating)] flex flex-col"
      >
        <header className="px-6 h-16 border-b border-line-soft flex items-center justify-between">
          <h2
            id="new-lead-title"
            className="text-display text-[20px] font-medium text-ink"
          >
            New lead
          </h2>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="text-ink-tertiary hover:text-ink"
            aria-label="Close"
          >
            <X className="w-4 h-4" strokeWidth={1.75} />
          </button>
        </header>

        <form
          action={onSubmit}
          className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-5"
        >
          <p className="text-sm text-ink-secondary leading-relaxed">
            Creates a contact (deduped by email/phone), opens a{" "}
            <code className="font-mono text-xs">lead</code> role, and queues the
            AI Sales Assistant to draft a welcome reply for your review.
          </p>

          <Field
            name="fullName"
            label="Full name"
            placeholder="e.g. Wei Wang"
            required
            error={fieldErrors.fullName?.[0]}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field
              name="email"
              label="Email"
              type="email"
              placeholder="wei@example.com"
              error={fieldErrors.email?.[0]}
            />
            <Field
              name="phone"
              label="Phone"
              type="tel"
              placeholder="+62 …"
              error={fieldErrors.phone?.[0]}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              name="preferredLanguage"
              label="Language"
              defaultValue="en"
              options={[
                { value: "en", label: "English" },
                { value: "fr", label: "French" },
                { value: "es", label: "Spanish" },
                { value: "de", label: "German" },
                { value: "it", label: "Italian" },
                { value: "id", label: "Bahasa Indonesia" },
                { value: "zh", label: "Chinese" },
                { value: "ja", label: "Japanese" },
              ]}
            />
            <Select
              name="preferredCommunicationChannel"
              label="Channel"
              defaultValue=""
              options={[
                { value: "", label: "—" },
                { value: "whatsapp", label: "WhatsApp" },
                { value: "email", label: "Email" },
                { value: "phone", label: "Phone" },
                { value: "in_person", label: "In person" },
              ]}
            />
          </div>

          <Select
            name="projectId"
            label="Project of interest (optional)"
            defaultValue={defaultProjectId ?? ""}
            options={[
              { value: "", label: "Not specified" },
              ...projects.map((p) => ({ value: p.id, label: p.name })),
            ]}
          />

          <Select
            name="sourceId"
            label="Source"
            defaultValue=""
            options={[
              { value: "", label: "Not specified" },
              ...sources.map((s) => ({
                value: s.id,
                label: `${s.code}${s.campaignName ? ` · ${s.campaignName}` : ""}`,
              })),
            ]}
          />

          <Select
            name="agentId"
            label="Agent (if referred)"
            defaultValue=""
            options={[
              { value: "", label: "—" },
              ...agents.map((a) => ({ value: a.id, label: a.name })),
            ]}
          />

          <div className="flex flex-col gap-1.5">
            <label htmlFor="initialMessage" className="text-label">
              Initial message / inquiry
            </label>
            <textarea
              id="initialMessage"
              name="initialMessage"
              rows={4}
              placeholder="What did the lead say? Pasting their inbound message here gives the AI Sales Assistant the context to draft a thoughtful reply."
              className="rounded-sm border border-line-soft bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-tertiary focus:outline-none focus:border-line-strong"
            />
          </div>

          {error && (
            <div className="rounded-sm border border-danger/30 bg-danger-weak/40 px-3 py-2 flex items-start gap-2">
              <Badge tone="danger">Error</Badge>
              <span className="text-sm text-ink leading-relaxed">{error}</span>
            </div>
          )}
          {aiNote && (
            <div className="rounded-sm border border-accent/30 bg-accent-weak/40 px-3 py-2 text-sm text-ink leading-relaxed">
              {aiNote}
            </div>
          )}
        </form>

        <footer className="px-6 py-4 border-t border-line-soft flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={pending}
            onClick={(e) => {
              const form = e.currentTarget.closest("aside")?.querySelector("form");
              if (form) {
                e.preventDefault();
                form.requestSubmit();
              }
            }}
          >
            {pending ? "Creating…" : "Create lead"}
          </Button>
        </footer>
      </aside>
    </div>
  );
}

function Field({
  name,
  label,
  type = "text",
  required,
  placeholder,
  error,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-label">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        className={cn(
          "h-10 rounded-sm border bg-surface px-3 text-sm text-ink placeholder:text-ink-tertiary focus:outline-none",
          error
            ? "border-danger focus:border-danger"
            : "border-line-soft focus:border-line-strong",
        )}
      />
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}

function Select({
  name,
  label,
  defaultValue,
  options,
}: {
  name: string;
  label: string;
  defaultValue: string;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-label">
        {label}
      </label>
      <select
        id={name}
        name={name}
        defaultValue={defaultValue}
        className="h-10 rounded-sm border border-line-soft bg-surface px-3 text-sm text-ink focus:outline-none focus:border-line-strong"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
