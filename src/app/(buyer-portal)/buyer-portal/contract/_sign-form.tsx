"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { signBuyerContract } from "@/lib/buyer-portal/contract-sign-actions";

const CONSENT_TEXT =
  "I have read the contract and intend my typed name below to be my electronic " +
  "signature, with the same legal effect as a handwritten signature.";

/**
 * Buyer e-sign control for a contract group. There is no real e-sign provider —
 * the buyer types their full legal name and ticks a consent box; the server
 * action records a `contract_signatures` row and cascades the signing state.
 */
export function SignContractForm({
  contractGroupId,
  defaultName,
}: {
  contractGroupId: string;
  defaultName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [typedName, setTypedName] = React.useState(defaultName);
  const [consent, setConsent] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await signBuyerContract({
        contractGroupId,
        typedName,
        consent,
      });
      if (!res.ok) {
        setError(res.error ?? "Could not record your signature.");
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
        Review &amp; sign
      </Button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="mt-3 rounded-md border border-line-soft bg-muted/40 p-4 space-y-3"
    >
      <p className="text-xs text-ink-secondary">{CONSENT_TEXT}</p>
      <div>
        <label className="block text-xs font-medium text-ink-secondary mb-1">
          Full legal name
        </label>
        <input
          value={typedName}
          onChange={(e) => setTypedName(e.target.value)}
          required
          minLength={2}
          maxLength={160}
          placeholder="Your full legal name"
          className="w-full rounded border border-line-soft bg-surface px-3 py-2 text-sm text-ink"
        />
      </div>
      <label className="flex items-start gap-2 text-xs text-ink-secondary">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          I consent to sign this contract electronically and agree to its terms.
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={pending || !consent || typedName.trim().length < 2}
        >
          {pending ? "Signing…" : "Sign contract"}
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
