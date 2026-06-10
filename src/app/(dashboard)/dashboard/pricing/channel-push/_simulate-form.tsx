"use client";

/**
 * DS-styled simulate-push form. Same fields, names, defaults and server
 * action (simulateChannelPushAction) as the legacy
 * src/components/dynamic-pricing/simulate-push-form.tsx — chrome only.
 */

import { useActionState } from "react";
import { simulateChannelPushAction } from "@/features/dynamic-pricing/actions";

export function SimulatePushFormDs({
  ruleSets,
}: {
  ruleSets: { id: string; name: string }[];
}) {
  const [state, dispatch, pending] = useActionState(simulateChannelPushAction, null);
  return (
    <form action={dispatch} className="flex flex-wrap items-end gap-3">
      <label className="field min-w-[200px]">
        <span className="field-label">Rule set</span>
        <select name="ruleSetId" required className="select">
          {ruleSets.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field-label">From</span>
        <input name="dateStart" type="date" required className="input" />
      </label>
      <label className="field">
        <span className="field-label">To</span>
        <input name="dateEnd" type="date" required className="input" />
      </label>
      <label className="field min-w-[140px]">
        <span className="field-label">Channel</span>
        <select name="channelKey" defaultValue="airbnb" className="select">
          {["airbnb", "booking_com", "vrbo", "direct"].map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </label>
      <label className="field min-w-[180px]">
        <span className="field-label">Event type</span>
        <select name="eventType" defaultValue="rate_update" className="select">
          {["rate_update", "availability_update", "stop_sell_update", "min_stay_update"].map(
            (c) => (
              <option key={c} value={c}>{c}</option>
            ),
          )}
        </select>
      </label>
      <button type="submit" disabled={pending} className="btn btn-accent btn-sm">
        {pending ? "Simulating…" : "Simulate push"}
      </button>
      {state?.ok && state.eventCode && (
        <span className="font-mono text-[11px] text-success">{state.eventCode}</span>
      )}
      {state && !state.ok && <span className="text-[12px] text-danger">{state.error}</span>}
    </form>
  );
}
