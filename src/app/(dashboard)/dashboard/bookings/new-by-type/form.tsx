"use client";

import * as React from "react";
import {
  getAvailableVillaTypesAction,
  createBookingByTypeAction,
} from "@/features/bookings/by-type-actions";
import type { AvailableVillaType } from "@/features/bookings/type-availability";

export function NewByTypeForm({
  channels,
}: {
  channels: { id: string; label: string }[];
}) {
  const [state, action, pending] = React.useActionState(createBookingByTypeAction, null);
  const [checkIn, setCheckIn] = React.useState("");
  const [checkOut, setCheckOut] = React.useState("");
  const [types, setTypes] = React.useState<AvailableVillaType[] | null>(null);
  const [assetTypeId, setAssetTypeId] = React.useState("");
  const [loading, startLoad] = React.useTransition();

  function resetTypes() {
    setTypes(null);
    setAssetTypeId("");
  }
  function findTypes() {
    if (!checkIn || !checkOut) return;
    startLoad(async () => {
      const t = await getAvailableVillaTypesAction(checkIn, checkOut);
      setTypes(t);
      setAssetTypeId("");
    });
  }

  const available = (types ?? []).filter((t) => t.freeVillaIds.length > 0);
  const unavailable = (types ?? []).filter((t) => t.freeVillaIds.length === 0);

  return (
    <form action={action} className="flex flex-col gap-5 max-w-[640px]">
      <input type="hidden" name="checkIn" value={checkIn} />
      <input type="hidden" name="checkOut" value={checkOut} />
      <input type="hidden" name="assetTypeId" value={assetTypeId} />

      {state && !state.ok && (
        <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-3 py-2 text-sm text-ink">
          {state.error}
        </div>
      )}

      <div className="card p-5 flex flex-col gap-4">
        <h2 className="display text-[20px] font-normal">Dates</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="field">
            <span className="field-label">Check-in</span>
            <input
              className="input"
              type="date"
              value={checkIn}
              onChange={(e) => {
                setCheckIn(e.target.value);
                resetTypes();
              }}
            />
          </label>
          <label className="field">
            <span className="field-label">Check-out</span>
            <input
              className="input"
              type="date"
              value={checkOut}
              onChange={(e) => {
                setCheckOut(e.target.value);
                resetTypes();
              }}
            />
          </label>
        </div>
        <div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={findTypes}
            disabled={!checkIn || !checkOut || loading}
          >
            {loading ? "Checking availability…" : "Find available types"}
          </button>
        </div>
      </div>

      {types !== null && (
        <div className="card p-5 flex flex-col gap-3">
          <h2 className="display text-[20px] font-normal">Villa type</h2>
          {available.length === 0 ? (
            <p className="text-sm text-ink-tertiary italic">
              No villa type has a free villa for those dates. Try other dates.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {available.map((t) => (
                <label
                  key={t.assetTypeId}
                  className={`flex items-center justify-between gap-3 rounded-md border p-3 cursor-pointer transition-colors ${
                    assetTypeId === t.assetTypeId
                      ? "border-line-strong bg-muted/40"
                      : "border-line-soft hover:border-line-strong"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="_type"
                      checked={assetTypeId === t.assetTypeId}
                      onChange={() => setAssetTypeId(t.assetTypeId)}
                    />
                    <span className="text-sm text-ink">{t.typeName}</span>
                  </span>
                  <span className="text-xs text-ink-tertiary tabular-nums">
                    {t.freeVillaIds.length} of {t.totalVillas} free
                  </span>
                </label>
              ))}
            </div>
          )}
          {unavailable.length > 0 && (
            <p className="text-[11px] text-ink-tertiary">
              Fully booked for these dates:{" "}
              {unavailable.map((t) => t.typeName).join(", ")}.
            </p>
          )}
        </div>
      )}

      {assetTypeId && (
        <div className="card p-5 flex flex-col gap-4">
          <h2 className="display text-[20px] font-normal">Booking</h2>
          <label className="field">
            <span className="field-label">Guest name</span>
            <input className="input" name="guestName" placeholder="Guest party" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="field">
              <span className="field-label">Adults</span>
              <input className="input" name="adults" type="number" min={0} defaultValue={2} />
            </label>
            <label className="field">
              <span className="field-label">Children</span>
              <input className="input" name="children" type="number" min={0} defaultValue={0} />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="field">
              <span className="field-label">Currency</span>
              <input className="input" name="currency" defaultValue="USD" maxLength={3} />
            </label>
            <label className="field">
              <span className="field-label">Gross amount</span>
              <input className="input" name="grossAmount" type="number" min={0} step="0.01" defaultValue={0} />
            </label>
          </div>
          <label className="field">
            <span className="field-label">Channel (optional)</span>
            <select className="select" name="channelId" defaultValue="">
              <option value="">Direct / none</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <div>
            <button type="submit" className="btn btn-accent" disabled={pending}>
              {pending ? "Creating…" : "Create booking · auto-assign a villa"}
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
