"use client";

import { useState } from "react";
import Link from "next/link";
import { Field, FormShell, inputCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { Button } from "@/components/ui/button";
import { MoneyInput } from "@/components/finance/money-input";
import { useModalOrRouteForm } from "@/lib/forms/use-modal-or-route-form";
import type { ActionResult } from "@/features/projects/actions";

export interface OrgPayrollSettingsDefaults {
  statutoryEnabled: boolean;
  jhtEmployerPct: number;
  jhtEmployeePct: number;
  jkkEmployerPct: number;
  jkmEmployerPct: number;
  jpEmployerPct: number;
  jpEmployeePct: number;
  jpCapMinor: bigint;
  kesehatanEmployerPct: number;
  kesehatanEmployeePct: number;
  kesehatanCapMinor: bigint;
  pph21Enabled: boolean;
  noNpwpSurchargePct: number;
  currency: string;
}

/** A percent input with a trailing %, reusing the terra form styling. */
function PctField({
  label,
  name,
  defaultValue,
  hint,
}: {
  label: string;
  name: string;
  defaultValue: number;
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <div className="relative">
        <input
          type="number"
          step="0.0001"
          min="0"
          max="100"
          name={name}
          defaultValue={defaultValue}
          className={`${inputCls} pr-8`}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-ink-3">%</span>
      </div>
    </Field>
  );
}

export function OrgPayrollSettingsForm({
  action,
  defaults,
}: {
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  defaults: OrgPayrollSettingsDefaults;
}) {
  const { state, submitAction } = useModalOrRouteForm<ActionResult>(action);
  const [statutoryEnabled, setStatutoryEnabled] = useState(defaults.statutoryEnabled);

  return (
    <form action={submitAction}>
      <FormShell
        title="BPJS & PPh21 settings"
        footer={
          <>
            <Button asChild variant="ghost">
              <Link href="/dashboard/payroll">Back to payroll</Link>
            </Button>
            <SubmitButton>Save settings</SubmitButton>
          </>
        }
      >
        {state && state.ok && (
          <div className="rounded-md border border-ok/30 bg-ok-weak/40 px-4 py-2.5 text-sm text-ink">
            Settings saved.
          </div>
        )}
        {state && !state.ok && (
          <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
            {state.error}
          </div>
        )}

        <div className="rounded-md border border-line bg-surface-2/40 px-4 py-3 text-[12px] text-ink-2">
          These are <strong>configurable defaults</strong> seeded with the 2026 Indonesian figures
          (BPJS letter B/1226/022026; PMK 168/2023; PMK 101/2016). Two values change annually and may
          need updating each March: the JP wage cap and the local UMK floor. The December Article-17
          annual reconciliation is out of scope — this models monthly withholding only.
        </div>

        <label className="flex items-center gap-2.5 text-[13px] text-ink cursor-pointer">
          <input
            type="checkbox"
            name="statutoryEnabled"
            value="true"
            checked={statutoryEnabled}
            onChange={(e) => setStatutoryEnabled(e.target.checked)}
            className="h-4 w-4 accent-terra"
          />
          Enable statutory (BPJS / PPh21) for this organisation
        </label>
        {!statutoryEnabled && (
          <p className="text-[12px] text-ink-3 m-0">
            While off, payroll runs behave exactly as before — gross only, no BPJS/PPh21 — even for
            staff with statutory enabled.
          </p>
        )}

        <h3 className="text-[13px] font-medium text-ink mt-2 mb-0">
          BPJS Ketenagakerjaan — JHT (old-age, no cap)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <PctField label="JHT employer" name="jhtEmployerPct" defaultValue={defaults.jhtEmployerPct} />
          <PctField label="JHT employee" name="jhtEmployeePct" defaultValue={defaults.jhtEmployeePct} />
        </div>

        <h3 className="text-[13px] font-medium text-ink mt-2 mb-0">
          JKK (work-accident) &amp; JKM (death) — employer-only
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <PctField
            label="JKK employer (risk tier)"
            name="jkkEmployerPct"
            defaultValue={defaults.jkkEmployerPct}
            hint="0.24 very-low · 0.54 low · 0.89 medium · 1.27 high · 1.74 very-high"
          />
          <PctField label="JKM employer" name="jkmEmployerPct" defaultValue={defaults.jkmEmployerPct} />
        </div>

        <h3 className="text-[13px] font-medium text-ink mt-2 mb-0">
          JP (pension) — capped wage base
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <PctField label="JP employer" name="jpEmployerPct" defaultValue={defaults.jpEmployerPct} />
          <PctField label="JP employee" name="jpEmployeePct" defaultValue={defaults.jpEmployeePct} />
          <MoneyInput
            label="JP wage cap"
            name="jpCapMinor"
            currency={defaults.currency}
            defaultValue={defaults.jpCapMinor}
            hint="Rp11,086,300 eff. March 2026."
          />
        </div>

        <h3 className="text-[13px] font-medium text-ink mt-2 mb-0">
          BPJS Kesehatan (health) — capped wage base
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <PctField
            label="Kesehatan employer"
            name="kesehatanEmployerPct"
            defaultValue={defaults.kesehatanEmployerPct}
          />
          <PctField
            label="Kesehatan employee"
            name="kesehatanEmployeePct"
            defaultValue={defaults.kesehatanEmployeePct}
          />
          <MoneyInput
            label="Kesehatan wage cap"
            name="kesehatanCapMinor"
            currency={defaults.currency}
            defaultValue={defaults.kesehatanCapMinor}
            hint="Rp12,000,000."
          />
        </div>

        <h3 className="text-[13px] font-medium text-ink mt-2 mb-0">PPh21 (income tax, TER monthly)</h3>
        <label className="flex items-center gap-2.5 text-[13px] text-ink cursor-pointer">
          <input
            type="checkbox"
            name="pph21Enabled"
            value="true"
            defaultChecked={defaults.pph21Enabled}
            className="h-4 w-4 accent-terra"
          />
          Withhold PPh21 (TER monthly method; PTKP baked into the category)
        </label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <PctField
            label="No-NPWP surcharge"
            name="noNpwpSurchargePct"
            defaultValue={defaults.noNpwpSurchargePct}
            hint="Extra PPh21 for employees without an NPWP."
          />
          <input type="hidden" name="currency" value={defaults.currency} />
        </div>
      </FormShell>
    </form>
  );
}
