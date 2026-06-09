"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  togglePoolStateAction,
  createOwnerStayFromGridAction,
  cancelOwnerStayFromGridAction,
  type PoolActionResult,
} from "@/features/owner-portal/pool-actions";
import type { VillaPoolRow } from "@/features/owner-portal/get-pool-state";

/**
 * P1 owner-calendar-pool — interactive rental-pool manager.
 *
 * Replaces the read-only grid + "request a stay" link with a per-villa
 * surface: Take-out / Return-to-pool toggle (14-day cooling-off), the
 * free-nights allowance counter, in-grid date selection for Pay-&-book
 * vs Book-free, and cancel-stay on upcoming owner stays.
 */

export interface PoolQuota {
  policyName: string;
  year: number;
  usedNights: number;
  freeNightsPerYear: number;
  remainingNights: number;
}

export interface UpcomingOwnerStay {
  id: string;
  villaId: string;
  villaCode: string | null;
  start: string;
  end: string;
  status: string;
}

interface Props {
  villas: VillaPoolRow[];
  quota: PoolQuota | null;
  coolingOffDays: number;
  upcomingStays: UpcomingOwnerStay[];
}

function villaLabel(v: { villaCode: string | null; villaName?: string | null }): string {
  return v.villaCode ?? v.villaName ?? "Villa";
}

