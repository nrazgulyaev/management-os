"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send, CheckCircle2 } from "lucide-react";
import { submitInvestorPortalRequest } from "@/lib/development/server/investor-portal-requests/request-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatUsdMinor } from "@/lib/development/constants/investor-constants";

/**
 * Investor-side write surface — submit a withdrawal request. Goes to
 * `submitted` status; operator review + execution is required before any
 * money moves. Manual settlement only (PSP / payout capture deferred).
 */
export function WithdrawRequestForm({
  commitmentId,
  sourceProjectId,
  availableMinor,
}: {
  /** Retained for call-site compatibility; the action resolves the
   * investor from the portal session and ignores any client value. */
  investorId?: string;
  commitmentId: string;
  sourceProjectId: string;
  availableMinor: number;
}) {
  const router = useRouter();
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
      setError(
        `Amount exceeds available cash (${formatUsdMinor(BigInt(availableMinor))}).`,
      );
      return;
    }
    startTransition(async () => {
      try {
        const out = await submitInvestorPortalRequest({
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
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Submit failed");
      }
    });
  }

  if (success) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-success/40 bg-success-weak px-4 py-3 text-sm text-success">
        <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.75} />
        <span>{success}</span>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block text-sm">
        <span className="text-ink-secondary">
          Amount to withdraw (USD, max {formatUsdMinor(BigInt(availableMinor))})
        </span>
        <Input
          type="number"
          step="0.01"
          min="0"
          max={availableMajor}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="mt-1 font-mono tabular-nums"
          required
        />
      </label>
      <label className="block text-sm">
        <span className="text-ink-secondary">Notes (optional)</span>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="mt-1"
          placeholder="Any context for the Arconique team"
        />
      </label>
      <Button type="submit" variant="primary" size="sm" disabled={pending}>
        {pending ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Send className="w-4 h-4" />
        )}
        Submit withdrawal request
      </Button>
      {error && <p className="text-xs text-danger">{error}</p>}
      <p className="text-[11px] text-ink-tertiary">
        Submitting creates a request — no money moves until Arconique reviews,
        approves, and explicitly executes it.
      </p>
    </form>
  );
}
