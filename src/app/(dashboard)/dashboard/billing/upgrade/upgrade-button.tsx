"use client";

/**
 * Stage 9.B — Upgrade button.
 *
 * Calls /api/billing/checkout, expects { ok, sessionUrl } JSON, and
 * redirects to the Stripe Checkout Session. On 503
 * (stripe_not_configured) surfaces a clear message about live Stripe
 * activation pending.
 */

import { useState, useTransition } from "react";

export function UpgradeButton({
  planCode,
  displayName,
}: {
  planCode: string;
  displayName: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function start(): void {
    setError(null);
    startTransition(async () => {
      const resp = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan_code: planCode, billing_cycle: "monthly" }),
      });
      const body = (await resp.json().catch(() => ({}))) as {
        ok?: boolean;
        sessionUrl?: string;
        reason?: string;
      };
      if (!resp.ok || !body.ok || !body.sessionUrl) {
        if (body.reason === "stripe_not_configured") {
          setError(
            "Live billing is being activated — please contact support@arconique.com to upgrade in the meantime.",
          );
        } else if (body.reason === "plan_not_purchasable") {
          setError(
            `${displayName} isn't yet purchasable — Stripe price ID not mapped. Contact support.`,
          );
        } else {
          setError(body.reason ?? `Checkout failed (${resp.status}).`);
        }
        return;
      }
      // Hard redirect — Stripe Checkout lives outside our origin.
      window.location.href = body.sessionUrl;
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={start}
        disabled={pending}
        className="inline-flex items-center justify-center rounded-full bg-ink px-4 py-2 text-sm font-medium text-ink-inverse hover:bg-ink/90 disabled:opacity-60"
      >
        {pending ? "Opening Stripe…" : `Upgrade to ${displayName}`}
      </button>
      {error && (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
