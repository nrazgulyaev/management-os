import Link from "next/link";
import { DbStatusNotice } from "@/components/admin/db-status";
import { getOrgPayrollSettings } from "@/features/payroll/services";
import { DEFAULT_STATUTORY_SETTINGS } from "@/features/payroll/statutory";
import { updateOrgPayrollSettingsAction } from "@/features/payroll/actions";
import { OrgPayrollSettingsForm, type OrgPayrollSettingsDefaults } from "./settings-form";

export const metadata = { title: "Payroll settings · BPJS / PPh21" };
export const dynamic = "force-dynamic";

export default async function PayrollSettingsPage() {
  const row = await getOrgPayrollSettings();
  // Pre-fill from the org's saved row, else the researched 2026 defaults.
  const defaults: OrgPayrollSettingsDefaults = row
    ? {
        statutoryEnabled: row.statutoryEnabled,
        jhtEmployerPct: Number(row.jhtEmployerPct),
        jhtEmployeePct: Number(row.jhtEmployeePct),
        jkkEmployerPct: Number(row.jkkEmployerPct),
        jkmEmployerPct: Number(row.jkmEmployerPct),
        jpEmployerPct: Number(row.jpEmployerPct),
        jpEmployeePct: Number(row.jpEmployeePct),
        jpCapMinor: row.jpCapMinor,
        kesehatanEmployerPct: Number(row.kesehatanEmployerPct),
        kesehatanEmployeePct: Number(row.kesehatanEmployeePct),
        kesehatanCapMinor: row.kesehatanCapMinor,
        pph21Enabled: row.pph21Enabled,
        noNpwpSurchargePct: Number(row.noNpwpSurchargePct),
        currency: row.currency,
      }
    : {
        statutoryEnabled: DEFAULT_STATUTORY_SETTINGS.statutoryEnabled,
        jhtEmployerPct: DEFAULT_STATUTORY_SETTINGS.jhtEmployerPct,
        jhtEmployeePct: DEFAULT_STATUTORY_SETTINGS.jhtEmployeePct,
        jkkEmployerPct: DEFAULT_STATUTORY_SETTINGS.jkkEmployerPct,
        jkmEmployerPct: DEFAULT_STATUTORY_SETTINGS.jkmEmployerPct,
        jpEmployerPct: DEFAULT_STATUTORY_SETTINGS.jpEmployerPct,
        jpEmployeePct: DEFAULT_STATUTORY_SETTINGS.jpEmployeePct,
        jpCapMinor: DEFAULT_STATUTORY_SETTINGS.jpCapMinor,
        kesehatanEmployerPct: DEFAULT_STATUTORY_SETTINGS.kesehatanEmployerPct,
        kesehatanEmployeePct: DEFAULT_STATUTORY_SETTINGS.kesehatanEmployeePct,
        kesehatanCapMinor: DEFAULT_STATUTORY_SETTINGS.kesehatanCapMinor,
        pph21Enabled: DEFAULT_STATUTORY_SETTINGS.pph21Enabled,
        noNpwpSurchargePct: DEFAULT_STATUTORY_SETTINGS.noNpwpSurchargePct,
        currency: "IDR",
      };

  return (
    <div className="flex flex-col gap-8">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/finance">Finance</Link> /{" "}
            <Link href="/dashboard/payroll">Payroll</Link> /{" "}
            <span>Statutory settings</span>
          </div>
          <h1>Payroll statutory settings</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Indonesian BPJS (Ketenagakerjaan + Kesehatan) and PPh21 (TER monthly)
            rates and caps. Editable defaults — off by default so existing payroll
            is unchanged until you turn it on.
          </p>
        </div>
      </div>
      <DbStatusNotice />
      <OrgPayrollSettingsForm action={updateOrgPayrollSettingsAction} defaults={defaults} />
    </div>
  );
}
