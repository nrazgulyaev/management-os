import Link from "next/link";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DbStatusNotice } from "@/components/admin/db-status";
import { listManagementFeeRules } from "@/features/finance/services";
import { listProjects } from "@/features/projects/services";
import { listVillas } from "@/features/villas/services";
import { FeeRuleAddButton } from "@/components/finance/fee-rule-add-button";

export const metadata = { title: "Management fee rules" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "success" | "warning" | "neutral"> = {
  active: "success",
  scheduled: "warning",
  ended: "neutral",
};

const FEE_MODEL_LABEL: Record<string, string> = {
  percent_of_gross: "% of gross",
  percent_of_net: "% of net",
  fixed_monthly: "Fixed / month",
  tiered: "Tiered",
  custom: "Custom",
};

function fmtMinor(minor: bigint | null, currency: string | null): string {
  if (minor === null) return "—";
  const major = (Number(minor) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${currency ?? ""} ${major}`.trim();
}

export default async function FeeRulesPage() {
  const [rules, projects, villas] = await Promise.all([
    listManagementFeeRules(),
    listProjects(),
    listVillas(),
  ]);

  const projectName = new Map(projects.map((p) => [p.id, p.name]));
  const villaCode = new Map(villas.map((v) => [v.id, v.unitCode]));

  const projectOptions = projects.map((p) => ({ id: p.id, label: p.name }));
  const villaOptions = villas.map((v) => ({
    id: v.id,
    label: v.name ? `${v.unitCode} · ${v.name}` : v.unitCode,
  }));

  return (
    <div className="flex flex-col gap-8">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard">Dashboard</Link> /{" "}
            <Link href="/dashboard/finance">Finance</Link> / <span>Fee rules</span>
          </div>
          <h1>Management fee rules</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            How the management fee is computed per statement. Scope a rule to a
            project or a single villa, or leave it org-wide. The most specific
            active rule applies when a statement is generated.
          </p>
        </div>
        <div className="actions">
          <FeeRuleAddButton projects={projectOptions} villas={villaOptions} />
        </div>
      </div>
      <DbStatusNotice />
      <Table>
        <THead>
          <TR>
            <TH>Rule</TH>
            <TH>Model</TH>
            <TH>Rate / amount</TH>
            <TH>Scope</TH>
            <TH>Effective</TH>
            <TH>Status</TH>
          </TR>
        </THead>
        <TBody>
          {rules.length === 0 ? (
            <TR>
              <TD colSpan={6} className="text-center py-8 text-ink-tertiary">
                No fee rules yet. Create one to drive management-fee computation
                on owner statements.
              </TD>
            </TR>
          ) : (
            rules.map((r) => (
              <TR key={r.id}>
                <TD className="text-ink">{r.ruleName}</TD>
                <TD className="text-sm text-ink-tertiary">
                  {FEE_MODEL_LABEL[r.feeModel] ?? r.feeModel}
                </TD>
                <TD className="text-sm tabular-nums">
                  {r.feePercent !== null
                    ? `${r.feePercent}%`
                    : r.fixedAmountMinor !== null
                      ? fmtMinor(r.fixedAmountMinor, r.currency)
                      : "—"}
                </TD>
                <TD className="text-sm text-ink-tertiary">
                  {r.villaId
                    ? (villaCode.get(r.villaId) ?? "Villa")
                    : r.projectId
                      ? (projectName.get(r.projectId) ?? "Project")
                      : "Org-wide"}
                </TD>
                <TD className="text-xs text-ink-tertiary tabular-nums">
                  {r.startsOn}
                  {r.endsOn ? ` → ${r.endsOn}` : " → open"}
                </TD>
                <TD>
                  <Badge tone={STATUS_TONE[r.status] ?? "neutral"}>{r.status}</Badge>
                </TD>
              </TR>
            ))
          )}
        </TBody>
      </Table>
    </div>
  );
}
