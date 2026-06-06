"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

export function VillaPicker({
  villas,
  selected,
}: {
  villas: { id: string; label: string }[];
  selected: string;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  return (
    <label className="inline-flex items-center gap-2 rounded-full border border-line bg-paper px-3 py-1.5 text-[13px] text-ink">
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
        villa
      </span>
      <select
        className="bg-transparent font-medium text-ink focus:outline-none disabled:opacity-60"
        value={selected}
        disabled={pending}
        onChange={(e) =>
          start(() => router.push(`/dashboard/pricing?villa=${e.target.value}`))
        }
      >
        {villas.map((v) => (
          <option key={v.id} value={v.id}>
            {v.label}
          </option>
        ))}
      </select>
    </label>
  );
}
