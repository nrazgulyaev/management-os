"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Direct-booking checkout form. NO payment fields — this is a stub
 * that posts contact + stay details to /api/v1/holds/<token>/submit.
 * On success, redirects to /book/hold/<token>/submitted.
 */
export function CheckoutForm({
  token,
  holdCode,
  defaultGuestCount,
}: {
  token: string;
  holdCode: string;
  defaultGuestCount: number;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch(`/api/v1/holds/${token}/submit`, {
        method: "POST",
        body: fd,
      });
      const json = (await res.json()) as { ok: boolean; reason?: string };
      if (res.ok && json.ok) {
        router.push(`/book/hold/${token}/submitted`);
      } else {
        setError(messageFor(json.reason ?? "submit_failed"));
      }
    } catch {
      setError("Network error. Please retry.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-4 rounded-md border border-line-soft bg-surface p-5"
    >
      <input type="hidden" name="holdCode" value={holdCode} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Input name="guestFirstName" label="First name" required />
        <Input name="guestLastName" label="Last name" />
        <Input name="guestEmail" type="email" label="Email" required />
        <Input name="guestPhone" label="Phone" />
        <Input name="guestCountry" label="Country" />
        <Input
          name="guestCount"
          type="number"
          label="Guest count"
          required
          defaultValue={String(defaultGuestCount)}
        />
        <Input name="arrivalTime" label="Approx. arrival time" />
        <Select
          name="purposeOfStay"
          label="Purpose"
          options={[
            "",
            "holiday",
            "family",
            "honeymoon",
            "business",
            "event",
            "other",
          ]}
        />
      </div>
      <Textarea name="specialRequests" label="Special requests (optional)" />
      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" name="marketingConsent" value="true" />
        I'd like to receive occasional emails from Arconique.
      </label>
      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" name="termsAccepted" value="true" required />
        I accept the booking terms (no payment is collected here).
      </label>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="h-9 px-4 rounded-full bg-ink text-ink-inverse text-xs font-medium hover:bg-ink/90 disabled:opacity-60"
        >
          {submitting ? "Submitting…" : "Submit request"}
        </button>
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>
      <p className="text-xs text-ink-tertiary">
        Our concierge will confirm availability manually within 24 hours. You
        will not be charged until your booking is confirmed by our team.
      </p>
    </form>
  );
}

function Input(props: {
  name: string;
  label: string;
  type?: string;
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-ink-tertiary">
      {props.label}
      <input
        name={props.name}
        type={props.type ?? "text"}
        defaultValue={props.defaultValue}
        required={props.required}
        className="h-9 px-3 rounded-md border border-line-soft bg-canvas text-sm text-ink"
      />
    </label>
  );
}

function Textarea(props: { name: string; label: string }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-ink-tertiary">
      {props.label}
      <textarea
        name={props.name}
        rows={3}
        className="px-3 py-2 rounded-md border border-line-soft bg-canvas text-sm text-ink"
      />
    </label>
  );
}

function Select(props: { name: string; label: string; options: string[] }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-ink-tertiary">
      {props.label}
      <select
        name={props.name}
        defaultValue={props.options[0]}
        className="h-9 px-3 rounded-md border border-line-soft bg-canvas text-sm text-ink"
      >
        {props.options.map((o) => (
          <option key={o} value={o}>
            {o || "—"}
          </option>
        ))}
      </select>
    </label>
  );
}

function messageFor(reason: string): string {
  switch (reason) {
    case "terms_not_accepted":
      return "Please accept the booking terms.";
    case "hold_expired":
      return "This hold has expired. Please run a new quote.";
    case "hold_cancelled":
      return "This hold was cancelled.";
    case "hold_converted":
      return "This hold was already converted to a booking.";
    case "invalid_input":
      return "Please review the highlighted fields.";
    default:
      return "Could not submit your request. Please retry.";
  }
}
