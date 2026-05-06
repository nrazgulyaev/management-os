"use client";

import { useActionState } from "react";
import { useState } from "react";
import { updateOwnerCalendarPreferencesAction } from "@/features/guest-journey/actions";

export interface OwnerPreferenceRow {
  ownerId: string;
  ownerLabel: string;
  defaultCurrency: string;
  showGuestNames: boolean;
  showGuestCountry: boolean;
  showChannelLabels: boolean;
  showMaintenanceDetails: boolean;
  calendarDensity: string;
}

export function OwnerPreferencesForm({
  owners,
}: {
  owners: OwnerPreferenceRow[];
}) {
  const [activeOwnerId, setActiveOwnerId] = useState(
    owners[0]?.ownerId ?? "",
  );
  const active = owners.find((o) => o.ownerId === activeOwnerId) ?? owners[0];
  const [state, dispatch] = useActionState(
    updateOwnerCalendarPreferencesAction,
    null,
  );
  if (!active) {
    return (
      <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
        You don't have any active owner profiles linked to your account.
      </p>
    );
  }
  return (
    <form
      action={dispatch}
      className="flex flex-col gap-4 rounded-md border border-line-soft bg-surface p-5"
    >
      {owners.length > 1 && (
        <label className="flex flex-col gap-1 text-xs text-ink-tertiary">
          Owner profile
          <select
            value={activeOwnerId}
            onChange={(e) => setActiveOwnerId(e.target.value)}
            className="h-9 px-3 rounded-md border border-line-soft bg-canvas text-sm text-ink"
          >
            {owners.map((o) => (
              <option key={o.ownerId} value={o.ownerId}>
                {o.ownerLabel}
              </option>
            ))}
          </select>
        </label>
      )}
      <input type="hidden" name="ownerId" value={active.ownerId} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs text-ink-tertiary">
          Default currency
          <input
            name="defaultCurrency"
            defaultValue={active.defaultCurrency}
            className="h-9 px-3 rounded-md border border-line-soft bg-canvas text-sm text-ink font-mono"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-tertiary">
          Calendar density
          <select
            name="calendarDensity"
            defaultValue={active.calendarDensity}
            className="h-9 px-3 rounded-md border border-line-soft bg-canvas text-sm text-ink"
          >
            <option value="compact">Compact</option>
            <option value="comfortable">Comfortable</option>
            <option value="detailed">Detailed</option>
          </select>
        </label>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Toggle
          name="showGuestNames"
          label="Show guest names (masked)"
          defaultChecked={active.showGuestNames}
        />
        <Toggle
          name="showGuestCountry"
          label="Show guest country"
          defaultChecked={active.showGuestCountry}
        />
        <Toggle
          name="showChannelLabels"
          label="Show channel labels"
          defaultChecked={active.showChannelLabels}
        />
        <Toggle
          name="showMaintenanceDetails"
          label="Show maintenance details"
          defaultChecked={active.showMaintenanceDetails}
        />
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          className="h-9 px-4 rounded-full bg-ink text-ink-inverse text-xs font-medium hover:bg-ink/90"
        >
          Save preferences
        </button>
        {state?.ok && (
          <span className="text-xs text-success">Saved.</span>
        )}
        {state && !state.ok && (
          <span className="text-xs text-danger">{state.error}</span>
        )}
      </div>
      <p className="text-xs text-ink-tertiary">
        These settings drive how your calendar / portfolio renders inside the
        owner portal. Guest names are always masked (e.g. "Emma W.") even when
        shown — full guest contact details are never exposed.
      </p>
    </form>
  );
}

function Toggle({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-md border border-line-soft bg-canvas px-4 py-3">
      <span className="text-sm text-ink">{label}</span>
      <input
        type="checkbox"
        name={name}
        value="true"
        defaultChecked={defaultChecked}
        className="h-4 w-4"
      />
    </label>
  );
}
