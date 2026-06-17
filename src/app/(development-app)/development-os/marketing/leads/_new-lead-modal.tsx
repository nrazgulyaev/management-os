"use client";

/**
 * "+ Lead" capture modal for the marketing leads index. Posts FormData
 * to the org-scoped `createLead` action (atomic contact + lead-role
 * upsert, dedup by email/phone, AI welcome draft best-effort). Options
 * (projects / lead sources) are loaded org-scoped on the server and
 * passed in. On success we refresh the index so the new attribution is
 * reflected. Mirrors the sales `_capture-lead-form` field set.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { createLead } from "@/lib/development/server/lead-actions";

export interface Option {
  id: string;
  name: string;
}

export function NewLeadModal({
  projects,
  leadSources,
}: {
  projects: Option[];
  leadSources: Option[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [err, setErr] = React.useState<string | null>(null);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const r = await createLead(fd);
      if (!r.ok) {
        setErr(r.error ?? "Could not create lead.");
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setErr(null);
          setOpen(true);
        }}
        className="btn btn-dark btn-sm"
      >
        + Lead
      </button>

      {open && (
        <div
          className="modal-overlay flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-lg border border-line-soft bg-surface p-5 shadow-xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-sm font-semibold mb-3">Capture new lead</h2>
            <form onSubmit={submit} className="space-y-3">
              <L label="Full name">
                <input name="fullName" required minLength={2} className={inputCls} placeholder="Jane Doe" />
              </L>
              <div className="grid grid-cols-2 gap-3">
                <L label="Email">
                  <input name="email" type="email" className={inputCls} placeholder="jane@example.com" />
                </L>
                <L label="Phone">
                  <input name="phone" type="tel" className={inputCls} placeholder="+62…" />
                </L>
                <L label="Preferred language">
                  <select name="preferredLanguage" defaultValue="en" className={inputCls}>
                    <option value="en">English</option>
                    <option value="ru">Russian</option>
                    <option value="id">Indonesian</option>
                    <option value="zh">Chinese</option>
                  </select>
                </L>
                <L label="Channel">
                  <select name="preferredCommunicationChannel" defaultValue="" className={inputCls}>
                    <option value="">— unspecified —</option>
                    <option value="email">Email</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="phone">Phone</option>
                    <option value="in_person">In person</option>
                  </select>
                </L>
                <L label="Project">
                  <select name="projectId" defaultValue="" className={inputCls}>
                    <option value="">— general inquiry —</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </L>
                <L label="Lead source">
                  <select name="sourceId" defaultValue="" className={inputCls}>
                    <option value="">— unattributed —</option>
                    {leadSources.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </L>
              </div>
              <L label="Initial message">
                <textarea name="initialMessage" rows={2} maxLength={2000} className={inputCls} placeholder="What did the lead ask?" />
              </L>

              <p className="text-[11px] text-ink-tertiary">
                Either email or phone is required.
              </p>

              {err && (
                <div className="rounded border border-danger/30 bg-danger-weak/40 px-3 py-2 text-xs text-ink">
                  {err}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={pending}
                  className="btn btn-secondary btn-sm"
                >
                  Cancel
                </button>
                <button type="submit" disabled={pending} className="btn btn-dark btn-sm">
                  {pending ? "Adding…" : "Add lead"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

const inputCls =
  "w-full rounded border border-line-soft bg-surface px-2 py-1 text-sm";

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-ink-secondary">
      {label}
      {children}
    </label>
  );
}
