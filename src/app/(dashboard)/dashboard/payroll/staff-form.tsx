"use client";

import { useState } from "react";
import Link from "next/link";
import { Field, FormShell, inputCls, selectCls, textareaCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { Button } from "@/components/ui/button";
import { MoneyInput } from "@/components/finance/money-input";
import { useModalOrRouteForm } from "@/lib/forms/use-modal-or-route-form";
import type { ActionResult } from "@/features/projects/actions";

export interface ScopeOption {
  id: string;
  label: string;
}

export interface StaffFormDefaults {
  id?: string;
  fullName?: string;
  roleLabel?: string;
  monthlyRateMinor?: bigint;
  currency?: string;
  allocationScope?: "villa" | "project_pool" | "company";
  villaId?: string | null;
  projectId?: string | null;
  active?: boolean;
  notes?: string | null;
}

export interface StaffFormProps {
  mode: "create" | "edit";
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  villas: ScopeOption[];
  projects: ScopeOption[];
  cancelHref: string;
  defaults?: StaffFormDefaults;
}

const ROLE_SUGGESTIONS = [
  "Housekeeper",
  "Pool technician",
  "Gardener",
  "Security",
  "Villa manager",
  "Driver",
  "Maintenance technician",
];

export function StaffForm({ mode, action, villas, projects, cancelHref, defaults }: StaffFormProps) {
  const { state, submitAction } = useModalOrRouteForm<ActionResult>(action);
  const [currency, setCurrency] = useState(defaults?.currency ?? "IDR");
  const [scope, setScope] = useState<"villa" | "project_pool" | "company">(
    defaults?.allocationScope ?? "company",
  );
  const errs = state && !state.ok ? state.fieldErrors ?? {} : {};

  return (
    <form action={submitAction}>
      {mode === "edit" && defaults?.id ? (
        <input type="hidden" name="id" value={defaults.id} />
      ) : null}
      <FormShell
        title={mode === "edit" ? "Edit staff member" : "Add staff member"}
        footer={
          <>
            <Button asChild variant="ghost">
              <Link href={cancelHref}>Cancel</Link>
            </Button>
            <SubmitButton>{mode === "edit" ? "Save changes" : "Add staff"}</SubmitButton>
          </>
        }
      >
        {state && !state.ok && (
          <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
            {state.error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Full name" required error={errs.fullName?.[0]}>
            <input
              name="fullName"
              required
              defaultValue={defaults?.fullName ?? ""}
              className={inputCls}
              placeholder="e.g. Putu Adi"
            />
          </Field>
          <Field label="Role" required error={errs.roleLabel?.[0]} hint="e.g. Housekeeper, Pool technician">
            <input
              name="roleLabel"
              required
              list="role-suggestions"
              defaultValue={defaults?.roleLabel ?? ""}
              className={inputCls}
              placeholder="Housekeeper"
            />
            <datalist id="role-suggestions">
              {ROLE_SUGGESTIONS.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          </Field>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <MoneyInput
            label="Monthly rate"
            name="monthlyRateMinor"
            required
            currency={currency}
            defaultValue={defaults?.monthlyRateMinor ?? null}
            error={errs.monthlyRateMinor?.[0]}
            hint="What this person costs per month (gross)."
          />
          <Field label="Currency" required error={errs.currency?.[0]}>
            <select
              name="currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className={selectCls}
            >
              {["IDR", "USD", "EUR", "GBP", "AUD", "SGD"].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field
          label="Allocation scope"
          required
          error={errs.allocationScope?.[0]}
          hint="Where this person's monthly cost lands when payroll runs."
        >
          <select
            name="allocationScope"
            value={scope}
            onChange={(e) => setScope(e.target.value as typeof scope)}
            className={selectCls}
          >
            <option value="company">Company-absorbed (not charged to owners)</option>
            <option value="villa">Villa-specific (charged to that villa&apos;s owners)</option>
            <option value="project_pool">Project pool (shared across the project)</option>
          </select>
        </Field>

        {scope === "villa" && (
          <Field label="Villa" required error={errs.villaId?.[0]}>
            <select name="villaId" defaultValue={defaults?.villaId ?? ""} className={selectCls}>
              <option value="">— Choose a villa —</option>
              {villas.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </Field>
        )}

        {scope === "project_pool" && (
          <Field label="Project" required error={errs.projectId?.[0]}>
            <select name="projectId" defaultValue={defaults?.projectId ?? ""} className={selectCls}>
              <option value="">— Choose a project —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
        )}

        {mode === "edit" && (
          <Field label="Status">
            <select name="active" defaultValue={defaults?.active === false ? "false" : "true"} className={selectCls}>
              <option value="true">Active (included in payroll runs)</option>
              <option value="false">Inactive (skipped)</option>
            </select>
          </Field>
        )}

        <Field label="Notes" error={errs.notes?.[0]}>
          <textarea
            name="notes"
            defaultValue={defaults?.notes ?? ""}
            className={textareaCls}
            rows={2}
            placeholder="Optional — contract terms, schedule, etc."
          />
        </Field>
      </FormShell>
    </form>
  );
}