function nightsBetween(start: string, end: string): number {
  const a = new Date(`${start}T00:00:00Z`).getTime();
  const b = new Date(`${end}T00:00:00Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return 0;
  return Math.round((b - a) / 86_400_000);
}

export function PoolManager({ villas, quota, coolingOffDays, upcomingStays }: Props) {
  if (villas.length === 0) {
    return (
      <EmptyState
        variant="first-run"
        title="No villas linked to your account"
        body="We couldn't find any villas in your portfolio. Contact your property manager to confirm your ownership shares."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {quota && <AllowanceCounter quota={quota} />}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {villas.map((v) => (
          <VillaPoolCard
            key={v.villaId}
            villa={v}
            quota={quota}
            coolingOffDays={coolingOffDays}
            upcomingStays={upcomingStays.filter((s) => s.villaId === v.villaId)}
          />
        ))}
      </div>
    </div>
  );
}

function AllowanceCounter({ quota }: { quota: PoolQuota }) {
  const usedPct = Math.min(
    100,
    Math.round((quota.usedNights / Math.max(quota.freeNightsPerYear, 1)) * 100),
  );
  const barColor =
    usedPct >= 90 ? "var(--terra)" : usedPct >= 60 ? "var(--gold)" : "var(--forest)";
  return (
    <div className="rounded-lg border border-line-soft bg-surface p-5">
      <div className="text-label">{`Free-nights allowance · ${quota.year}`}</div>
      <div className="flex items-baseline justify-between gap-4 mt-2">
        <div>
          <div className="text-display text-[28px] leading-tight font-medium text-ink tabular-nums">
            {quota.usedNights}{" "}
            <span className="text-ink-tertiary">/ {quota.freeNightsPerYear}</span>
          </div>
          <div className="text-xs text-ink-tertiary mt-1">
            free nights used · {quota.remainingNights} remaining ·{" "}
            {quota.policyName}
          </div>
        </div>
      </div>
      <div className="w-full h-2 rounded-full bg-cream-deep overflow-hidden mt-3">
        <div
          style={{ width: `${usedPct}%`, height: "100%", background: barColor, borderRadius: 999 }}
        />
      </div>
    </div>
  );
}

function VillaPoolCard({
  villa,
  quota,
  coolingOffDays,
  upcomingStays,
}: {
  villa: VillaPoolRow;
  quota: PoolQuota | null;
  coolingOffDays: number;
  upcomingStays: UpcomingOwnerStay[];
}) {
  const router = useRouter();
  const [toggleState, toggleDispatch, togglePending] = useActionState(
    togglePoolStateAction,
    null as PoolActionResult | null,
  );

  useEffect(() => {
    if (toggleState?.ok) router.refresh();
  }, [toggleState, router]);

  const isOut = villa.status === "out_of_pool";
  const nextAction = isOut ? "return" : "take_out";

  return (
    <div className="rounded-lg border border-line-soft bg-surface p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-ink truncate">
            {villaLabel(villa)}
          </div>
          {villa.villaName && villa.villaCode && (
            <div className="text-xs text-ink-tertiary truncate">{villa.villaName}</div>
          )}
        </div>
        <Badge tone={isOut ? "warning" : "success"}>
          {isOut ? "Out of pool" : "In rental pool"}
        </Badge>
      </div>

      {villa.isCoolingOff && villa.pendingStatus && (
        <div className="rounded-sm bg-muted px-3 py-2 text-xs text-ink-secondary">
          {villa.pendingStatus === "out_of_pool"
            ? "Leaving the rental pool"
            : "Returning to the rental pool"}{" "}
          in{" "}
          <span className="font-medium text-ink tabular-nums">
            {villa.coolingOffDaysRemaining} day{villa.coolingOffDaysRemaining === 1 ? "" : "s"}
          </span>{" "}
          (cooling-off ends{" "}
          <span className="tabular-nums">{villa.coolingOffUntil?.slice(0, 10)}</span>).
        </div>
      )}

      <form action={toggleDispatch} className="flex items-center gap-3 flex-wrap">
        <input type="hidden" name="villaId" value={villa.villaId} />
        <input type="hidden" name="action" value={nextAction} />
        <Button
          type="submit"
          variant={isOut ? "secondary" : "subtle"}
          size="sm"
          disabled={togglePending}
        >
          {togglePending
            ? "Saving…"
            : isOut
              ? "Return to pool"
              : "Take out of pool"}
        </Button>
        <span className="text-[11px] text-ink-tertiary">
          {coolingOffDays}-day cooling-off applies.
        </span>
      </form>
      {toggleState && !toggleState.ok && (
        <span className="text-xs text-danger">{toggleState.error}</span>
      )}

      <GridBookingForm villa={villa} quota={quota} />

      {upcomingStays.length > 0 && (
        <UpcomingStaysList stays={upcomingStays} />
      )}
    </div>
  );
}

function GridBookingForm({
  villa,
  quota,
}: {
  villa: VillaPoolRow;
  quota: PoolQuota | null;
}) {
  const router = useRouter();
  const [state, dispatch, pending] = useActionState(
    createOwnerStayFromGridAction,
    null as (PoolActionResult & { requestId?: string }) | null,
  );
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  useEffect(() => {
    if (state?.ok) {
      setStart("");
      setEnd("");
      router.refresh();
    }
  }, [state, router]);

  const nights = useMemo(() => (start && end ? nightsBetween(start, end) : 0), [start, end]);
  const remaining = quota?.remainingNights ?? 0;
  const freeFits = nights > 0 && nights <= remaining;

  return (
    <div className="rounded-md border border-line-soft/70 bg-cream p-3 flex flex-col gap-3">
      <div className="text-label">Book your own stay</div>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-[11px] text-ink-tertiary">
          Check-in
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="h-8 rounded-sm border border-line-soft bg-surface px-2 text-sm text-ink"
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-ink-tertiary">
          Check-out
          <input
            type="date"
            value={end}
            min={start || undefined}
            onChange={(e) => setEnd(e.target.value)}
            className="h-8 rounded-sm border border-line-soft bg-surface px-2 text-sm text-ink"
          />
        </label>
      </div>

      {nights > 0 && (
        <div className="text-[11px] text-ink-tertiary">
          {nights} night{nights === 1 ? "" : "s"} ·{" "}
          {freeFits
            ? `fits your free-nights allowance (${remaining} remaining)`
            : `exceeds your remaining ${remaining} free night${remaining === 1 ? "" : "s"} — pay-&-book applies`}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {/* Two submit buttons share one form; `mode` is set by the clicked button. */}
        <form action={dispatch} className="contents">
          <input type="hidden" name="villaId" value={villa.villaId} />
          <input type="hidden" name="requestedStart" value={start} />
          <input type="hidden" name="requestedEnd" value={end} />
          <Button
            type="submit"
            name="mode"
            value="book_free"
            variant="secondary"
            size="sm"
            disabled={pending || nights <= 0 || !freeFits}
          >
            Book free
          </Button>
          <Button
            type="submit"
            name="mode"
            value="pay_and_book"
            variant="primary"
            size="sm"
            disabled={pending || nights <= 0}
          >
            {pending ? "Submitting…" : "Pay & book"}
          </Button>
        </form>
      </div>
      {state && !state.ok && (
        <span className="text-xs text-danger">{state.error}</span>
      )}
      {state?.ok && (
        <span className="text-xs text-success">
          Stay request submitted — track it on your stays page.
        </span>
      )}
    </div>
  );
}

const STATUS_TONE: Record<string, "neutral" | "info" | "warning" | "success" | "danger"> = {
  requested: "info",
  availability_check: "info",
  requires_relocation: "warning",
  pending_admin_approval: "warning",
  approved: "success",
  confirmed: "success",
};

function UpcomingStaysList({ stays }: { stays: UpcomingOwnerStay[] }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-label">Your upcoming stays</div>
      <ul className="flex flex-col gap-2">
        {stays.map((s) => (
          <UpcomingStayRow key={s.id} stay={s} />
        ))}
      </ul>
    </div>
  );
}

function UpcomingStayRow({ stay }: { stay: UpcomingOwnerStay }) {
  const router = useRouter();
  const [state, dispatch, pending] = useActionState(
    cancelOwnerStayFromGridAction,
    null as PoolActionResult | null,
  );

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <li className="flex items-center justify-between gap-3 rounded-sm border border-line-soft px-3 py-2">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Badge tone={STATUS_TONE[stay.status] ?? "neutral"}>
            {stay.status.replace(/_/g, " ")}
          </Badge>
          <span className="text-[11px] text-ink-tertiary tabular-nums">
            {stay.start} → {stay.end}
          </span>
        </div>
        {state && !state.ok && (
          <span className="text-[11px] text-danger">{state.error}</span>
        )}
      </div>
      <form action={dispatch}>
        <input type="hidden" name="id" value={stay.id} />
        <Button type="submit" variant="ghost" size="sm" disabled={pending}>
          {pending ? "Cancelling…" : "Cancel"}
        </Button>
      </form>
    </li>
  );
}
