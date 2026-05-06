"use client";

import { useState } from "react";

export function NotifyPaidButton({ token }: { token: string }) {
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function onClick() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/holds/${token}/deposit/notify-paid`, {
        method: "POST",
      });
      const json = (await res.json()) as { ok?: boolean; reason?: string };
      if (res.ok && json.ok) {
        setDone(true);
      } else {
        setError(json.reason ?? "could_not_notify");
      }
    } catch {
      setError("network_error");
    } finally {
      setSubmitting(false);
    }
  }
  if (done) {
    return (
      <p className="text-sm text-success">
        Thanks — our team will verify and confirm your booking shortly.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={submitting}
        className="h-9 px-4 rounded-full bg-ink text-ink-inverse text-xs font-medium hover:bg-ink/90 disabled:opacity-60"
      >
        {submitting ? "Notifying…" : "I have paid / request confirmation"}
      </button>
      {error && (
        <span className="text-xs text-danger">
          {error === "network_error"
            ? "Network error — please retry."
            : "Something went wrong. Please retry."}
        </span>
      )}
    </div>
  );
}
