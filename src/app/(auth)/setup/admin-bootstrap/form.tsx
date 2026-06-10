"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, ArrowRight, KeyRound, User } from "lucide-react";
import { bootstrapSuperAdminAction, type BootstrapResult } from "./actions";

/**
 * RESKIN-AUTH-3 — bootstrap form restyled with the Auth Suite `.auth-*`
 * / `.field` primitives (was admin <FormShell>). Behavior unchanged:
 * same server action, field names (`fullName`, `secret`), required
 * logic and pending state.
 */

const initial: BootstrapResult | null = null;

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn btn-accent btn-lg auth-submit"
    >
      {pending ? (
        "Linking…"
      ) : (
        <>
          Bootstrap super-admin{" "}
          <ArrowRight className="w-4 h-4" strokeWidth={1.8} />
        </>
      )}
    </button>
  );
}

export function BootstrapForm({
  authUserId,
  email,
  defaultName,
  state,
  ipAddress: _ip,
  userAgent: _ua,
}: {
  authUserId: string;
  email: string;
  defaultName: string;
  state: { stage: string };
  ipAddress: string | null;
  userAgent: string | null;
}) {
  const [result, action] = useActionState(bootstrapSuperAdminAction, initial);
  const requireSecret = state.stage === "locked_requires_secret";

  return (
    <form action={action} className="auth-stack">
      <p className="field-help">
        Will be linked to:{" "}
        <span className="font-mono">
          {email} ({authUserId.slice(0, 8)}…)
        </span>
      </p>

      {result && !result.ok && (
        <div className="auth-notice auth-notice-danger">
          <AlertCircle className="auth-notice-ic w-4 h-4" strokeWidth={1.7} />
          <span>{result.error}</span>
        </div>
      )}

      <label className="field">
        <span className="field-label">Full name</span>
        <div className="auth-field-wrap">
          <User
            className="auth-field-icon w-4 h-4"
            strokeWidth={1.7}
            aria-hidden
          />
          <input
            name="fullName"
            defaultValue={defaultName}
            required
            className="input auth-input"
            placeholder="Jane Operator"
          />
        </div>
      </label>

      <label className="field">
        <span className="field-label">
          {requireSecret
            ? "ADMIN_BOOTSTRAP_SECRET"
            : "ADMIN_BOOTSTRAP_SECRET (optional)"}
        </span>
        <div className="auth-field-wrap">
          <KeyRound
            className="auth-field-icon w-4 h-4"
            strokeWidth={1.7}
            aria-hidden
          />
          <input
            name="secret"
            type="password"
            autoComplete="off"
            className="input auth-input"
            placeholder={requireSecret ? "Paste secret" : "Leave blank for first run"}
            required={requireSecret}
          />
        </div>
        <span className="field-help">
          {requireSecret
            ? "Required because a super-admin already exists."
            : "Not required for the first super-admin."}
        </span>
      </label>

      <Submit />
    </form>
  );
}
