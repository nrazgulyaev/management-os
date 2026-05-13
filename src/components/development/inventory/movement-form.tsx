"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { recordInventoryMovement } from "@/lib/development/server/inventory/inventory-actions";

const MOVEMENT_TYPES = [
  "received",
  "issued_to_site",
  "used",
  "returned",
  "damaged",
  "lost",
  "transferred",
  "adjusted",
] as const;

/**
 * Mobile-friendly movement form. Used by both warehouse staff and site
 * supervisors (issue-to-site flow). 44px+ touch targets, single-column
 * on phones, all common movement types one tap away.
 */
export function InventoryMovementForm({
  items,
  locations,
  projects,
  defaultMovementType,
  onSuccess,
  onCancel,
}: {
  items: Array<{ id: string; sku: string; displayName: string; unitOfMeasure: string }>;
  locations: Array<{ id: string; locationCode: string; displayName: string; locationType: string }>;
  projects: Array<{ id: string; name: string }>;
  defaultMovementType?: typeof MOVEMENT_TYPES[number];
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [itemId, setItemId] = useState(items[0]?.id ?? "");
  const [movementType, setMovementType] = useState<
    typeof MOVEMENT_TYPES[number]
  >(defaultMovementType ?? "received");
  const [quantity, setQuantity] = useState("");
  const [fromLocationId, setFromLocationId] = useState("");
  const [toLocationId, setToLocationId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Which locations are required for this movement type?
  const needsFrom = ["issued_to_site", "used", "returned", "damaged", "lost", "transferred"].includes(
    movementType,
  );
  const needsTo = ["received", "issued_to_site", "returned", "transferred"].includes(
    movementType,
  );
  const fromOptional = movementType === "adjusted";
  const toOptional = movementType === "adjusted";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const q = Number(quantity);
    if (!q || q <= 0) {
      setError("Quantity must be > 0");
      return;
    }
    if (needsFrom && !fromLocationId) {
      setError(`'${movementType}' requires a 'from' location`);
      return;
    }
    if (needsTo && !toLocationId) {
      setError(`'${movementType}' requires a 'to' location`);
      return;
    }
    startTransition(async () => {
      try {
        await recordInventoryMovement({
          itemId,
          movementType,
          quantity: q,
          fromLocationId: fromLocationId || null,
          toLocationId: toLocationId || null,
          projectId: projectId || null,
          reason: reason || null,
        });
        if (onSuccess) onSuccess();
        else router.push(
          `/development-os/inventory/items/${encodeURIComponent(
            items.find((i) => i.id === itemId)?.sku ?? "",
          )}`,
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Movement failed");
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3 max-w-xl">
      <label className="block text-sm">
        <span className="text-ink-secondary">Movement type</span>
        <select
          value={movementType}
          onChange={(e) =>
            setMovementType(e.target.value as typeof movementType)
          }
          className="mt-1 block w-full rounded border border-line-soft p-2.5 text-sm min-h-[44px]"
        >
          {MOVEMENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm">
        <span className="text-ink-secondary">Item (SKU)</span>
        <select
          value={itemId}
          onChange={(e) => setItemId(e.target.value)}
          className="mt-1 block w-full rounded border border-line-soft p-2.5 text-sm min-h-[44px]"
          required
        >
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.sku} — {i.displayName}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm">
        <span className="text-ink-secondary">
          Quantity (
          {items.find((i) => i.id === itemId)?.unitOfMeasure ?? "—"})
        </span>
        <input
          type="number"
          step="0.01"
          min="0"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className="mt-1 block w-full rounded border border-line-soft p-2.5 text-sm min-h-[44px] font-mono"
          required
        />
      </label>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {(needsFrom || fromOptional) && (
          <label className="block text-sm">
            <span className="text-ink-secondary">
              From location {needsFrom ? "(required)" : "(optional)"}
            </span>
            <select
              value={fromLocationId}
              onChange={(e) => setFromLocationId(e.target.value)}
              className="mt-1 block w-full rounded border border-line-soft p-2.5 text-sm min-h-[44px]"
              required={needsFrom}
            >
              <option value="">— None —</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.locationCode} ({l.locationType})
                </option>
              ))}
            </select>
          </label>
        )}
        {(needsTo || toOptional) && (
          <label className="block text-sm">
            <span className="text-ink-secondary">
              To location {needsTo ? "(required)" : "(optional)"}
            </span>
            <select
              value={toLocationId}
              onChange={(e) => setToLocationId(e.target.value)}
              className="mt-1 block w-full rounded border border-line-soft p-2.5 text-sm min-h-[44px]"
              required={needsTo}
            >
              <option value="">— None —</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.locationCode} ({l.locationType})
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <label className="block text-sm">
        <span className="text-ink-secondary">Project (optional)</span>
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="mt-1 block w-full rounded border border-line-soft p-2.5 text-sm min-h-[44px]"
        >
          <option value="">— None —</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm">
        <span className="text-ink-secondary">Reason / notes</span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
        />
      </label>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending} className="min-h-[44px]">
          {pending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
          Record movement
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </form>
  );
}
