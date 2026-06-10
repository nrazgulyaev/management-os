"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { recordCycleCount } from "@/lib/development/server/warehouse/warehouse-stock-actions";

export interface StockCountItem {
  itemId: string;
  sku: string;
  displayName: string;
  unitOfMeasure: string;
  onHand: number;
}

/**
 * Cycle-count adjustment panel (dev-warehouse mock §01 "+ Adjustment").
 * Pick a SKU, enter the physically counted quantity, submit — the action
 * posts an `adjusted` movement for the variance and re-syncs on-hand.
 * Reuses Button / Badge primitives + Layer-B tokens.
 */
export function StockCountPanel({
  items,
  location,
}: {
  items: StockCountItem[];
  location: { id: string; locationCode: string; displayName: string } | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [itemId, setItemId] = useState(items[0]?.itemId ?? "");
  const [counted, setCounted] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const selected = items.find((i) => i.itemId === itemId) ?? null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(null);
    if (!location) {
      setError("No warehouse location is configured to count against.");
      return;
    }
    if (!itemId) {
      setError("Select a SKU to count.");
      return;
    }
    const q = Number(counted);
    if (counted === "" || Number.isNaN(q) || q < 0) {
      setError("Counted quantity must be 0 or more.");
      return;
    }
    startTransition(async () => {
      try {
        const res = await recordCycleCount({
          itemId,
          locationId: location.id,
          countedQuantity: q,
          reason: reason.trim() || null,
        });
        setDone(
          res.noChange
            ? "Count matches the system — no adjustment needed."
            : `Counted ${res.countedQuantity} vs ${res.previousOnHand} on-hand · variance ${res.variance > 0 ? "+" : ""}${res.variance} · ${res.movementCode}.`,
        );
        setCounted("");
        setReason("");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to record count.");
      }
    });
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-3xl border border-line-soft bg-surface shadow-soft-card p-5 md:p-6 flex flex-col gap-4 max-w-xl"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] uppercase tracking-[0.16em] text-ink-tertiary font-medium">
          Cycle count
        </span>
        {location ? (
          <Badge tone="outline">
            {location.locationCode} · {location.displayName}
          </Badge>
        ) : (
          <Badge tone="warning">No warehouse location</Badge>
        )}
      </div>

      <label className="block text-sm">
        <span className="text-ink-secondary">SKU</span>
        <select
          value={itemId}
          onChange={(e) => setItemId(e.target.value)}
          disabled={items.length === 0}
          className="mt-1 block w-full rounded border border-line-soft p-2.5 text-sm min-h-[44px]"
        >
          {items.length === 0 ? (
            <option value="">No SKUs in catalog</option>
          ) : (
            items.map((i) => (
              <option key={i.itemId} value={i.itemId}>
                {i.sku} · {i.displayName}
              </option>
            ))
          )}
        </select>
      </label>

      {selected && (
        <p className="text-xs text-ink-tertiary">
          System on-hand:{" "}
          <span className="font-mono text-ink-secondary">
            {selected.onHand} {selected.unitOfMeasure}
          </span>
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="text-ink-secondary">Counted quantity</span>
          <input
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            value={counted}
            onChange={(e) => setCounted(e.target.value)}
            className="mt-1 block w-full rounded border border-line-soft p-2.5 text-sm font-mono min-h-[44px]"
          />
        </label>
        <label className="block text-sm">
          <span className="text-ink-secondary">Reason (optional)</span>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Spoilage, miscount, found stock…"
            className="mt-1 block w-full rounded border border-line-soft p-2.5 text-sm min-h-[44px]"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          disabled={pending || items.length === 0}
          className="min-h-[44px]"
        >
          {pending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
          Record count
        </Button>
        {done && !pending && <Badge tone="success">{done}</Badge>}
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </form>
  );
}
