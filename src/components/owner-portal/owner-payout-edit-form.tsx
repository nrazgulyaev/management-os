"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  requestPayoutEditCodeAction,
  updatePayoutMethodAction,
} from "@/features/owner-portal/payout-edit-actions";
import {
  PAYOUT_METHOD_TYPE_OPTIONS,
  type PayoutEditView,
  type PayoutSaveState,
} from "@/features/owner-portal/payout-edit-types";

/**
 * 2FA-gated payout-method edit (confirm-step gate).
 *
 * Step 1 ("verify") — request a server-generated confirmation code
 * (requestPayoutEditCodeAction). No SMS/email transport is wired, so
 * the code is surfaced here for the owner to re-enter.
 * Step 2 ("edit") — the owner enters the code + new bank details;
 * updatePayoutMethodAction verifies the code server-side and persists.
 *
 * Read-only under impersonation (both actions enforce requireOwnerWrite).
 */

const saveInitial: PayoutSaveState = null;

type Phase = "locked" | "ready";

function SaveButton({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-accent" disabled={pending || disabled}>
      {pending ? "Saving…" : "Confirm & save"}
    </button>
  );
}

export function OwnerPayoutEditForm({
  current,
  disabled,
}: {
  current: PayoutEditView;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [phase, setPhase] = React.useState<Phase>("locked");
  const [demoCode, setDemoCode] = React.useState<string | null>(null);
  const [requesting, setRequesting] = React.useState(false);
  const [codeError, setCodeError] = React.useState<string | null>(null);
  const [saveState, save] = useActionState(updatePayoutMethodAction, saveInitial);

  React.useEffect(() => {
    if (saveState?.ok) {
      router.push("/owner/preferences");
    }
  }, [saveState, router]);

  async function requestCode() {
    if (disabled || requesting) return;
    setRequesting(true);
    setCodeError(null);
    const res = await requestPayoutEditCodeAction();
    setRequesting(false);
    if (res?.ok) {
      setDemoCode(res.demoCode);
      setPhase("ready");
    } else {
      setCodeError(res?.error ?? "Could not start verification.");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="settings-section">
        <header className="ss-head">
          <h3 className="ss-title">Step 1 · Verify it&rsquo;s you</h3>
          <p className="ss-helper">
            Changing where your payouts wire is sensitive, so it&rsquo;s gated by
            a confirmation code. Request one, then enter it below to unlock the
            edit.
          </p>
        </header>
        <div className="ss-rows pt-3">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={requestCode}
            disabled={disabled || requesting}
          >
            {requesting
              ? "Requesting…"
              : phase === "ready"
                ? "Resend code"
                : "Send confirmation code"}
          </button>
          {codeError && (
            <p className="field-error" role="alert">
              {codeError}
            </p>
          )}
          {demoCode && (
            <p className="field-help">
              Your confirmation code is{" "}
              <strong className="mono text-ink">{demoCode}</strong>. It expires
              in 10 minutes. (Delivery by SMS/email is configured at launch — for
              now it&rsquo;s shown here.)
            </p>
          )}
        </div>
      </div>

      <form action={save} className="settings-section flex flex-col">
        <header className="ss-head">
          <h3 className="ss-title">Step 2 · New payout details</h3>
          <p className="ss-helper">
            Currently on file: {current.maskedAccount} ·{" "}
            {current.bankName || current.accountLabel || "—"}.
          </p>
        </header>

        <div className="ss-rows pt-3 flex flex-col gap-5">
          <div className="field">
            <label className="field-label" htmlFor="payout-code">
              Confirmation code
            </label>
            <input
              id="payout-code"
              name="code"
              inputMode="numeric"
              maxLength={6}
              required
              disabled={disabled || phase !== "ready"}
              placeholder="6-digit code"
              className="input mono"
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="payout-method-type">
              Method
            </label>
            <select
              id="payout-method-type"
              name="methodType"
              defaultValue={current.methodType}
              disabled={disabled || phase !== "ready"}
              className="select"
            >
              {PAYOUT_METHOD_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="payout-currency">
              Currency (3-letter)
            </label>
            <input
              id="payout-currency"
              name="currency"
              defaultValue={current.currency}
              maxLength={3}
              required
              disabled={disabled || phase !== "ready"}
              placeholder="USD"
              className="input"
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="payout-bank">
              Bank / provider name
            </label>
            <input
              id="payout-bank"
              name="bankName"
              defaultValue={current.bankName}
              maxLength={120}
              disabled={disabled || phase !== "ready"}
              placeholder="e.g. Wise, BCA, HSBC"
              className="input"
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="payout-label">
              Account label
            </label>
            <input
              id="payout-label"
              name="accountLabel"
              defaultValue={current.accountLabel}
              maxLength={120}
              required
              disabled={disabled || phase !== "ready"}
              placeholder="e.g. Whitmore Holdings · multi-currency"
              className="input"
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="payout-account">
              Account number
            </label>
            <input
              id="payout-account"
              name="accountNumber"
              required
              disabled={disabled || phase !== "ready"}
              placeholder="Full number — only the last 4 digits are stored"
              className="input mono"
            />
            <p className="field-help">
              We store only the masked tail. Settlement remains manual.
            </p>
          </div>

          {saveState && !saveState.ok && saveState.error && (
            <p className="field-error" role="alert">
              {saveState.error}
            </p>
          )}

          <div className="flex items-center gap-3">
            <SaveButton disabled={disabled || phase !== "ready"} />
            <Link href="/owner/preferences" className="btn btn-ghost btn-sm">
              Cancel
            </Link>
          </div>
        </div>
      </form>
    </div>
  );
}
