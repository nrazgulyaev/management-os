"use client";

import { useState } from "react";
import Link from "next/link";
import { Field, FormShell, inputCls, selectCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { Button } from "@/components/ui/button";
import { MoneyInput } from "@/components/finance/money-input";
import { useModalOrRouteForm } from "@/lib/forms/use-modal-or-route-form";
import { createRevenueLineAction } from "@/features/finance/actions";
import type { ActionResult } from "@/features/projects/actions";
const REVENUE_TYPES = [
  "nightly",
  "cleaning_fee",
  "extra_guest_fee",
  "early_checkin",
  "late_checkout",
  "transfer",
  "breakfast",
  "massage",
  "laundry",
  "damage_recovery",
  "other",
];

export function RevenueLineForm({
  villas,
  projects,
  onSuccess,
  onCancel,
}: {
  villas: { id: string; label: string }[];
  projects: { id: string; label: string }[];
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const { state, submitAction, pending } = useModalOrRouteForm<ActionResult>(
    createRevenueLineAction,
    { onSuccess },
  );
  const [currency, setCurrency] = useState("USD");
  const errs = state && !state.ok ? state.fieldErrors ?? {} : {};
  return (
    <form action={submitAction}>
      <FormShell
        title="Revenue line"
        footer={
          <>
            {onCancel ? (
              <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
                Cancel
              </Button>
            ) : (
              <Button asChild variant="ghost">
                <Link href="/dashboard/finance/revenue">Cancel</Link>
              </Button>
            )}
            <SubmitButton>Post revenue</SubmitButton>
          </>
        }
      >
        {state && !state.ok && (
          <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
            {state.error}
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Villa" hint="Pick villa OR project, not both">
            <select name="villaId" defaultValue="" className={selectCls}>
              <option value="">—</option>
              {villas.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Project (pool revenue)">
            <select name="projectId" defaultValue="" className={selectCls}>
              <option value="">—</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <Field label="Revenue type" required error={errs.revenueType?.[0]}>
            <select name="revenueType" defaultValue="nightly" className={selectCls}>
              {REVENUE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
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
          <Field label="Service date" required error={errs.serviceDate?.[0]}>
            <input type="date" name="serviceDate" required className={inputCls} />
          </Field>
        </div>

        <Field label="Description" required error={errs.description?.[0]}>
          <input
            name="description"
            required
            className={inputCls}
            placeholder="e.g. 4 nights · ES-S5 · Mr Tanaka"
          />
        </Field>

        <MoneyInput
          label="Amount"
          name="amountMinor"
          required
          currency={currency}
          error={errs.amountMinor?.[0]}
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <Field label="Source">
            <select name="source" defaultValue="manual" className={selectCls}>
              {["manual", "booking", "import", "adjustment"].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Visibility">
            <select name="visibility" defaultValue="internal" className={selectCls}>
              <option value="internal">Internal</option>
              <option value="owner">Owner</option>
              <option value="public">Public</option>
            </select>
          </Field>
          <Field label="Status">
            <select name="status" defaultValue="posted" className={selectCls}>
              <option value="draft">Draft</option>
              <option value="posted">Posted</option>
            </select>
          </Field>
        </div>
      </FormShell>
    </form>
  );
}
