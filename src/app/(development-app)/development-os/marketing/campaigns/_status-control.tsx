"use client";

/**
 * Wire-up sweep — campaign status transitions.
 *
 * `transitionCampaignStatus` already existed but no UI reached it — the
 * campaigns table was read-only. Renders an inline status selector.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { transitionCampaignStatus } from "@/lib/development/server/campaigns/campaign-actions";

const STATUSES = [
  "planned",
  "in_preparation",
  "active",
  "paused",
  "completed",
  "cancelled",
  "archived",
] as const;
type CampaignStatus = (typeof STATUSES)[number];

export function CampaignStatusControl({
  campaignCode,
  status,
}: {
  campaignCode: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [err, setErr] = React.useState<string | null>(null);

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newStatus = e.target.value as CampaignStatus;
    if (newStatus === status) return;
    setErr(null);
    start(async () => {
      const r = await transitionCampaignStatus({ campaignCode, newStatus });
      if (!r.ok) {
        setErr(r.error ?? "Transition failed.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={status}
        onChange={onChange}
        disabled={pending}
        className="text-xs px-2 py-1 rounded border border-line-soft bg-surface disabled:opacity-50"
        aria-label="Campaign status"
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      {err && <span className="text-[10px] text-danger">{err}</span>}
    </div>
  );
}
