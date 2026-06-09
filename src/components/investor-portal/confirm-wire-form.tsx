"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, CheckCircle2 } from "lucide-react";
import { confirmCapitalCallWireReceived } from "@/lib/investor-portal/capital-call-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * W1c — LP-side "Confirm wire received" surface for a single capital-call
 * allocation. Manual only: the LP enters their bank wire reference and
 * asserts they have sent the funds. No PSP — Arconique finance still
 * reconciles against the bank statement.
 */
export function ConfirmWireForm({
  allocationId,
  allocatedLabel,
}: {
  allocationId: string;
  allocatedLabel: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [wireRef, setWireRef] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!wireRef.trim()) {
      setError("Enter the bank wire reference for your transfer.");
      return;
    }
    startTransition(async () => {
      const res = await confirmCapitalCallWireReceived({
        allocationId,
        wireRef: wireRef.trim(),
      });
      if (res.ok) {
        setSuccess(
          "Wire confirmation recorded. Arconique finance will reconcile it against the incoming transfer.",
        );
        setWireRef("");
        router.refresh();
      } else {
        setError(res.error);
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
          Bank wire reference (for {allocatedLabel})
        </span>
        <Input
          type="text"
          value={wireRef}
          onChange={(e) => setWireRef(e.target.value)}
          className="mt-1 font-mono"
          placeholder="MT103-2026-…"
          required
        />
      </label>
      <Button type="submit" variant="primary" size="sm" disabled={pending}>
        {pending ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Check className="w-4 h-4" />
        )}
        Confirm wire received
      </Button>
      {error && <p className="text-xs text-danger">{error}</p>}
      <p className="text-[11px] text-ink-tertiary">
        This records that you have sent the wire for your slice of this capital
        call. No payment is taken here — Arconique finance reconciles the
        confirmation against the incoming bank transfer.
      </p>
    </form>
  );
}
