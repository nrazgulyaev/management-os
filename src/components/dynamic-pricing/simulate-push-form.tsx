"use client";

import { useActionState } from "react";
import { simulateChannelPushAction } from "@/features/dynamic-pricing/actions";

export function SimulatePushForm({
  ruleSets,
}: {
  ruleSets: { id: string; name: string }[];
}) {
  const [state, dispatch] = useActionState(simulateChannelPushAction, null);
  return (
    <form action={dispatch} className="flex flex-wrap items-end gap-3 rounded-md border border-line-soft bg-surface p-5">
      <label className="flex flex-col gap-1 text-xs text-ink-tertiary">
        Rule set
        <select
          name="ruleSetId"
          required
          className="h-9 px-3 rounded-md border border-line-soft bg-canvas text-sm text-ink"
        >
          {ruleSets.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-ink-tertiary">
        From
        <input name="dateStart" type="date" required className="h-9 px-3 rounded-md border border-line-soft bg-canvas text-sm text-ink" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-ink-tertiary">
        To
        <input name="dateEnd" type="date" required className="h-9 px-3 rounded-md border border-line-soft bg-canvas text-sm text-ink" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-ink-tertiary">
        Channel
        <select name="channelKey" defaultValue="airbnb" className="h-9 px-3 rounded-md border border-line-soft bg-canvas text-sm text-ink">
          {["airbnb", "booking_com", "vrbo", "direct"].map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-ink-tertiary">
        Event type
        <select name="eventType" defaultValue="rate_update" className="h-9 px-3 rounded-md border border-line-soft bg-canvas text-sm text-ink">
          {["rate_update", "availability_update", "stop_sell_update", "min_stay_update"].map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </label>
      <button type="submit" className="h-9 px-4 rounded-full bg-ink text-ink-inverse text-xs font-medium hover:bg-ink/90">
        Simulate push
      </button>
      {state?.ok && state.eventCode && (
        <span className="text-xs text-success font-mono">{state.eventCode}</span>
      )}
      {state && !state.ok && (
        <span className="text-xs text-danger">{state.error}</span>
      )}
    </form>
  );
}
