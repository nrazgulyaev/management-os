"use client";

import { useActionState } from "react";
import { createGuestServiceRequestAction } from "@/features/guest-stays/actions";

const CATEGORIES = [
  { value: "amenity", label: "Amenities" },
  { value: "maintenance", label: "Something broken" },
  { value: "concierge", label: "Concierge" },
  { value: "housekeeping", label: "Housekeeping" },
  { value: "transport", label: "Transport" },
  { value: "other", label: "Other" },
] as const;

const URGENCIES = [
  { value: "low", label: "Whenever's good" },
  { value: "normal", label: "Today" },
  { value: "high", label: "Urgent" },
] as const;

const CONTACT = [
  { value: "any", label: "Any" },
  { value: "phone", label: "Phone" },
  { value: "email", label: "Email" },
  { value: "in_app", label: "Through this page" },
] as const;

export function GuestServiceRequestForm({ token }: { token: string }) {
  const [state, dispatch] = useActionState(
    createGuestServiceRequestAction,
    null,
  );

  if (state?.ok) {
    return (
      <div className="rounded-xl border border-success/40 bg-success-weak/30 p-6">
        <h2 className="text-lg font-medium text-ink">Request received</h2>
        <p className="text-sm text-ink-secondary mt-2">
          Reference {state.requestCode}. Our team will follow up shortly. You
          can submit another request below.
        </p>
        <a
          href={`/stay/${token}/services`}
          className="text-xs text-ink hover:underline underline-offset-4 mt-3 inline-block"
        >
          New request
        </a>
      </div>
    );
  }

  return (
    <form action={dispatch} className="rounded-xl border border-line-soft bg-surface p-6 flex flex-col gap-5">
      <input type="hidden" name="token" value={token} />
      <Field label="What do you need?">
        <select
          name="category"
          required
          className="h-11 px-3 rounded-sm border border-line-soft bg-canvas text-sm text-ink"
          defaultValue=""
        >
          <option value="">Choose…</option>
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Title">
        <input
          type="text"
          name="title"
          required
          maxLength={160}
          className="h-11 px-3 rounded-sm border border-line-soft bg-canvas text-sm text-ink"
          placeholder="e.g. Extra towels, please"
        />
      </Field>
      <Field label="Details">
        <textarea
          name="description"
          rows={4}
          maxLength={2000}
          className="px-3 py-3 rounded-sm border border-line-soft bg-canvas text-sm text-ink resize-none"
        />
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="How urgent?">
          <select
            name="urgency"
            className="h-11 px-3 rounded-sm border border-line-soft bg-canvas text-sm text-ink"
            defaultValue="normal"
          >
            {URGENCIES.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Preferred time (optional)">
          <input
            type="datetime-local"
            name="preferredTime"
            className="h-11 px-3 rounded-sm border border-line-soft bg-canvas text-sm text-ink"
          />
        </Field>
      </div>
      <Field label="How should we reach you?">
        <select
          name="contactPreference"
          className="h-11 px-3 rounded-sm border border-line-soft bg-canvas text-sm text-ink"
          defaultValue="any"
        >
          {CONTACT.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </Field>
      {state && !state.ok && (
        <p className="text-xs text-danger">{state.error}</p>
      )}
      <button
        type="submit"
        className="h-12 px-5 rounded-full bg-ink text-ink-inverse text-sm font-medium hover:bg-ink/90 transition-colors"
      >
        Send request
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] uppercase tracking-widest text-ink-tertiary">
        {label}
      </span>
      {children}
    </label>
  );
}
