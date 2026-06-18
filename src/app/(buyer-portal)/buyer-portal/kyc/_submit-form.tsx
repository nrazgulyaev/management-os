"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { submitBuyerKyc } from "@/lib/buyer-portal/kyc-actions";

const CONSENT_TEXT =
  "I confirm the personal and identity details we hold for me are accurate and " +
  "complete, and I submit them for identity verification (KYC).";

/**
 * Buyer KYC submit control. There is no document-upload step yet (storage
 * wiring is deferred) — the buyer confirms their details and submits; the
 * server action advances `kycStatus` not_started/in_progress → submitted, and
 * our team verifies off-portal. Mirrors the contract e-sign confirm pattern.
 */
export function SubmitKycForm() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [consent, setConsent] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await submitBuyerKyc();
      if (!res.ok) {
        setError(res.error ?? "Could not submit your details.");
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="primary"
        size="sm"
        onClick={() => setOpen(true)}
      >
        Submit for verification
      </Button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="mt-3 rounded-md border border-line-soft bg-muted/40 p-4 space-y-3"
    >
      <p className="text-xs text-ink-secondary">{CONSENT_TEXT}</p>
      <label className="flex items-start gap-2 text-xs text-ink-secondary">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          I confirm my details are accurate and submit them for identity
          verification.
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={pending || !consent}
        >
          {pending ? "Submitting…" : "Submit for verification"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          disabled={pending}
        >
          Cancel
        </Button>
        {error && <span className="w-full text-xs text-danger">{error}</span>}
      </div>
    </form>
  );
}
