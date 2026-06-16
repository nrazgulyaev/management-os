import Link from "next/link";
import { getStatementSettings } from "@/features/finance/statement-settings";
import { hasPermission, getCurrentUserContext } from "@/features/auth/permissions";
import { StatementSettingsForm } from "@/components/finance/statement-settings-form";
import { DbStatusNotice } from "@/components/admin/db-status";

export const metadata = { title: "Finance · Statement settings" };
export const dynamic = "force-dynamic";

export default async function StatementSettingsPage() {
  const [settings, ctx] = await Promise.all([
    getStatementSettings(),
    getCurrentUserContext(),
  ]);
  const canWrite = ctx.mode === "demo" || hasPermission(ctx, "finance.write");

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
            Configure what every owner statement includes and how tax and reserve
            are computed. These settings drive the canonical statement engine, so
            changes apply the next time a statement is generated. Leaving the
            defaults reproduces the current behavior exactly.
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

      <StatementSettingsForm settings={settings} readOnly={!canWrite} />
    </div>
  );
}
