"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { createComplexAction } from "@/features/villas/complex-actions";

interface TypeRow {
  name: string;
  bedrooms: number;
  count: number;
  nightlyRateUsd: string;
}

export function NewComplexForm() {
  const [state, action, pending] = useActionState(createComplexAction, null);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [types, setTypes] = useState<TypeRow[]>([
    { name: "", bedrooms: 2, count: 1, nightlyRateUsd: "" },
  ]);

  function updateType(i: number, patch: Partial<TypeRow>) {
    setTypes((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  }
  function addType() {
    setTypes((prev) => [...prev, { name: "", bedrooms: 2, count: 1, nightlyRateUsd: "" }]);
  }
  function removeType(i: number) {
    setTypes((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
  }

  const totalVillas = types.reduce((n, t) => n + (Number(t.count) || 0), 0);
  const payload = JSON.stringify({
    name,
    location,
    types: types.map((t) => ({
      name: t.name,
      bedrooms: Number(t.bedrooms) || 0,
      count: Number(t.count) || 0,
      nightlyRateUsd: t.nightlyRateUsd === "" ? undefined : Number(t.nightlyRateUsd),
    })),
  });

  return (
    <form action={action} className="flex flex-col gap-6 max-w-[760px]">
      <input type="hidden" name="payload" value={payload} />

      {state && !state.ok && (
        <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-3 py-2 text-sm text-ink">
          {state.error}
        </div>
      )}

      <div className="card p-5 flex flex-col gap-4">
        <h2 className="display text-[20px] font-normal">Complex</h2>
        <label className="field">
          <span className="field-label">Complex name</span>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Eternal Villas"
            required
          />
        </label>
        <label className="field">
          <span className="field-label">Location</span>
          <input
            className="input"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Ubud, Bali"
            required
          />
        </label>
      </div>

      <div className="card p-5 flex flex-col gap-4">
        <div className="flex items-baseline justify-between">
          <h2 className="display text-[20px] font-normal">Villa types</h2>
          <span className="text-xs text-ink-tertiary">
            {totalVillas} villa{totalVillas === 1 ? "" : "s"} total
          </span>
        </div>

        {types.map((t, i) => (
          <div
            key={i}
            className="grid grid-cols-2 sm:grid-cols-[1fr_80px_80px_110px_auto] gap-3 items-end"
          >
            <label className="field">
              <span className="field-label">Type name</span>
              <input
                className="input"
                value={t.name}
                onChange={(e) => updateType(i, { name: e.target.value })}
                placeholder="Garden Villa 2BR"
              />
            </label>
            <label className="field">
              <span className="field-label">Beds</span>
              <input
                className="input"
                type="number"
                min={0}
                value={t.bedrooms}
                onChange={(e) => updateType(i, { bedrooms: Number(e.target.value) })}
              />
            </label>
            <label className="field">
              <span className="field-label">Count</span>
              <input
                className="input"
                type="number"
                min={1}
                value={t.count}
                onChange={(e) => updateType(i, { count: Number(e.target.value) })}
              />
            </label>
            <label className="field">
              <span className="field-label">Rate/night $</span>
              <input
                className="input"
                type="number"
                min={0}
                value={t.nightlyRateUsd}
                onChange={(e) => updateType(i, { nightlyRateUsd: e.target.value })}
                placeholder="—"
              />
            </label>
            <button
              type="button"
              onClick={() => removeType(i)}
              className="btn btn-ghost btn-sm"
              disabled={types.length === 1}
              title="Remove type"
            >
              ✕
            </button>
          </div>
        ))}

        <div>
          <button type="button" onClick={addType} className="btn btn-secondary btn-sm">
            + Add villa type
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" className="btn btn-accent" disabled={pending}>
          {pending
            ? "Creating…"
            : `Create complex + ${totalVillas} villa${totalVillas === 1 ? "" : "s"}`}
        </button>
        <Link href="/dashboard/projects" className="btn btn-ghost">
          Cancel
        </Link>
      </div>
    </form>
  );
}
