"use client";

/**
 * Rule-set editor client widgets (mock mgmt-p2 §03).
 *
 * Every control here is wired to a PRE-EXISTING server action in
 * src/features/dynamic-pricing/actions.ts — nothing fake:
 *   - AddRuleEditor      → upsert/create actions for all six rule families
 *   - ArchiveRuleButton  → archivePricingRuleAction
 *   - RuleSetLifecycle   → pause / update(status=active) / archive rule-set
 *   - RuleSetSettingsForm→ updatePricingRuleSetAction
 *
 * NOTE: there is no per-rule enable/disable toggle action in the backend
 * (archive is one-way), so rows render a status badge instead of a toggle.
 */

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  archivePricingRuleAction,
  archivePricingRuleSetAction,
  createMinStayRuleAction,
  createStopSellRuleAction,
  pausePricingRuleSetAction,
  updatePricingRuleSetAction,
  upsertChannelRuleAction,
  upsertCloseOutRuleAction,
  upsertDayOfWeekRuleAction,
  upsertOccupancyRuleAction,
} from "@/features/dynamic-pricing/actions";
import type { ActionResult } from "@/features/projects/actions";

/* ------------------------------------------------------------------ */
/* shared bits                                                         */
/* ------------------------------------------------------------------ */

const CHANNEL_KEYS = ["direct", "airbnb", "booking_com", "vrbo", "manual"];

/** Drop empty-string entries so z.coerce.number().optional() fields stay
 *  undefined instead of coercing "" → 0. */
function cleanFormData(fd: FormData): FormData {
  const out = new FormData();
  for (const [k, v] of fd.entries()) {
    if (typeof v === "string" && v.trim() === "") continue;
    out.append(k, v);
  }
  return out;
}

function FormNote({ state }: { state: ActionResult | null }) {
  if (!state) return null;
  return state.ok ? (
    <span className="font-mono text-[11px] text-success">Saved.</span>
  ) : (
    <span className="text-[12px] text-danger">{state.error}</span>
  );
}

/* ------------------------------------------------------------------ */
/* per-rule archive                                                    */
/* ------------------------------------------------------------------ */

export type RuleFamily =
  | "day_of_week"
  | "occupancy"
  | "close_out"
  | "channel"
  | "min_stay"
  | "stop_sell";

