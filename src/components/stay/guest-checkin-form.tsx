"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { submitStayCheckinAction } from "@/features/checkins/guest-actions";

/**
 * Guest online check-in (FC-GUEST-STAY-PORTAL §online-check-in). Phase 1
 * backbone: party size + ETA + passport-ready confirmation. The full 4-step
 * stepper + passport OCR land in later phases. Submitting flips the check-in to
 * `submitted`; the operator then approves in Front office and the door code
 * unlocks here.
 */
export function GuestCheckinForm({ token }: { token: string }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [guestCount, setGuestCount] = React.useState(2);
  const [eta, setEta] = React.useState("");
  const [passport, setPassport] = React.useState(false);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await submitStayCheckinAction({
        token,
        guestCount,
        eta: eta.trim() || undefined,
        passportUploaded: passport,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  const inputCls =
    "w-full h-11 px-3 rounded-md border border-line-soft bg-surface text-sm text-ink focus:outline-none focus:border-line-strong transition-colors";

  return (
    <form onSubmit={onSubmit} className="rounded-xl border border-line-soft bg-surface p-6 flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-medium text-ink">Online check-in</h2>
        <p className="text-sm text-ink-secondary mt-1">
          Tell us your party size and arrival time. Once our team approves, your villa door
          code appears here.
        </p>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] uppercase tracking-widest text-ink-tertiary">Guests in your party</span>
        <input
          type="number"
          min={1}
          max={30}
          value={guestCount}
          onChange={(e) => setGuestCount(Number(e.target.value))}
          className={inputCls}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] uppercase tracking-widest text-ink-tertiary">
          Estimated arrival (optional)
        </span>
        <input
          type="text"
          value={eta}
          onChange={(e) => setEta(e.target.value)}
          placeholder="e.g. 3:30 PM, evening flight"
          className={inputCls}
        />
      </label>

      <label className="flex items-center gap-2.5 text-sm text-ink">
        <input
          type="checkbox"
          checked={passport}
          onChange={(e) => setPassport(e.target.checked)}
          className="h-4 w-4"
        />
        I have my passport ready for verification at arrival
      </label>

      {error && <span className="text-xs text-danger">{error}</span>}

      <button
        type="submit"
        disabled={pending}
        className="self-start inline-flex items-center rounded-md bg-ink text-inverted-fg px-4 h-11 text-sm font-medium disabled:opacity-60"
      >
        {pending ? "Submitting…" : "Submit check-in"}
      </button>
    </form>
  );
}
