"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, inputCls, selectCls } from "@/components/admin/form-shell";
import { createTaskMaterialUsageAction } from "@/features/inventory/actions";
import { Plus } from "lucide-react";

interface Option {
  id: string;
  label: string;
}

export function MaterialUsageForm({
  taskId,
  items,
  locations,
}: {
  taskId: string;
  items: Option[];
  locations: Option[];
}) {
  const [isOpen, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [itemId, setItemId] = useState("");
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [quantity, setQuantity] = useState("1");
  const [notes, setNotes] = useState("");

  const submit = () => {
    if (!itemId || !locationId) {
      setError("Pick an item and a location.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("taskId", taskId);
      fd.set("itemId", itemId);
      fd.set("locationId", locationId);
      fd.set("quantity", quantity);
      if (notes) fd.set("notes", notes);
      const res = await createTaskMaterialUsageAction(null, fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setItemId("");
      setQuantity("1");
      setNotes("");
      setOpen(false);
    });
  };

  if (!isOpen) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Plus className="w-3.5 h-3.5" strokeWidth={1.75} />
        Log material used
      </Button>
    );
  }

  return (
    <div className="rounded-md border border-line-soft bg-surface p-4 flex flex-col gap-3">
      <div className="text-label">Log material usage</div>
      <Field label="Item" required>
        <select value={itemId} onChange={(e) => setItemId(e.target.value)} className={selectCls}>
          <option value="">— Pick an item</option>
          {items.map((it) => (
            <option key={it.id} value={it.id}>
              {it.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="From location" required>
        <select
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
          className={selectCls}
        >
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Quantity" required>
          <input
            type="number"
            min={0.001}
            step={0.001}
            className={inputCls}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </Field>
        <Field label="Notes">
          <input
            className={inputCls}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="optional"
          />
        </Field>
      </div>
      {error && (
        <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-3 py-2 text-xs text-ink">
          {error}
        </div>
      )}
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
        <Button size="sm" onClick={submit} disabled={pending}>
          Log usage
        </Button>
      </div>
    </div>
  );
}
