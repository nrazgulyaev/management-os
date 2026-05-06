"use client";

import { useActionState, useState } from "react";
import {
  submitHandoffAction,
  type HandoffActionState,
} from "@/features/guest-ai-concierge/handoff-actions";

export type HandoffEntryHint =
  | "ask_human"
  | "report_problem"
  | "service_question"
  | "ai_refusal_followup";

export interface HandoffModalProps {
  token: string;
  open: boolean;
  onClose: () => void;
  initialHint: HandoffEntryHint;
  initialMessage?: string;
}

const TYPE_OPTIONS: Array<{ value: HandoffEntryHint; label: string }> = [
  { value: "ask_human", label: "I want a human concierge" },
  { value: "report_problem", label: "Something is broken / wrong" },
  { value: "service_question", label: "Question about a service" },
  { value: "ai_refusal_followup", label: "AI couldn't help" },
];

const PRIORITY_OPTIONS = [
  { value: "low", label: "Whenever's good" },
  { value: "normal", label: "Today" },
  { value: "high", label: "Soon" },
  { value: "urgent", label: "Urgent" },
] as const;

export function HandoffModal({
  token,
  open,
  onClose,
  initialHint,
  initialMessage = "",
}: HandoffModalProps) {
  const [type, setType] = useState<HandoffEntryHint>(initialHint);
  const [priority, setPriority] = useState<
    (typeof PRIORITY_OPTIONS)[number]["value"]
  >("normal");
  const [message, setMessage] = useState(initialMessage);
  const [contact, setContact] = useState("");
  const [state, dispatch] = useActionState(
    submitHandoffAction,
    null as HandoffActionState,
  );
  if (!open) return null;
  if (state?.ok) {
    return (
      <Backdrop onClose={onClose}>
        <div className="rounded-xl border border-success/40 bg-surface p-6 flex flex-col gap-3">
          <h3 className="text-lg font-medium text-ink">Sent to our team</h3>
          <p className="text-sm text-ink-secondary">
            Reference {state.requestCode}. Our team will follow up shortly.
            You can track the status on your stay page.
          </p>
          <div className="flex items-center gap-3 mt-2">
            <a
              href={`/stay/${token}/requests`}
              className="h-10 px-4 rounded-full bg-ink text-ink-inverse text-sm font-medium hover:bg-ink/90 inline-flex items-center"
            >
              View my requests
            </a>
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-ink-tertiary hover:text-ink underline-offset-4 hover:underline"
            >
              Close
            </button>
          </div>
        </div>
      </Backdrop>
    );
  }
  return (
    <Backdrop onClose={onClose}>
      <form
        action={dispatch}
        className="rounded-xl border border-line-soft bg-surface p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto"
      >
        <input type="hidden" name="token" value={token} />
        <h3 className="text-xl font-medium text-ink">Send to our team</h3>
        <p className="text-xs text-ink-secondary">
          The AI is read-only. Submitting this creates a real request your
          concierge can act on. Don&apos;t include passwords or codes.
        </p>

        <Field label="Type">
          <select
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value as HandoffEntryHint)}
            className="h-11 px-3 rounded-sm border border-line-soft bg-canvas text-sm"
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Priority">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {PRIORITY_OPTIONS.map((p) => (
              <label
                key={p.value}
                className={`text-xs rounded-md border p-2 cursor-pointer text-center ${
                  priority === p.value
                    ? "border-ink bg-canvas"
                    : "border-line-soft"
                }`}
              >
                <input
                  type="radio"
                  name="priority"
                  value={p.value}
                  checked={priority === p.value}
                  onChange={() => setPriority(p.value)}
                  className="sr-only"
                />
                {p.label}
              </label>
            ))}
          </div>
        </Field>

        <Field label="Message">
          <textarea
            name="message"
            rows={4}
            required
            maxLength={2000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="px-3 py-2 rounded-sm border border-line-soft bg-canvas text-sm resize-none"
            placeholder="Tell us what you need…"
          />
        </Field>

        <Field label="Preferred contact (optional)">
          <input
            type="text"
            name="preferredContact"
            maxLength={200}
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            className="h-11 px-3 rounded-sm border border-line-soft bg-canvas text-sm"
            placeholder="e.g. WhatsApp +62…, in person, anytime"
          />
        </Field>

        {state && !state.ok && (
          <p className="text-xs text-danger">{state.error}</p>
        )}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="h-11 px-4 rounded-full border border-line-soft text-sm hover:border-line-strong"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="flex-1 h-11 px-4 rounded-full bg-ink text-ink-inverse text-sm font-medium hover:bg-ink/90"
          >
            Send to team
          </button>
        </div>
      </form>
    </Backdrop>
  );
}

function Backdrop({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-ink/40 backdrop-blur-sm p-3 md:p-6">
      <div
        className="w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 -z-10"
      />
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] uppercase tracking-widest text-ink-tertiary">
        {label}
      </span>
      {children}
    </label>
  );
}
