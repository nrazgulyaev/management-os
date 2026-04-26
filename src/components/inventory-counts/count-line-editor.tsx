"use client";

import { useTransition, useState } from "react";
import { updateInventoryCountLineAction } from "@/features/inventory/counts-actions";

export function CountLineQuantityInput({
  lineId,
  initial,
  unit,
  disabled,
}: {
  lineId: string;
  initial: number;
  unit: string;
  disabled?: boolean;
}) {
  const [value, setValue] = useState(String(initial));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const commit = () => {
    if (Number(value) === initial) return;
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("lineId", lineId);
      fd.set("countedQuantity", value);
      const res = await updateInventoryCountLineAction(null, fd);
      if (!res.ok) setError(res.error);
    });
  };

  return (
    <div className="inline-flex items-center gap-2">
      <input
        type="number"
        step={0.001}
        min={0}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        disabled={disabled || pending}
        className="w-24 h-8 px-2 rounded-sm border border-line-soft bg-canvas text-sm text-ink font-mono tabular-nums focus:outline-none focus:border-line-strong"
      />
      <span className="text-[11px] text-ink-tertiary">{unit}</span>
      {error && <span className="text-[11px] text-danger">{error}</span>}
    </div>
  );
}
