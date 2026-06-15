"use client";

import Link from "next/link";
import { useState } from "react";
import { Field, FormShell, inputCls, selectCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { Button } from "@/components/ui/button";
import { MoneyInput } from "@/components/finance/money-input";
import { useModalOrRouteForm } from "@/lib/forms/use-modal-or-route-form";
import { createManagementFeeRuleAction } from "@/features/finance/actions";
import type { ActionResult } from "@/features/projects/actions";

export interface FeeRuleFormOption {
  id: string;
  label: string;
}

const FEE_MODELS: { value: string; label: string }[] = [
  { value: "percent_of_gross", label: "Percent of gross" },
  { value: "percent_of_net", label: "Percent of net" },
  { value: "fixed_monthly", label: "Fixed monthly" },
  { value: "tiered", label: "Tiered" },
  { value: "custom", label: "Custom" },
];

/**
 * Create a management fee rule. Backed by `createManagementFeeRuleAction`
 * (perm `finance.write`, org-scoped). The rule may be scoped to a project
 * or a single villa, or left unscoped (org-wide default). Follows the
 * Modal-First contract (`onSuccess`/`onCancel`). Field names match
 * `managementFeeRuleSchema` exactly.
 */
export function FeeRuleForm({
  projects,
  villas,
  onSuccess,
  onCancel,
}: {
  projects: FeeRuleFormOption[];
  villas: FeeRuleFormOption[];
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const { state, submitAction, pending } = useModalOrRouteForm<ActionResult>(
    createManagementFeeRuleAction,
    { onSuccess },
  );
  const [feeModel, setFeeModel] = useState("percent_of_gross");
  const [currency, setCurrency] = useState("USD");
  const errs = state && !state.ok ? state.fieldErrors ?? {} : {};

  const isPercent = feeModel === "percent_of_gross" || feeModel === "percent_of_net";
  const isFixed = feeModel === "fixed_monthly";

  return (
    <form action={submitAction}>
      <FormShell
        title="Fee rule"
        footer={
          <>
            {onCancel ? (
              <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
                Cancel
              </Button>
            ) : (
              <Button asChild variant="ghost">
                <Link href="/dashboard/finance/fee-rules">Cancel</Link>
              </Button>
            )}
            <SubmitButton>Create rule</SubmitButton>
          </>
        }
      >
        {state && !state.ok && state.error && (
          <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
            {state.error}
          </div>
        )}

        <Field label="Rule name" required error={errs.ruleName?.[0]}>
          <input
            name="ruleName"
            required
            minLength={2}
            maxLength={160}
            className={inputCls}
            placeholder="e.g. Standard 20% of gross"
          />
        </Field>

        <Field label="Fee model" required error={errs.feeModel?.[0]}>
          <select
            name="feeModel"
            value={feeModel}
            onChange={(e) => setFeeModel(e.target.value)}
            className={selectCls}
          >
            {FEE_MODELS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>

        {isPercent && (
          <Field
            label="Fee percent"
            required
            error={errs.feePercent?.[0]}
            hint="0–100. Applied to the selected base each period."
          >
            <input
              name="feePercent"
              type="number"
              min={0}
              max={100}
              step="0.01"
              required
              className={`${inputCls} font-mono tabular-nums`}
              placeholder="20"
            />
          </Field>
        )}

        {isFixed && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <MoneyInput
              label="Fixed amount / month"
              name="fixedAmountMinor"
              required
              currency={currency}
              error={errs.fixedAmountMinor?.[0]}
            />
            <Field label="Currency" required error={errs.currency?.[0]}>
              <select
                name="currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className={selectCls}
              >
                {["USD", "IDR", "EUR", "GBP", "AUD", "SGD"].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}

        {!isPercent && !isFixed && (
          <Field
            label="Currency"
            error={errs.currency?.[0]}
            hint="Optional — used by the resolver for tiered / custom models."
          >
            <select
              name="currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className={selectCls}
            >
              {["USD", "IDR", "EUR", "GBP", "AUD", "SGD"].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field
            label="Project scope"
            error={errs.projectId?.[0]}
            hint="Limit this rule to one project, or leave unscoped (org-wide)."
          >
            <select name="projectId" defaultValue="" className={selectCls}>
              <option value="">— Org-wide —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Villa scope"
            error={errs.villaId?.[0]}
            hint="Limit to a single villa, or leave unscoped."
          >
            <select name="villaId" defaultValue="" className={selectCls}>
              <option value="">— Any villa —</option>
              {villas.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Starts on" required error={errs.startsOn?.[0]}>
            <input name="startsOn" type="date" required className={inputCls} />
          </Field>
          <Field label="Ends on" error={errs.endsOn?.[0]} hint="Optional — leave blank for open-ended.">
            <input name="endsOn" type="date" className={inputCls} />
          </Field>
        </div>

        <Field label="Status" required error={errs.status?.[0]}>
          <select name="status" defaultValue="active" className={selectCls}>
            <option value="active">Active</option>
            <option value="scheduled">Scheduled</option>
            <option value="ended">Ended</option>
          </select>
        </Field>
      </FormShell>
    </form>
  );
}
