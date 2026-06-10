"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  dispatchPick,
  type DispatchPickResult,
} from "@/lib/development/server/warehouse/warehouse-flow-actions";

/**
 * build-warehouse-flow — pick/dispatch client island for /warehouse/picks.
 *
 * Collects item · qty · source warehouse · site destination, then calls
 * the org-scoped `dispatchPick` server action (which writes one
 * issued_to_site inventory_movement and decrements the source balance).
 * On success it refreshes the route so the grouped-by-destination view
 * and KPIs re-render with the new pick.
 */

export interface DispatchItemOption {
  id: string;
  sku: string;
  displayName: string;
  unitOfMeasure: string;
}

export interface DispatchSourceOption {
  id: string;
  locationCode: string;
  displayName: string;
}

export interface DispatchDestinationOption {
  value: string;
  label: string;
}

export function DispatchPickPanel({
  items,
  sources,
  destinations,
}: {
  items: DispatchItemOption[];
  sources: DispatchSourceOption[];
  destinations: DispatchDestinationOption[];
}) {
  const router = useRouter();
  const [itemId, setItemId] = React.useState(items[0]?.id ?? "");
  const [quantity, setQuantity] = React.useState("");
  const [fromLocationId, setFromLocationId] = React.useState(
    sources[0]?.id ?? "",
  );
  const [destination, setDestination] = React.useState(
    destinations[0]?.value ?? "",
  );
  const [reason, setReason] = React.useState("");
  const [pending, startTransition] = React.useTransition();
  const [result, setResult] = React.useState<DispatchPickResult | null>(null);

  const canSubmit =
    itemId &&
    fromLocationId &&
    destination &&
    Number(quantity) > 0 &&
    !pending;

  const missingConfig =
    items.length === 0 || sources.length === 0 || destinations.length === 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);
    startTransition(async () => {
      const out = await dispatchPick({
        itemId,
        quantity: Number(quantity),
        fromLocationId,
        destination,
        reason: reason.trim() || undefined,
      });
      setResult(out);
      if (out.ok) {
        setQuantity("");
        setReason("");
        router.refresh();
      }
    });
  }

  if (missingConfig) {
    return (
      <div className="card card-pad">
        <p className="text-sm text-ink-secondary leading-relaxed">
          Dispatch needs at least one active SKU, one warehouse source
          location, and one site destination. Add inventory items and
          locations first, then picks can be dispatched here.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card card-pad flex flex-col gap-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="field">
          <span className="field-label">Item</span>
          <select
            className="select"
            value={itemId}
            onChange={(e) => setItemId(e.target.value)}
          >
            {items.map((it) => (
              <option key={it.id} value={it.id}>
                {it.sku} · {it.displayName}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Quantity</span>
          <input
            type="number"
            min="0"
            step="any"
            className="input"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="0"
          />
        </label>
        <label className="field">
          <span className="field-label">From (warehouse)</span>
          <select
            className="select"
            value={fromLocationId}
            onChange={(e) => setFromLocationId(e.target.value)}
          >
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.locationCode} · {s.displayName}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Destination (site)</span>
          <select
            className="select"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
          >
            {destinations.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        <span className="field-label">Reason / note (optional)</span>
        <input
          type="text"
          className="input"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. slab pour — Villa 3 foundation"
          maxLength={500}
        />
      </label>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          className="btn btn-amber btn-sm"
          disabled={!canSubmit}
        >
          {pending ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Dispatching…
            </span>
          ) : (
            "Dispatch pick"
          )}
        </button>
        {result?.ok && (
          <span className="text-sm text-ok">
            Dispatched · {result.movementCode}
          </span>
        )}
        {result && !result.ok && (
          <span role="alert" className="text-sm text-danger">
            {result.error}
          </span>
        )}
      </div>
    </form>
  );
}
