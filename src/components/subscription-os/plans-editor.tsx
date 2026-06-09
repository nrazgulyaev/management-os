/**
 * P1 (superadmin-plans-console) — Plans & pricing editor (client).
 *
 * Renders the grid of plan cards (price + limits + live org counts) and
 * orchestrates the create / edit modal forms. Mutations are owned by the
 * server actions in `@/lib/subscription-os/plan-actions` — this client
 * only collects input + surfaces the result. Audit + revalidation happen
 * server-side.
 *
 * No real PSP — pricing here mutates the plan CATALOG only (Indonesia
 * rails deferred). Prices entered as major units, stored as MINOR units.
 */

"use client";

import * as React from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { EntityModal } from "@/components/forms/entity-modal";
import {
  createPlanAction,
  updatePlanAction,
  type PlanFormInput,
} from "@/lib/subscription-os/plan-actions";
import type { PlanWithCounts } from "@/lib/subscription-os/queries";

function minorToMajor(minor: bigint | null): string {
  if (minor == null) return "";
  return (Number(minor) / 100).toString();
}

function majorToMinor(major: string): bigint {
  const n = Number(major);
  if (!Number.isFinite(n) || n < 0) return 0n;
  return BigInt(Math.round(n * 100));
}

function fmtMoney(minor: bigint | null, currency: string): string {
  if (minor == null) return "—";
  const n = Number(minor) / 100;
  return `${currency} ${n.toLocaleString("en-US", { minimumFractionDigits: 0 })}`;
}

interface FormState {
  planCode: string;
  displayName: string;
  description: string;
  tierRank: string;
  monthlyPrice: string;
  annualPrice: string;
  currency: string;
  trialPeriodDays: string;
  sortOrder: string;
  isActive: boolean;
  isInternal: boolean;
  isPublic: boolean;
}

function emptyForm(): FormState {
  return {
    planCode: "",
    displayName: "",
    description: "",
    tierRank: "0",
    monthlyPrice: "0",
    annualPrice: "",
    currency: "USD",
    trialPeriodDays: "14",
    sortOrder: "100",
    isActive: true,
    isInternal: false,
    isPublic: true,
  };
}

function formFromPlan(p: PlanWithCounts): FormState {
  return {
    planCode: p.planCode,
    displayName: p.displayName,
    description: p.description ?? "",
    tierRank: String(p.tierRank),
    monthlyPrice: minorToMajor(p.monthlyPriceMinor),
    annualPrice: minorToMajor(p.annualPriceMinor),
    currency: p.currency,
    trialPeriodDays: String(p.trialPeriodDays),
    sortOrder: String(p.sortOrder),
    isActive: p.isActive,
    isInternal: p.isInternal,
    isPublic: p.isPublic,
  };
}

export function PlansEditor({ plans }: { plans: PlanWithCounts[] }) {
  const [mode, setMode] = React.useState<
    { kind: "create" } | { kind: "edit"; plan: PlanWithCounts } | null
  >(null);
  const close = () => setMode(null);

  return (
    <>
      <div className="flex justify-end">
        <Button onClick={() => setMode({ kind: "create" })}>
          <Plus className="w-4 h-4" strokeWidth={1.75} />
          New plan
        </Button>
      </div>

      {plans.length === 0 ? (
        <div className="rounded-lg border border-line-soft bg-surface p-10 text-center text-ink-tertiary">
          No plans configured yet. Create your first plan to start gating
          customers by tier.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {plans.map((p) => (
            <PlanCard
              key={p.id}
              plan={p}
              onEdit={() => setMode({ kind: "edit", plan: p })}
            />
          ))}
        </div>
      )}

      <EntityModal
        open={mode?.kind === "create"}
        onClose={close}
        title="New plan"
        description="Add a plan to the catalog. Pricing is captured here only — no charge is made (manual mark-paid; Indonesia rails deferred)."
        size="lg"
      >
        {mode?.kind === "create" && (
          <PlanForm mode="create" initial={emptyForm()} onDone={close} />
        )}
      </EntityModal>

      <EntityModal
        open={mode?.kind === "edit"}
        onClose={close}
        title={mode?.kind === "edit" ? `Edit ${mode.plan.displayName}` : "Edit plan"}
        description="Update pricing, trial length, and visibility. Plan code is immutable (it is the FK target for subscriptions + features)."
        size="lg"
      >
        {mode?.kind === "edit" && (
          <PlanForm
            mode="edit"
            initial={formFromPlan(mode.plan)}
            onDone={close}
          />
        )}
      </EntityModal>
    </>
  );
}

// ============================================================================
// Plan card
// ============================================================================

