"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { recordReceivingDecision } from "@/lib/development/server/receiving-actions";
import { RECEIVING_DECISIONS } from "@/lib/db/schema/material-receiving-holds";
import type { ReceivingDecision } from "@/lib/db/schema/material-receiving-holds";
import {
  RECEIVING_DECISION_LABEL,
  RECEIVING_DECISION_HINT,
} from "@/lib/development/constants/receiving-constants";

/**
 * At-dock receiving decision form. Records one auditable QC-hold against
 * the PO. Quantities are advisory totals (accepted vs held) — actual
 * delivery-line posting + payment stay in their own flows. Mirrors the
 * movement-form pattern: useTransition + server action, cream/ink tokens,
 * Button primitive (never a raw bg-black button).
 */
export function ReceivingDecisionPanel({
  poId,
  poCode,
  outstandingQty,
  deliveries,
}: {
  poId: string;
  poCode: string;
  outstandingQty: number;
  deliveries: Array<{ id: string; deliveryCode: string }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [decision, setDecision] = useState<ReceivingDecision>("accept_partial");
  const [deliveryId, setDeliveryId] = useState("");
  const [quantityAccepted, setQuantityAccepted] = useState("");
  const [quantityHeld, setQuantityHeld] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const needsAccepted = decision === "accept_partial";
  const needsHeld =
    decision === "accept_partial" ||
    decision === "wait_back_order" ||
    decision === "return_whole";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);
    if (reason.trim().length < 3) {
      setError("A reason is required (min 3 characters).");
      return;
    }
    const accepted = quantityAccepted ? Number(quantityAccepted) : 0;
    const held = quantityHeld ? Number(quantityHeld) : 0;
    if (Number.isNaN(accepted) || accepted < 0) {
      setError("Accepted quantity must be 0 or more.");
      return;
    }
    if (Number.isNaN(held) || held < 0) {
      setError("Held quantity must be 0 or more.");
      return;
    }
    startTransition(async () => {
      try {
        await recordReceivingDecision({
          poId,
          deliveryId: deliveryId || null,
          decision,
          quantityAccepted: accepted,
          quantityHeld: held,
          reason: reason.trim(),
        });
        setDone(true);
        setReason("");
        setQuantityAccepted("");
        setQuantityHeld("");
        router.refresh();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to record decision.",
        );
      }
    });
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-4 max-w-2xl rounded-3xl border border-line-soft bg-surface shadow-soft-card p-5 md:p-6"
    >
      <fieldset className="space-y-2">
        <legend className="text-sm text-ink-secondary">
          Decision for {poCode} ({outstandingQty.toFixed(2)} outstanding)
        </legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {RECEIVING_DECISIONS.map((d) => {
            const active = decision === d;
            return (
              <button
                key={d}
                type="button"
                onClick={() => setDecision(d)}
                aria-pressed={active}
                className={
                  "text-left rounded-2xl border px-4 py-3 transition-colors " +
                  (active
                    ? "border-line-strong bg-muted"
                    : "border-line-soft bg-surface hover:bg-muted/40")
                }
              >
                <span className="block text-sm font-medium text-ink">
                  {RECEIVING_DECISION_LABEL[d]}
                </span>
                <span className="block text-xs text-ink-tertiary mt-0.5">
                  {RECEIVING_DECISION_HINT[d]}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {deliveries.length > 0 && (
        <label className="block text-sm">
          <span className="text-ink-secondary">Related delivery (optional)</span>
          <select
            value={deliveryId}
            onChange={(e) => setDeliveryId(e.target.value)}
            className="mt-1 block w-full rounded border border-line-soft p-2.5 text-sm min-h-[44px]"
          >
            <option value="">— None —</option>
            {deliveries.map((d) => (
              <option key={d.id} value={d.id}>
                {d.deliveryCode}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="text-ink-secondary">
            Quantity accepted {needsAccepted ? "" : "(optional)"}
          </span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={quantityAccepted}
            onChange={(e) => setQuantityAccepted(e.target.value)}
            className="mt-1 block w-full rounded border border-line-soft p-2.5 text-sm min-h-[44px] font-mono"
          />
        </label>
        <label className="block text-sm">
          <span className="text-ink-secondary">
            Quantity held / returned {needsHeld ? "" : "(optional)"}
          </span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={quantityHeld}
            onChange={(e) => setQuantityHeld(e.target.value)}
            className="mt-1 block w-full rounded border border-line-soft p-2.5 text-sm min-h-[44px] font-mono"
          />
        </label>
      </div>

      <label className="block text-sm">
        <span className="text-ink-secondary">Reason / QC notes</span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          required
          placeholder="What was found at the dock and why this decision."
          className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
        />
      </label>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending} className="min-h-[44px]">
          {pending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
          Record decision
        </Button>
        {done && !pending && (
          <span className="text-xs text-success">Decision recorded.</span>
        )}
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </form>
  );
}
