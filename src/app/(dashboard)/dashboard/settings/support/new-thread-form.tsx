"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSupportThreadAction } from "./actions";

const PRIORITIES = [
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent — production blocked" },
] as const;

export function NewThreadForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(formData: FormData) {
    setError(null);
    const subject = String(formData.get("subject") ?? "").trim();
    const priority = String(formData.get("priority") ?? "normal") as
      | "normal"
      | "high"
      | "urgent";
    const message = String(formData.get("message") ?? "").trim();

    startTransition(async () => {
      const result = await createSupportThreadAction({
        subject,
        priority,
        message,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/dashboard/settings/support/${result.threadId}`);
    });
  }

  return (
    <form action={submit} className="flex flex-col gap-3 max-w-3xl">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <label className="block text-sm md:col-span-2">
          <span className="text-ink-secondary">Subject</span>
          <input
            name="subject"
            type="text"
            required
            minLength={3}
            maxLength={200}
            className="mt-1 w-full rounded border border-line-soft bg-canvas px-3 py-2 text-sm"
            placeholder="e.g. Channel sync stuck on Booking.com"
          />
        </label>
        <label className="block text-sm">
          <span className="text-ink-secondary">Priority</span>
          <select
            name="priority"
            required
            defaultValue="normal"
            className="mt-1 w-full rounded border border-line-soft bg-canvas px-3 py-2 text-sm"
          >
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block text-sm">
        <span className="text-ink-secondary">Message</span>
        <textarea
          name="message"
          required
          maxLength={8000}
          rows={4}
          className="mt-1 w-full rounded border border-line-soft bg-canvas px-3 py-2 text-sm resize-y"
          placeholder="What happened, since when, and what you already tried."
        />
      </label>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="btn btn-accent btn-sm disabled:opacity-50"
        >
          {pending ? "Opening thread…" : "Open thread"}
        </button>
        {error && <span className="text-sm text-danger">{error}</span>}
      </div>
    </form>
  );
}
