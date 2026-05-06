"use client";

import { useState, useTransition } from "react";
import {
  revealLockCodeAction,
  revealWifiPasswordAction,
} from "@/features/guest-stays/reveal";

export interface RevealButtonProps {
  token: string;
  kind: "wifi" | "lock";
  wifiId?: string;
  /** Label shown when the secret is hidden (default: "Show password"). */
  hiddenLabel?: string;
  /** Optional cosmetic padding around the visible secret. */
  className?: string;
}

const REASON_COPY: Record<string, string> = {
  not_verified: "Verify your stay to view this.",
  rate_limited: "Too many requests. Try again in a few minutes.",
  not_found: "We couldn't find this credential.",
  decrypt_failed: "Couldn't unlock the password. Contact concierge.",
  unavailable: "Not available right now.",
};

export function RevealSecretButton({
  token,
  kind,
  wifiId,
  hiddenLabel,
  className,
}: RevealButtonProps) {
  const [value, setValue] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reveal() {
    setError(null);
    startTransition(async () => {
      const out =
        kind === "wifi"
          ? await revealWifiPasswordAction({ token, wifiId: wifiId ?? "" })
          : await revealLockCodeAction({ token });
      if (out.ok) {
        setValue(out.value);
      } else {
        setError(REASON_COPY[out.reason] ?? "Couldn't show this. Try again.");
      }
    });
  }

  function hide() {
    setValue(null);
  }

  if (value !== null) {
    return (
      <div className={className}>
        <div
          className={`font-mono select-all ${
            kind === "lock"
              ? "text-[40px] tracking-[0.4em] text-ink"
              : "text-lg tracking-wide text-ink"
          }`}
        >
          {value}
        </div>
        <button
          type="button"
          onClick={hide}
          className="mt-2 text-[11px] text-ink-tertiary hover:text-ink underline-offset-4 hover:underline"
        >
          Hide
        </button>
      </div>
    );
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={reveal}
        disabled={isPending}
        className="h-10 px-4 rounded-full bg-ink text-ink-inverse text-sm font-medium hover:bg-ink/90 disabled:opacity-50"
      >
        {isPending
          ? "Loading…"
          : (hiddenLabel ?? (kind === "wifi" ? "Show password" : "Show code"))}
      </button>
      {error && <p className="text-[11px] text-danger mt-2">{error}</p>}
    </div>
  );
}
