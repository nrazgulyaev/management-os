"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check } from "lucide-react";
import { confirmCapitalCallWireReceived } from "@/lib/investor-portal/capital-call-actions";

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
      <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        {success}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block text-sm">
        <span className="text-stone-700">
          Bank wire reference (for {allocatedLabel})
        </span>
        <input
          type="text"
          value={wireRef}
          onChange={(e) => setWireRef(e.target.value)}
          className="mt-1 block w-full rounded border border-stone-300 p-2 text-sm font-mono"
          placeholder="MT103-2026-…"
          required
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
          <Check className="w-4 h-4" />
        )}
        Confirm wire received
      </button>
      {error && <p className="text-xs text-red-700">{error}</p>}
      <p className="text-[11px] text-stone-500">
        This records that you have sent the wire for your slice of this
        capital call. No payment is taken here — Arconique finance reconciles
        the confirmation against the incoming bank transfer.
      </p>
    </form>
  );
}
