"use client";

import { useState, useTransition } from "react";
import { Loader2, Send } from "lucide-react";
import { submitInvestorPortalRequest } from "@/lib/development/server/investor-portal-requests/request-actions";

/**
 * Investor-side write surface — submit a withdrawal request. Goes to
 * `submitted` status; operator review + execution is required before any
 * money moves.
 */
export function WithdrawRequestForm({
  investorId,
  commitmentId,
  sourceProjectId,
  availableMinor,
}: {
  investorId: string;
  commitmentId: string;
  sourceProjectId: string;
  availableMinor: number;
}) {
  const [pending, startTransition] = useTransition();
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const availableMajor = availableMinor / 100;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const amountNum = Number(amount);
    if (!amountNum || amountNum <= 0) {
      setError("Enter an amount greater than 0.");
      return;
    }
    if (amountNum > availableMajor) {
      setError(`Amount exceeds available cash ($${availableMajor.toLocaleString()}).`);
      return;
    }
    startTransition(async () => {
      try {
        const out = await submitInvestorPortalRequest({
          investorId,
          requestType: "withdrawal",
          requestedAmountMinor: BigInt(Math.round(amountNum * 100)),
          currency: "USD",
          sourceProjectId,
          relatedCommitmentId: commitmentId,
          investorNotes: notes || null,
        });
        setSuccess(
          `Request ${out.requestCode} submitted. The Arconique team will review and execute.`,
        );
        setAmount("");
        setNotes("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Submit failed");
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block text-sm">
        <span className="text-stone-700">
          Amount to withdraw (USD, max ${availableMajor.toLocaleString()})
        </span>
        <input
          type="number"
          step="0.01"
          min="0"
          max={availableMajor}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="mt-1 block w-full rounded border border-stone-300 p-2 text-sm font-mono"
          required
        />
      </label>
      <label className="block text-sm">
        <span className="text-stone-700">Notes (optional)</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="mt-1 block w-full rounded border border-stone-300 p-2 text-sm"
          placeholder="Any context for the Arconique team"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-2 px-4 py-2 rounded bg-stone-900 text-white text-sm hover:bg-stone-800 disabled:opacity-50"
      >
        {pending ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Send className="w-4 h-4" />
        )}
        Submit withdrawal request
      </button>
      {error && <p className="text-xs text-red-700">{error}</p>}
      {success && <p className="text-xs text-emerald-700">{success}</p>}
      <p className="text-[11px] text-stone-500">
        Submitting creates a request — no money moves until Arconique
        reviews, approves, and explicitly executes it.
      </p>
    </form>
  );
}
