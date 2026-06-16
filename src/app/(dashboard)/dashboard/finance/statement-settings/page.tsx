import Link from "next/link";
import {
  getStatementSettings,
  listStatementSettingsOverrides,
  listAllStatementCustomDeductions,
} from "@/features/finance/statement-settings";
import { listProjects } from "@/features/projects/services";
import { listOwners } from "@/features/owners/services";
import { hasPermission, getCurrentUserContext } from "@/features/auth/permissions";
import { StatementSettingsForm } from "@/components/finance/statement-settings-form";
import { DbStatusNotice } from "@/components/admin/db-status";

export const metadata = { title: "Finance · Statement settings" };
export const dynamic = "force-dynamic";

export default async function StatementSettingsPage() {
  const [settings, overrideRows, deductionRows, projects, owners, ctx] =
    await Promise.all([
      getStatementSettings(),
      listStatementSettingsOverrides(),
      listAllStatementCustomDeductions(),
      listProjects(),
      listOwners(),
      getCurrentUserContext(),
    ]);
  const canWrite = ctx.mode === "demo" || hasPermission(ctx, "finance.write");

  // Slim, serializable shapes for the client form. customDeductions' bigint is
  // not JSON-serializable across the boundary, so stringify the minor amount.
  const projectOptions = projects.map((p) => ({ id: p.id, name: p.name }));
  const ownerOptions = owners.map((o) => ({ id: o.id, name: o.displayName }));

  const overrides = overrideRows.map((r) => ({
    id: r.id,
    projectId: r.projectId,
    ownerId: r.ownerId,
    includeFees: r.includeFees,
    includeExpenses: r.includeExpenses,
    includeManagementFee: r.includeManagementFee,
    taxMode: r.taxMode,
    taxPct: Number(r.taxPct),
    taxLabel: r.taxLabel,
    reserveMode: r.reserveMode,
    reservePct: Number(r.reservePct),
    reserveLabel: r.reserveLabel,
    mgmtMode: r.mgmtMode,
    mgmtPct: Number(r.mgmtPct),
    mgmtLabel: r.mgmtLabel,
    revenueSource: r.revenueSource,
    statementCurrency: r.statementCurrency,
  }));

  const deductions = deductionRows.map((r) => ({
    id: r.id,
    projectId: r.projectId,
    ownerId: r.ownerId,
    label: r.label,
    mode: (r.mode === "fixed" ? "fixed" : "formula") as "formula" | "fixed",
    pct: r.pct === null ? null : Number(r.pct),
    fixedAmountMinor:
      r.fixedAmountMinor === null ? null : r.fixedAmountMinor.toString(),
    sortOrder: r.sortOrder,
    active: r.active,
  }));

  return (
    <div className="flex flex-col gap-8">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard">Dashboard</Link> /{" "}
            <Link href="/dashboard/finance">Finance</Link> /{" "}
            <span>Statement settings</span>
          </div>
          <h1>Statement settings</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Configure what every owner statement includes and how tax, reserve,
            and the management fee are computed. These settings drive the
            canonical statement engine, so changes apply the next time a
            statement is generated. Leaving the defaults reproduces the current
            behavior exactly. Per-project and per-owner overrides take
            precedence over the org default.
          </p>
        </div>
      </div>

      <DbStatusNotice />

      {!canWrite && (
        <div className="rounded-md border border-line-soft bg-muted/30 px-4 py-3 text-sm text-ink-secondary">
          You have read-only access to finance settings. Editing requires the{" "}
          <code className="text-[12px]">finance.write</code> permission.
        </div>
      )}

      <StatementSettingsForm
        settings={settings}
        overrides={overrides}
        deductions={deductions}
        projects={projectOptions}
        owners={ownerOptions}
        readOnly={!canWrite}
      />
    </div>
  );
}
