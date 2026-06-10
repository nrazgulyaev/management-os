"use client";

import * as React from "react";
import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createOwnerThreadAction } from "@/features/owner-portal/thread-compose-actions";
import {
  COMPOSE_CATEGORY_OPTIONS,
  type OwnerActionState,
} from "@/features/owner-portal/thread-compose-types";

/**
 * Owner inbox compose — start a new thread to Management.
 *
 * Posts to createOwnerThreadAction (real DB write: owner_threads +
 * owner_messages), which redirects into the new thread on success.
 * Read-only under impersonation (the action enforces requireOwnerWrite
 * server-side and returns the gate error here).
 */

const initial: OwnerActionState | null = null;

function SubmitButton({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="btn btn-accent"
      disabled={pending || disabled}
    >
      {pending ? "Sending…" : "Send message"}
    </button>
  );
}

export function OwnerComposeForm({ disabled }: { disabled?: boolean }) {
  const [state, dispatch] = useActionState(createOwnerThreadAction, initial);

  return (
    <form action={dispatch} className="flex flex-col gap-5">
      <div className="field">
        <label className="field-label" htmlFor="compose-subject">
          Subject
        </label>
        <input
          id="compose-subject"
          name="subject"
          type="text"
          required
          maxLength={160}
          disabled={disabled}
          placeholder="What is this about?"
          className="input"
        />
      </div>

      <div className="field">
        <label className="field-label" htmlFor="compose-category">
          Category
        </label>
        <select
          id="compose-category"
          name="category"
          defaultValue="general"
          disabled={disabled}
          className="select"
        >
          {COMPOSE_CATEGORY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <p className="field-help">
          Helps us route your message to the right person.
        </p>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="compose-body">
          Message
        </label>
        <textarea
          id="compose-body"
          name="body"
          required
          rows={6}
          maxLength={4000}
          disabled={disabled}
          placeholder="Write your message to the management team…"
          className="textarea"
        />
      </div>

      {state && !state.ok && state.error && (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <SubmitButton disabled={disabled} />
        <Link href="/owner/inbox" className="btn btn-ghost btn-sm">
          Cancel
        </Link>
      </div>
    </form>
  );
}