function PlanCard({
  plan,
  onEdit,
}: {
  plan: PlanWithCounts;
  onEdit: () => void;
}) {
  return (
    <div className="rounded-lg border border-line-soft bg-surface shadow-soft-card p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-ink font-medium truncate">{plan.displayName}</h3>
            {!plan.isActive && <Badge tone="neutral">inactive</Badge>}
            {plan.isInternal && <Badge tone="gold">internal</Badge>}
            {!plan.isPublic && <Badge tone="outline">private</Badge>}
          </div>
          <span className="text-xs text-ink-tertiary font-mono">
            {plan.planCode}
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={onEdit}>
          <Pencil className="w-4 h-4" strokeWidth={1.75} />
          Edit
        </Button>
      </div>

      <div className="flex items-baseline gap-1.5">
        <span className="text-display text-[24px] leading-none font-medium text-ink">
          {fmtMoney(plan.monthlyPriceMinor, plan.currency)}
        </span>
        <span className="text-xs text-ink-tertiary">/ mo</span>
      </div>

      {plan.description && (
        <p className="text-sm text-ink-secondary leading-relaxed line-clamp-3">
          {plan.description}
        </p>
      )}

      <div className="flex items-center gap-3 text-sm text-ink-secondary">
        <span className="inline-flex items-center gap-1.5">
          <Users className="w-4 h-4 text-ink-tertiary" strokeWidth={1.75} />
          {plan.orgCount} org{plan.orgCount === 1 ? "" : "s"}
        </span>
        <span className="text-ink-tertiary">·</span>
        <span>{plan.activeOrgCount} active</span>
        <span className="text-ink-tertiary">·</span>
        <span>{plan.trialPeriodDays}d trial</span>
      </div>

      {plan.limits.length > 0 && (
        <div className="border-t border-line-soft pt-3 flex flex-col gap-1.5">
          <span className="text-label">Limits &amp; features</span>
          <ul className="flex flex-col gap-1">
            {plan.limits.slice(0, 6).map((l) => (
              <li
                key={l.flagCode}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <span className="text-ink-secondary truncate">
                  {l.flagDisplayName}
                </span>
                <span className="text-ink-tertiary font-mono shrink-0">
                  {!l.isEnabled
                    ? "off"
                    : l.isNumericLimit
                      ? l.limitValue == null
                        ? "∞"
                        : l.limitValue.toString()
                      : "on"}
                </span>
              </li>
            ))}
            {plan.limits.length > 6 && (
              <li className="text-xs text-ink-tertiary">
                +{plan.limits.length - 6} more
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Create / edit form
// ============================================================================

function PlanForm({
  mode,
  initial,
  onDone,
}: {
  mode: "create" | "edit";
  initial: FormState;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = React.useState<FormState>(initial);
  const [err, setErr] = React.useState<string | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  function buildInput(): PlanFormInput {
    return {
      planCode: form.planCode.trim().toLowerCase(),
      displayName: form.displayName.trim(),
      description: form.description.trim() || undefined,
      tierRank: Number(form.tierRank) || 0,
      monthlyPriceMinor: majorToMinor(form.monthlyPrice),
      annualPriceMinor: form.annualPrice.trim()
        ? majorToMinor(form.annualPrice)
        : null,
      currency: form.currency.trim().toUpperCase(),
      trialPeriodDays: Number(form.trialPeriodDays) || 0,
      isActive: form.isActive,
      isInternal: form.isInternal,
      isPublic: form.isPublic,
      sortOrder: Number(form.sortOrder) || 100,
    };
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setErr(null);
        const input = buildInput();
        startTransition(async () => {
          const res =
            mode === "create"
              ? await createPlanAction(input)
              : await updatePlanAction(input.planCode, input);
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-label">Plan code</span>
          <Input
            value={form.planCode}
            onChange={(e) => set("planCode", e.target.value)}
            placeholder="growth-pro"
            disabled={mode === "edit"}
            className="font-mono"
            required
          />
          {mode === "edit" && (
            <span className="text-xs text-ink-tertiary">
              Immutable — it is the FK key for subscriptions.
            </span>
          )}
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-label">Display name</span>
          <Input
            value={form.displayName}
            onChange={(e) => set("displayName", e.target.value)}
            placeholder="Growth Pro"
            required
          />
        </label>
      </div>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-label">Description</span>
        <Textarea
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          rows={2}
          placeholder="Everything in Starter plus advanced reporting and 5 seats."
        />
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-label">Monthly price (major)</span>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={form.monthlyPrice}
            onChange={(e) => set("monthlyPrice", e.target.value)}
            className="font-mono"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-label">Annual price (major)</span>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={form.annualPrice}
            onChange={(e) => set("annualPrice", e.target.value)}
            placeholder="optional"
            className="font-mono"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-label">Currency</span>
          <Select
            value={form.currency}
            onChange={(e) => set("currency", e.target.value)}
          >
            <option value="USD">USD</option>
            <option value="IDR">IDR</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
            <option value="SGD">SGD</option>
            <option value="AUD">AUD</option>
          </Select>
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-label">Tier rank</span>
          <Input
            type="number"
            min={0}
            value={form.tierRank}
            onChange={(e) => set("tierRank", e.target.value)}
            className="font-mono"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-label">Trial days</span>
          <Input
            type="number"
            min={0}
            max={365}
            value={form.trialPeriodDays}
            onChange={(e) => set("trialPeriodDays", e.target.value)}
            className="font-mono"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-label">Sort order</span>
          <Input
            type="number"
            value={form.sortOrder}
            onChange={(e) => set("sortOrder", e.target.value)}
            className="font-mono"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-5 pt-1 text-sm text-ink-secondary">
        <Checkbox
          checked={form.isActive}
          onChange={(e) => set("isActive", e.target.checked)}
          label="Active"
        />
        <Checkbox
          checked={form.isPublic}
          onChange={(e) => set("isPublic", e.target.checked)}
          label="Public (shown on pricing page)"
        />
        <Checkbox
          checked={form.isInternal}
          onChange={(e) => set("isInternal", e.target.checked)}
          label="Internal / comp"
        />
      </div>

      {err && <p className="text-xs text-danger">{err}</p>}

      <div className="flex gap-2 justify-end pt-2">
        <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending
            ? "Saving…"
            : mode === "create"
              ? "Create plan"
              : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
