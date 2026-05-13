/**
 * Stage 10.6.E.2.5 — Per-org action buttons.
 *
 * Three actions: Extend trial / Mark as comp / Cancel. Each opens a
 * confirm dialog, calls the server action, and surfaces the result
 * inline. Audit + lifecycle events are written by the server action;
 * the client only orchestrates the form input + result feedback.
 */

"use client";

import * as React from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EntityModal } from "@/components/forms/entity-modal";
import {
  cancelSubscriptionAction,
  extendTrialAction,
  markAsCompAction,
} from "@/lib/subscription-os/actions";

export function PerOrgActionButtons({
  organizationCode,
  status,
  isInternalComp,
}: {
  organizationCode: string;
  status: string;
  isInternalComp: boolean;
}) {
  const [openAction, setOpenAction] = React.useState<
    "extend" | "comp" | "cancel" | null
  >(null);
  const close = () => setOpenAction(null);

  const canExtend = status === "trial";
  const canComp = !isInternalComp && status !== "cancelled" && status !== "purged";
  const canCancel = status !== "cancelled" && status !== "cancelling" && status !== "purged";

  return (
    <>
      <Button
        variant="secondary"
        disabled={!canExtend}
        title={canExtend ? undefined : "Only trial subscriptions can be extended"}
        onClick={() => setOpenAction("extend")}
      >
        Extend trial
      </Button>
      <Button
        variant="secondary"
        disabled={!canComp}
        title={canComp ? undefined : "Already comp or cancelled"}
        onClick={() => setOpenAction("comp")}
      >
        Mark as comp
      </Button>
      <Button
        variant="secondary"
        disabled={!canCancel}
        title={canCancel ? undefined : "Already cancelled"}
        onClick={() => setOpenAction("cancel")}
      >
        Cancel
      </Button>

      <EntityModal
        open={openAction === "extend"}
        onClose={close}
        title="Extend trial"
        description={`Push the trial end date forward for ${organizationCode}. Audit-logged.`}
        size="md"
      >
        {openAction === "extend" && (
          <ExtendTrialForm
            organizationCode={organizationCode}
            onDone={close}
          />
        )}
      </EntityModal>

      <EntityModal
        open={openAction === "comp"}
        onClose={close}
        title="Mark as comp"
        description={`Flag ${organizationCode} as internal complimentary (no charge).`}
        size="md"
      >
        {openAction === "comp" && (
          <MarkAsCompForm
            organizationCode={organizationCode}
            onDone={close}
          />
        )}
      </EntityModal>

      <EntityModal
        open={openAction === "cancel"}
        onClose={close}
        title="Cancel subscription"
        description={`Move ${organizationCode}'s subscription to "cancelling". The cron will finalise at currentPeriodEndsAt.`}
        size="md"
      >
        {openAction === "cancel" && (
          <CancelForm organizationCode={organizationCode} onDone={close} />
        )}
      </EntityModal>
    </>
  );
}

// ============================================================================
// Forms
// ============================================================================

function ExtendTrialForm({
  organizationCode,
  onDone,
}: {
  organizationCode: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [days, setDays] = React.useState("14");
  const [err, setErr] = React.useState<string | null>(null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setErr(null);
        const n = Number(days);
        if (!n || n < 1 || n > 90) {
          setErr("Enter a number between 1 and 90");
          return;
        }
        startTransition(async () => {
          const res = await extendTrialAction(organizationCode, n);
          if (!res.ok) {
            setErr(res.error ?? "Failed");
            return;
          }
          router.refresh();
          onDone();
        });
      }}
      className="flex flex-col gap-4 px-5 py-5"
    >
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-label">Additional days</span>
        <input
          type="number"
          min={1}
          max={90}
          value={days}
          onChange={(e) => setDays(e.target.value)}
          className="rounded-md border border-line-soft px-3 py-2 text-sm font-mono"
        />
      </label>
      {err && <p className="text-xs text-danger">{err}</p>}
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Extending…" : `Extend by ${days} days`}
        </Button>
      </div>
    </form>
  );
}

function MarkAsCompForm({
  organizationCode,
  onDone,
}: {
  organizationCode: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setErr(null);
        if (!reason.trim()) {
          setErr("Reason required for audit trail");
          return;
        }
        startTransition(async () => {
          const res = await markAsCompAction(organizationCode, reason);
          if (!res.ok) {
            setErr(res.error ?? "Failed");
            return;
          }
          router.refresh();
          onDone();
        });
      }}
      className="flex flex-col gap-4 px-5 py-5"
    >
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-label">Reason</span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          className="rounded-md border border-line-soft px-3 py-2 text-sm"
          placeholder="e.g. Beta partner — comp through end of pilot"
        />
      </label>
      {err && <p className="text-xs text-danger">{err}</p>}
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Marking…" : "Mark as comp"}
        </Button>
      </div>
    </form>
  );
}

function CancelForm({
  organizationCode,
  onDone,
}: {
  organizationCode: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setErr(null);
        if (!reason.trim()) {
          setErr("Cancellation reason required for audit trail");
          return;
        }
        startTransition(async () => {
          const res = await cancelSubscriptionAction(organizationCode, reason);
          if (!res.ok) {
            setErr(res.error ?? "Failed");
            return;
          }
          router.refresh();
          onDone();
        });
      }}
      className="flex flex-col gap-4 px-5 py-5"
    >
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-label">Cancellation reason</span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          className="rounded-md border border-line-soft px-3 py-2 text-sm"
          placeholder="e.g. Customer requested via email — refund processed separately"
        />
      </label>
      <p className="text-xs text-ink-tertiary">
        This moves the subscription to <strong>cancelling</strong>. The cron
        will finalise to <strong>cancelled</strong> at the end of the current
        period.
      </p>
      {err && <p className="text-xs text-danger">{err}</p>}
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending} variant="destructive">
          {pending ? "Cancelling…" : "Confirm cancellation"}
        </Button>
      </div>
    </form>
  );
}
