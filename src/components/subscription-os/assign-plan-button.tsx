/**
 * DOMAIN B (platform-console) — "Assign / change plan" control.
 *
 * Mounted on /platform/[orgCode]. Picks a plan from the active catalog
 * and either CREATES the org_subscriptions row (for /signup orgs that
 * never got one — which is exactly what left Extend-trial / Comp / Cancel
 * inert) or CHANGES the plan on an existing subscription. Calls
 * `assignPlanToOrgAction` (super-admin gated + audited server-side).
 *
 * Honest, pre-PSP: this attaches the catalog tier so feature-gating + the
 * lifecycle FSM work — no Stripe charge is captured. Copy reflects that.
 */

"use client";

import * as React from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { EntityModal } from "@/components/forms/entity-modal";
import { assignPlanToOrgAction } from "@/lib/subscription-os/org-provisioning-actions";
import type { AssignablePlanOption } from "@/lib/subscription-os/queries";

export function AssignPlanButton({
  organizationCode,
  plans,
  hasSubscription,
  currentPlanCode,
}: {
  organizationCode: string;
  plans: AssignablePlanOption[];
  hasSubscription: boolean;
  currentPlanCode: string | null;
}) {
  const [open, setOpen] = React.useState(false);
  const label = hasSubscription ? "Change plan" : "Assign plan";

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <CreditCard className="w-4 h-4" strokeWidth={1.75} />
        {label}
      </Button>
      <EntityModal
        open={open}
        onClose={() => setOpen(false)}
        title={hasSubscription ? "Change plan" : "Assign plan"}
        description={
          hasSubscription
            ? `Change ${organizationCode}'s plan. Operator-assigned — no charge is captured.`
            : `Attach a plan to ${organizationCode}. This creates the subscription so trial / comp / cancel controls become active. No charge is captured.`
        }
        size="md"
      >
        {open && (
          <AssignPlanForm
            organizationCode={organizationCode}
            plans={plans}
            currentPlanCode={currentPlanCode}
            onDone={() => setOpen(false)}
          />
        )}
      </EntityModal>
    </>
  );
}

function AssignPlanForm({
  organizationCode,
  plans,
  currentPlanCode,
  onDone,
}: {
  organizationCode: string;
  plans: AssignablePlanOption[];
  currentPlanCode: string | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = React.useState<string | null>(null);
  const [planCode, setPlanCode] = React.useState<string>(
    currentPlanCode ?? plans[0]?.planCode ?? "",
  );
  const [mode, setMode] = React.useState<"trialing" | "active">("trialing");

  if (plans.length === 0) {
    return (
      <div className="px-5 py-5 flex flex-col gap-4">
        <p className="text-sm text-ink-secondary">
          No active plans exist in the catalog yet. Create one in{" "}
          <span className="font-mono">Plans &amp; pricing</span> first, then
          return here to assign it.
        </p>
        <div className="flex justify-end">
          <Button type="button" variant="ghost" onClick={onDone}>
            Close
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setErr(null);
        if (!planCode) {
          setErr("Pick a plan");
          return;
        }
        startTransition(async () => {
          const res = await assignPlanToOrgAction({
            organizationCode,
            planCode,
            mode,
          });
          if (!res.ok) {
            setErr(res.error ?? "Failed to assign plan");
            return;
          }
          router.refresh();
          onDone();
        });
      }}
      className="flex flex-col gap-4 px-5 py-5"
    >
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-label">Plan</span>
        <Select value={planCode} onChange={(e) => setPlanCode(e.target.value)}>
          {plans.map((p) => (
            <option key={p.planCode} value={p.planCode}>
              {p.displayName} ({p.planCode})
              {p.isInternal ? " · internal" : ""}
            </option>
          ))}
        </Select>
      </label>

      <fieldset className="flex flex-col gap-2 text-sm">
        <span className="text-label">Start state</span>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            name="assign-mode"
            checked={mode === "trialing"}
            onChange={() => setMode("trialing")}
          />
          <span>
            <strong>Trialing</strong> — start a trial window (uses the plan's
            trial length).
          </span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            name="assign-mode"
            checked={mode === "active"}
            onChange={() => setMode("active")}
          />
          <span>
            <strong>Active</strong> — operator-assigned active plan, 30-day
            period. No charge is captured.
          </span>
        </label>
      </fieldset>

      <p className="text-xs text-ink-tertiary leading-relaxed">
        Operator-assigned plan — no Stripe charge is captured (Indonesia
        payment rails deferred). This attaches the catalog tier so feature
        gating + Extend-trial / Comp / Cancel work.
      </p>

      {err && <p className="text-xs text-danger">{err}</p>}

      <div className="flex gap-2 justify-end">
        <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending
            ? "Assigning…"
            : currentPlanCode
              ? "Change plan"
              : "Assign plan"}
        </Button>
      </div>
    </form>
  );
}
