"use client";

import * as React from "react";
import { useState } from "react";
import Link from "next/link";
import { Field, FormShell, inputCls, selectCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { Button } from "@/components/ui/button";
import { MoneyInput } from "@/components/finance/money-input";
import { useModalOrRouteForm } from "@/lib/forms/use-modal-or-route-form";
import type { ActionResult } from "@/features/projects/actions";

export interface ScopeOption {
  id: string;
  label: string;
}

export interface LedgerLineFormProps {
  title: string;
  cancelHref: string;
  action: (
    prev: ActionResult | null,
    formData: FormData,
  ) => Promise<ActionResult>;
  /** Field name for the date column (e.g. "feeDate", "expenseDate"). */
  dateName: string;
  dateLabel: string;
  /** Free-form category select. */
  categoryName: string;
  categoryLabel: string;
  categoryOptions: string[];
  villas: ScopeOption[];
  projects: ScopeOption[];
  /** Optional booking selector (revenue / fee / expense). */
  bookings?: ScopeOption[];
  /** Optional owner selector (revenue / reserve). */
  owners?: ScopeOption[];
  /** Extra fields rendered after the standard set. */
  extraFields?: React.ReactNode;
  submitLabel?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function LedgerLineForm(props: LedgerLineFormProps) {
  const { state, submitAction, pending } = useModalOrRouteForm<ActionResult>(
    props.action,
    { onSuccess: props.onSuccess },
  );
  const [currency, setCurrency] = useState("USD");
  const errs = state && !state.ok ? state.fieldErrors ?? {} : {};

  return (
    <form action={submitAction}>
      <FormShell
        title={props.title}
        footer={
          <>
            {props.onCancel ? (
              <Button type="button" variant="ghost" onClick={props.onCancel} disabled={pending}>
                Cancel
              </Button>
            ) : (
              <Button asChild variant="ghost">
                <Link href={props.cancelHref}>Cancel</Link>
              </Button>
            )}
            <SubmitButton>{props.submitLabel ?? "Post"}</SubmitButton>
          </>
        }
      >
        {state && !state.ok && (
          <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
            {state.error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Villa" hint="Pick villa OR project as appropriate">
            <select name="villaId" defaultValue="" className={selectCls}>
              <option value="">—</option>
              {props.villas.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Project">
            <select name="projectId" defaultValue="" className={selectCls}>
              <option value="">—</option>
              {props.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {props.bookings && (
          <Field label="Booking (optional)">
            <select name="bookingId" defaultValue="" className={selectCls}>
              <option value="">—</option>
              {props.bookings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          </Field>
        )}

        {props.owners && (
          <Field label="Owner (optional)">
            <select name="ownerId" defaultValue="" className={selectCls}>
              <option value="">—</option>
              {props.owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <Field label={props.categoryLabel} required error={errs[props.categoryName]?.[0]}>
            <select name={props.categoryName} defaultValue={props.categoryOptions[0]} className={selectCls}>
              {props.categoryOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Currency" required error={errs.currency?.[0]}>
            <select name="currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className={selectCls}>
              {["USD", "IDR", "EUR", "GBP", "AUD", "SGD"].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label={props.dateLabel} required error={errs[props.dateName]?.[0]}>
            <input type="date" name={props.dateName} required className={inputCls} />
          </Field>
        </div>

        <Field label="Description" required error={errs.description?.[0]}>
          <input name="description" required className={inputCls} placeholder="Short, traceable label" />
        </Field>

        <MoneyInput
          label="Amount"
          name="amountMinor"
          required
          currency={currency}
          error={errs.amountMinor?.[0]}
          hint="Negative amounts represent reductions (e.g. fee deductions, refunds)."
        />

        {props.extraFields}
      </FormShell>
    </form>
  );
}
