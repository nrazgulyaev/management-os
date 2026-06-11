"use client";

import { useState } from "react";
import Link from "next/link";
import { Field, FormShell, inputCls, selectCls, textareaCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { Button } from "@/components/ui/button";
import { MoneyInput } from "@/components/finance/money-input";
import { useModalOrRouteForm } from "@/lib/forms/use-modal-or-route-form";
import type { ActionResult } from "@/features/projects/actions";
import { AssignmentEditor, type AssignmentDraft, type TargetOption } from "./assignment-editor";

type CompMode = "salaried" | "per_villa_fixed" | "per_service";
type CostBearer = "owner" | "management" | "shared_pool";

type PtkpStatus = "TK/0" | "TK/1" | "TK/2" | "TK/3" | "K/0" | "K/1" | "K/2" | "K/3";

export interface StaffFormDefaults {
  id?: string;
  fullName?: string;
  roleLabel?: string;
  compMode?: CompMode;
  costBearer?: CostBearer;
  monthlyRateMinor?: bigint;
  perVillaRateMinor?: bigint | null;
  currency?: string;
  allocationScope?: "villa" | "project_pool" | "company";
  villaId?: string | null;
  projectId?: string | null;
  active?: boolean;
  notes?: string | null;
  assignments?: AssignmentDraft[];
  hiredOn?: string | null;
  endedOn?: string | null;
  rateEffectiveFrom?: string | null;
  statutoryEnabled?: boolean;
  ptkpStatus?: PtkpStatus | null;
  noNpwp?: boolean;
}

export interface StaffFormProps {
  mode: "create" | "edit";
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  villas: TargetOption[];
  projects: TargetOption[];
  cancelHref: string;
  defaults?: StaffFormDefaults;
  /** Whether the org has enabled BPJS/PPh21 (drives the statutory section copy). */
  orgStatutoryEnabled?: boolean;
}

const PTKP_OPTIONS: { value: PtkpStatus; label: string }[] = [
  { value: "TK/0", label: "TK/0 — single, 0 dependents (TER A)" },
  { value: "TK/1", label: "TK/1 — single, 1 dependent (TER A)" },
  { value: "TK/2", label: "TK/2 — single, 2 dependents (TER B)" },
  { value: "TK/3", label: "TK/3 — single, 3 dependents (TER B)" },
  { value: "K/0", label: "K/0 — married, 0 dependents (TER A)" },
  { value: "K/1", label: "K/1 — married, 1 dependent (TER B)" },
  { value: "K/2", label: "K/2 — married, 2 dependents (TER B)" },
  { value: "K/3", label: "K/3 — married, 3 dependents (TER C)" },
];

/** Preset role list from STAFF-COST-MODEL.md with sensible default comp_mode + bearer. */
interface RolePreset {
  role: string;
  compMode: CompMode;
  costBearer: CostBearer;
}
const ROLE_PRESETS: RolePreset[] = [
  { role: "Villa/estate manager (dedicated)", compMode: "salaried", costBearer: "owner" },
  { role: "Portfolio/operations manager (multi-complex)", compMode: "salaried", costBearer: "management" },
  { role: "Housekeeper / cleaner", compMode: "salaried", costBearer: "owner" },
  { role: "Pool technician", compMode: "per_villa_fixed", costBearer: "owner" },
  { role: "Gardener / landscaper", compMode: "per_villa_fixed", costBearer: "owner" },
  { role: "Security guard (villa)", compMode: "salaried", costBearer: "owner" },
  { role: "Security (complex)", compMode: "salaried", costBearer: "shared_pool" },
  { role: "Maintenance technician / handyman", compMode: "per_service", costBearer: "owner" },
  { role: "MEP engineer (oversight)", compMode: "salaried", costBearer: "management" },
  { role: "Front-office / concierge", compMode: "salaried", costBearer: "management" },
  { role: "Driver (dedicated)", compMode: "salaried", costBearer: "owner" },
  { role: "Laundry", compMode: "per_service", costBearer: "owner" },
  { role: "Chef / cook (dedicated)", compMode: "salaried", costBearer: "owner" },
  { role: "Accountant / bookkeeper", compMode: "salaried", costBearer: "management" },
  { role: "IT / network", compMode: "per_service", costBearer: "management" },
];

const COMP_MODE_LABEL: Record<CompMode, string> = {
  salaried: "Salaried — flat monthly amount",
  per_villa_fixed: "Per villa (fixed) — rate × number of assigned villas",
  per_service: "Per service — ad-hoc, not in the monthly run",
};
const COST_BEARER_LABEL: Record<CostBearer, string> = {
  owner: "Owner — itemised on the owner statement at cost",
  management: "Management — absorbed by the company P&L",
  shared_pool: "Shared pool — split across the complex's owners",
};

export function StaffForm({
  mode,
  action,
  villas,
  projects,
  cancelHref,
  defaults,
  orgStatutoryEnabled = false,
}: StaffFormProps) {
  const { state, submitAction } = useModalOrRouteForm<ActionResult>(action);
  const [currency, setCurrency] = useState(defaults?.currency ?? "IDR");
  const [scope, setScope] = useState<"villa" | "project_pool" | "company">(
    defaults?.allocationScope ?? "company",
  );
  const [compMode, setCompMode] = useState<CompMode>(defaults?.compMode ?? "salaried");
  const [costBearer, setCostBearer] = useState<CostBearer>(defaults?.costBearer ?? "owner");
  const [statutoryEnabled, setStatutoryEnabled] = useState<boolean>(
    defaults?.statutoryEnabled ?? false,
  );
  const errs = state && !state.ok ? state.fieldErrors ?? {} : {};

  function applyPreset(role: string) {
    const preset = ROLE_PRESETS.find((p) => p.role === role);
    if (preset) {
      setCompMode(preset.compMode);
      setCostBearer(preset.costBearer);
    }
  }

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
          <Field label="Role" required error={errs.roleLabel?.[0]} hint="Pick a preset to default comp mode + bearer (editable).">
            <input
              name="roleLabel"
              required
              list="role-suggestions"
              defaultValue={defaults?.roleLabel ?? ""}
              onChange={(e) => applyPreset(e.target.value)}
              className={inputCls}
              placeholder="Housekeeper / cleaner"
            />
            <datalist id="role-suggestions">
              {ROLE_PRESETS.map((p) => (
                <option key={p.role} value={p.role} />
              ))}
            </datalist>
          </Field>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field
            label="Compensation mode"
            required
            error={errs.compMode?.[0]}
            hint="How the monthly cost is computed."
          >
            <select
              name="compMode"
              value={compMode}
              onChange={(e) => setCompMode(e.target.value as CompMode)}
              className={selectCls}
            >
              {(Object.keys(COMP_MODE_LABEL) as CompMode[]).map((m) => (
                <option key={m} value={m}>
                  {COMP_MODE_LABEL[m]}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Cost bearer"
            required
            error={errs.costBearer?.[0]}
            hint="Who actually pays — independent of which villa it's attributed to."
          >
            <select
              name="costBearer"
              value={costBearer}
              onChange={(e) => setCostBearer(e.target.value as CostBearer)}
              className={selectCls}
            >
              {(Object.keys(COST_BEARER_LABEL) as CostBearer[]).map((b) => (
                <option key={b} value={b}>
                  {COST_BEARER_LABEL[b]}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {compMode === "per_villa_fixed" ? (
            <MoneyInput
              label="Per-villa rate"
              name="perVillaRateMinor"
              currency={currency}
              defaultValue={defaults?.perVillaRateMinor ?? null}
              error={errs.perVillaRateMinor?.[0]}
              hint="Charged once per assigned villa (× weight)."
            />
          ) : (
            <MoneyInput
              label="Monthly rate"
              name="monthlyRateMinor"
              currency={currency}
              defaultValue={defaults?.monthlyRateMinor ?? null}
              error={errs.monthlyRateMinor?.[0]}
              hint={
                compMode === "per_service"
                  ? "Optional reference rate — per-service staff are not posted in the monthly run."
                  : "What this person costs per month (gross)."
              }
            />
          )}
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

        {/* Effective-dating — drives mid-month proration in the run. */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <Field
            label="Hired on"
            error={errs.hiredOn?.[0]}
            hint="Optional. Prorates the first month by active days."
          >
            <input
              type="date"
              name="hiredOn"
              defaultValue={defaults?.hiredOn ?? ""}
              className={inputCls}
            />
          </Field>
          <Field
            label="Ended on"
            error={errs.endedOn?.[0]}
            hint="Optional. Prorates the last month; nothing posts after this."
          >
            <input
              type="date"
              name="endedOn"
              defaultValue={defaults?.endedOn ?? ""}
              className={inputCls}
            />
          </Field>
          <Field
            label="Rate effective from"
            error={errs.rateEffectiveFrom?.[0]}
            hint="Optional reference only — not used in the proration math."
          >
            <input
              type="date"
              name="rateEffectiveFrom"
              defaultValue={defaults?.rateEffectiveFrom ?? ""}
              className={inputCls}
            />
          </Field>
        </div>

        {/* Indonesian statutory (BPJS / PPh21) — salaried only. */}
        {compMode === "salaried" && (
          <div className="rounded-lg border border-line bg-surface-2/40 p-4 flex flex-col gap-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[13px] font-medium text-ink">
                  Indonesian statutory (BPJS &amp; PPh21)
                </div>
                <p className="text-[12px] text-ink-3 mt-1 max-w-[560px] m-0">
                  When enabled, payroll posts the <em>total employer cost</em> (gross + employer
                  BPJS) for this person, and records a payslip with the employee BPJS + PPh21
                  withholdings. Rates/caps are configurable org defaults (2026 figures); the December
                  annual reconciliation is out of scope.
                </p>
              </div>
            </div>
            {!orgStatutoryEnabled && (
              <div className="rounded-md border border-warn/30 bg-warn-weak/30 px-3 py-2 text-[12px] text-ink-2">
                Your org has not turned on statutory yet. Enable it in{" "}
                <Link href="/dashboard/payroll/settings" className="underline">
                  Payroll settings
                </Link>{" "}
                for BPJS/PPh21 to actually compute on runs.
              </div>
            )}
            <label className="flex items-center gap-2.5 text-[13px] text-ink cursor-pointer">
              <input
                type="checkbox"
                name="statutoryEnabled"
                value="true"
                checked={statutoryEnabled}
                onChange={(e) => setStatutoryEnabled(e.target.checked)}
                className="h-4 w-4 accent-terra"
              />
              Enable BPJS / PPh21 for this staff member
            </label>
            {statutoryEnabled && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <Field
                  label="PTKP status"
                  error={errs.ptkpStatus?.[0]}
                  hint="Marital + dependents at year start — picks the PPh21 TER category."
                >
                  <select
                    name="ptkpStatus"
                    defaultValue={defaults?.ptkpStatus ?? ""}
                    className={selectCls}
                  >
                    <option value="">— Choose PTKP status —</option>
                    {PTKP_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="NPWP" hint="Tick if the employee has no NPWP (adds the +20% PPh21 surcharge).">
                  <label className="flex items-center gap-2.5 text-[13px] text-ink h-[38px] cursor-pointer">
                    <input
                      type="checkbox"
                      name="noNpwp"
                      value="true"
                      defaultChecked={defaults?.noNpwp ?? false}
                      className="h-4 w-4 accent-terra"
                    />
                    No NPWP (apply +20% surcharge)
                  </label>
                </Field>
              </div>
            )}
          </div>
        )}

        {/* Multi-target assignment editor */}
        <Field
          label="Assignments"
          hint="Attach this person to villas and/or projects. Salaried uses the first as its single target; per-villa-fixed posts one line per assignment."
        >
          <AssignmentEditor
            villas={villas}
            projects={projects}
            initial={defaults?.assignments ?? []}
            weightRelevant={compMode === "per_villa_fixed"}
          />
        </Field>

        <Field
          label="Fallback allocation scope"
          required
          error={errs.allocationScope?.[0]}
          hint="Used only when there are no assignments above (single-target staff)."
        >
          <select
            name="allocationScope"
            value={scope}
            onChange={(e) => setScope(e.target.value as typeof scope)}
            className={selectCls}
          >
            <option value="company">Company-level (no specific villa/project)</option>
            <option value="villa">Villa-specific</option>
            <option value="project_pool">Project pool (shared across the project)</option>
          </select>
        </Field>

        {scope === "villa" && (
          <Field label="Fallback villa" error={errs.villaId?.[0]}>
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
          <Field label="Fallback project" error={errs.projectId?.[0]}>
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
