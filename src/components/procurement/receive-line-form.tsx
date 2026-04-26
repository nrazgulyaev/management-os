"use client";

import { useTransition, useState } from "react";
import { Button } from "@/components/ui/button";
import { selectCls, inputCls } from "@/components/admin/form-shell";
import { receivePurchaseOrderLineAction } from "@/features/procurement/actions";

interface Option {
  id: string;
  label: string;
}

export function ReceiveLineForm({
  poId,
  lineId,
  outstanding,
  unit,
  locations,
}: {
  poId: string;
  lineId: string;
  outstanding: number;
  unit: string;
  locations: Option[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [qty, setQty] = useState(String(outstanding));
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");

  if (outstanding <= 0) {
    return <span className="text-[11px] text-success">Fully received</span>;
  }
  if (locations.length === 0) {
    return (
      <span className="text-[11px] text-ink-tertiary">
        Add a storage location first.
      </span>
    );
  }

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("purchaseOrderId", poId);
      fd.set("lineId", lineId);
      fd.set("receivedQuantity", qty);
      fd.set("toLocationId", locationId);
      const res = await receivePurchaseOrderLineAction(null, fd);
      if (!res.ok) setError(res.error);
    });
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <input
        type="number"
        min={0.001}
        step={0.001}
        value={qty}
        onChange={(e) => setQty(e.target.value)}
        className={inputCls + " w-24 h-8 text-xs"}
      />
      <span className="text-[11px] text-ink-tertiary">{unit}</span>
      <select
        value={locationId}
        onChange={(e) => setLocationId(e.target.value)}
        className={selectCls + " h-8 text-xs"}
      >
        {locations.map((l) => (
          <option key={l.id} value={l.id}>{l.label}</option>
        ))}
      </select>
      <Button size="sm" disabled={pending} onClick={submit}>
        Receive
      </Button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