export function ArchiveRuleButton({
  ruleType,
  id,
}: {
  ruleType: RuleFamily;
  id: string;
}) {
  const router = useRouter();
  const [state, dispatch, pending] = useActionState(archivePricingRuleAction, null);
  useEffect(() => {
    // archivePricingRuleAction revalidates /dashboard/pricing (the hub),
    // not this detail route — refresh so the archived rule greys out.
    if (state?.ok) router.refresh();
  }, [state, router]);
  return (
    <form
      action={dispatch}
      onSubmit={(e) => {
        if (!window.confirm("Archive this rule? It stops applying immediately.")) {
          e.preventDefault();
        }
      }}
      className="inline-flex"
    >
      <input type="hidden" name="ruleType" value={ruleType} />
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        className="btn btn-ghost btn-sm"
        title="Archive rule"
      >
        {pending ? "…" : "Archive"}
      </button>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* rule-set lifecycle (pause / activate / archive)                     */
/* ------------------------------------------------------------------ */

export function RuleSetLifecycle({
  id,
  status,
}: {
  id: string;
  status: string;
}) {
  const [pauseState, pauseDispatch, pausePending] = useActionState(
    pausePricingRuleSetAction,
    null,
  );
  const [activateState, activateDispatch, activatePending] = useActionState(
    updatePricingRuleSetAction,
    null,
  );
  const [archiveState, archiveDispatch, archivePending] = useActionState(
    archivePricingRuleSetAction,
    null,
  );
  const err =
    (pauseState && !pauseState.ok && pauseState.error) ||
    (activateState && !activateState.ok && activateState.error) ||
    (archiveState && !archiveState.ok && archiveState.error) ||
    null;
  return (
    <span className="inline-flex items-center gap-2">
      {err && <span className="text-[12px] text-danger">{err}</span>}
      {status === "active" && (
        <form action={pauseDispatch} className="inline-flex">
          <input type="hidden" name="id" value={id} />
          <button type="submit" disabled={pausePending} className="btn btn-secondary btn-sm">
            {pausePending ? "Pausing…" : "Pause set"}
          </button>
        </form>
      )}
      {status === "paused" && (
        <form action={activateDispatch} className="inline-flex">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="status" value="active" />
          <button type="submit" disabled={activatePending} className="btn btn-accent btn-sm">
            {activatePending ? "Activating…" : "Activate"}
          </button>
        </form>
      )}
      {status !== "archived" && (
        <form
          action={archiveDispatch}
          onSubmit={(e) => {
            if (
              !window.confirm(
                "Archive this rule set? It stops driving prices and cannot be re-activated from the UI.",
              )
            ) {
              e.preventDefault();
            }
          }}
          className="inline-flex"
        >
          <input type="hidden" name="id" value={id} />
          <button type="submit" disabled={archivePending} className="btn btn-ghost btn-sm">
            {archivePending ? "…" : "Archive set"}
          </button>
        </form>
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* rule-set settings (base / clamps / priority / name)                 */
/* ------------------------------------------------------------------ */

export function RuleSetSettingsForm({
  id,
  name,
  priority,
  currency,
  baseRateMinor,
}: {
  id: string;
  name: string;
  priority: number;
  currency: string;
  baseRateMinor: string;
}) {
  const [state, dispatch] = useActionState(
    async (prev: ActionResult | null, fd: FormData) =>
      updatePricingRuleSetAction(prev, cleanFormData(fd)),
    null,
  );
  return (
    <form action={dispatch} className="flex flex-col gap-3.5">
      <input type="hidden" name="id" value={id} />
      <div className="field">
        <span className="field-label">Name</span>
        <input className="input" name="name" defaultValue={name} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="field">
          <span className="field-label">Priority</span>
          <input className="input" name="priority" type="number" defaultValue={priority} />
        </div>
        <div className="field">
          <span className="field-label">Currency</span>
          <input className="input" name="currency" defaultValue={currency} minLength={3} maxLength={8} />
        </div>
      </div>
      <div className="field">
        <span className="field-label">Base rate · minor units</span>
        <input className="input" name="baseRateMinor" type="number" defaultValue={baseRateMinor} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="field">
          <span className="field-label">Min clamp · minor</span>
          <input className="input" name="minRateMinor" type="number" placeholder="keep current" />
        </div>
        <div className="field">
          <span className="field-label">Max clamp · minor</span>
          <input className="input" name="maxRateMinor" type="number" placeholder="keep current" />
        </div>
      </div>
      <div className="flex items-center gap-2 pt-3 border-t border-line-soft">
        <FormNote state={state} />
        <button type="submit" className="btn btn-secondary btn-sm ml-auto">
          Save settings
        </button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* add-rule side editor (mock §03 side panel)                          */
/* ------------------------------------------------------------------ */

const FAMILY_LABELS: Record<RuleFamily, string> = {
  day_of_week: "Day of week",
  occupancy: "Occupancy tier",
  close_out: "Lead time / close-out",
  channel: "Channel",
  min_stay: "Min-stay window",
  stop_sell: "Stop-sell window",
};

const WEEKDAYS: [number, string][] = [
  [1, "Monday"],
  [2, "Tuesday"],
  [3, "Wednesday"],
  [4, "Thursday"],
  [5, "Friday"],
  [6, "Saturday"],
  [7, "Sunday"],
];

export function AddRuleEditor({ ruleSetId }: { ruleSetId: string }) {
  const [family, setFamily] = useState<RuleFamily>("day_of_week");
  const [modifierType, setModifierType] = useState<string>("percent");
  const [state, dispatch, pending] = useActionState(
    async (prev: ActionResult | null, fd: FormData) => {
      const fam = (fd.get("family") as RuleFamily) ?? "day_of_week";
      const cleaned = cleanFormData(fd);
      switch (fam) {
        case "day_of_week":
          return upsertDayOfWeekRuleAction(prev, cleaned);
        case "occupancy":
          return upsertOccupancyRuleAction(prev, cleaned);
        case "close_out":
          return upsertCloseOutRuleAction(prev, cleaned);
        case "channel":
          return upsertChannelRuleAction(prev, cleaned);
        case "min_stay":
          return createMinStayRuleAction(prev, cleaned);
        case "stop_sell":
          return createStopSellRuleAction(prev, cleaned);
        default:
          return { ok: false as const, error: "Unknown rule family." };
      }
    },
    null,
  );

  const hasModifier = family !== "min_stay" && family !== "stop_sell";
  const allowStopSellModifier = family === "close_out";

  return (
    <div className="rule-editor">
      <div className="re-head">
        <div className="label text-[9.5px] mb-1">Add rule · {FAMILY_LABELS[family]}</div>
        <div className="re-title">New {FAMILY_LABELS[family].toLowerCase()} rule</div>
      </div>
      <form action={dispatch}>
        <div className="re-body">
          <input type="hidden" name="ruleSetId" value={ruleSetId} />
          <div className="field">
            <span className="field-label">Rule family</span>
            <select
              className="select"
              name="family"
              value={family}
              onChange={(e) => {
                const fam = e.target.value as RuleFamily;
                setFamily(fam);
                if (fam !== "close_out" && modifierType === "stop_sell") {
                  setModifierType("percent");
                }
              }}
            >
              {(Object.keys(FAMILY_LABELS) as RuleFamily[]).map((f) => (
                <option key={f} value={f}>
                  {FAMILY_LABELS[f]}
                </option>
              ))}
            </select>
          </div>

          {family === "day_of_week" && (
            <>
              <div className="field">
                <span className="field-label">Weekday</span>
                <select className="select" name="weekday" defaultValue="6">
                  {WEEKDAYS.map(([n, label]) => (
                    <option key={n} value={n}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <span className="field-label">Min LOS · optional</span>
                <input className="input" name="minLos" type="number" min={1} max={365} />
              </div>
            </>
          )}

          {family === "occupancy" && (
            <div className="grid grid-cols-2 gap-2">
              <div className="field">
                <span className="field-label">Occ min · 0–1</span>
                <input
                  className="input"
                  name="occupancyMin"
                  type="number"
                  step="0.05"
                  min={0}
                  max={1}
                  required
                  defaultValue="0.8"
                />
              </div>
              <div className="field">
                <span className="field-label">Occ max · 0–1</span>
                <input
                  className="input"
                  name="occupancyMax"
                  type="number"
                  step="0.05"
                  min={0}
                  max={1}
                  required
                  defaultValue="1"
                />
              </div>
            </div>
          )}

          {family === "close_out" && (
            <div className="grid grid-cols-2 gap-2">
              <div className="field">
                <span className="field-label">Days before · min</span>
                <input
                  className="input"
                  name="daysBeforeCheckinMin"
                  type="number"
                  min={0}
                  required
                  defaultValue="0"
                />
              </div>
              <div className="field">
                <span className="field-label">Days before · max</span>
                <input
                  className="input"
                  name="daysBeforeCheckinMax"
                  type="number"
                  min={0}
                  required
                  defaultValue="2"
                />
              </div>
            </div>
          )}

          {family === "channel" && (
            <>
              <div className="field">
                <span className="field-label">Channel</span>
                <select className="select" name="channelKey" defaultValue="airbnb">
                  {CHANNEL_KEYS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <span className="field-label">Commission model · optional</span>
                <select className="select" name="commissionModel" defaultValue="">
                  <option value="">—</option>
                  <option value="channel_collects">channel_collects</option>
                  <option value="hotel_collects">hotel_collects</option>
                  <option value="commission_on_gross">commission_on_gross</option>
                  <option value="none">none</option>
                </select>
              </div>
            </>
          )}

          {(family === "min_stay" || family === "stop_sell") && (
            <div className="field">
              <span className="field-label">Name</span>
              <input className="input" name="name" required minLength={2} />
            </div>
          )}

          {family === "min_stay" && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="field">
                  <span className="field-label">From · optional</span>
                  <input className="input" name="startsOn" type="date" />
                </div>
                <div className="field">
                  <span className="field-label">To · optional</span>
                  <input className="input" name="endsOn" type="date" />
                </div>
              </div>
              <div className="field">
                <span className="field-label">Weekdays · optional, e.g. 6,7</span>
                <input className="input" name="weekdayMask" placeholder="6,7" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="field">
                  <span className="field-label">Min LOS</span>
                  <input className="input" name="minLos" type="number" min={1} required defaultValue="2" />
                </div>
                <div className="field">
                  <span className="field-label">Max LOS</span>
                  <input className="input" name="maxLos" type="number" min={1} />
                </div>
                <div className="field">
                  <span className="field-label">Priority</span>
                  <input className="input" name="priority" type="number" defaultValue="100" />
                </div>
              </div>
            </>
          )}

          {family === "stop_sell" && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="field">
                  <span className="field-label">From</span>
                  <input className="input" name="startsOn" type="date" required />
                </div>
                <div className="field">
                  <span className="field-label">To</span>
                  <input className="input" name="endsOn" type="date" required />
                </div>
              </div>
              <div className="field">
                <span className="field-label">Reason</span>
                <select className="select" name="reason" defaultValue="manual">
                  <option value="maintenance_buffer">maintenance buffer</option>
                  <option value="owner_hold">owner hold</option>
                  <option value="operational_risk">operational risk</option>
                  <option value="channel_strategy">channel strategy</option>
                  <option value="manual">manual</option>
                </select>
              </div>
              <div className="field">
                <span className="field-label">Channel · optional, blank = all</span>
                <select className="select" name="channelKey" defaultValue="">
                  <option value="">all channels</option>
                  {CHANNEL_KEYS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {hasModifier && (
            <>
              <div className="field">
                <span className="field-label">Effect</span>
                <select
                  className="select"
                  name="modifierType"
                  value={modifierType}
                  onChange={(e) => setModifierType(e.target.value)}
                >
                  <option value="percent">Percent of rate</option>
                  <option value="fixed">Fixed amount</option>
                  {allowStopSellModifier && <option value="stop_sell">Stop-sell</option>}
                </select>
              </div>
              {modifierType === "percent" && (
                <div className="field">
                  <span className="field-label">Value · fraction, 0.15 = +15%</span>
                  <input
                    className="input"
                    name="modifierValueNumeric"
                    type="number"
                    step="0.01"
                    required
                    defaultValue="0.1"
                  />
                </div>
              )}
              {modifierType === "fixed" && (
                <div className="field">
                  <span className="field-label">Amount · minor units, negative = discount</span>
                  <input
                    className="input"
                    name="modifierAmountMinor"
                    type="number"
                    step="1"
                    required
                    defaultValue="10000"
                  />
                </div>
              )}
            </>
          )}
        </div>
        <div className="re-foot">
          <FormNote state={state} />
          <button type="submit" disabled={pending} className="btn btn-accent btn-sm">
            {pending ? "Saving…" : "Save rule"}
          </button>
        </div>
      </form>
    </div>
  );
}
