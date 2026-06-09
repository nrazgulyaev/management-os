import Link from "next/link";
import { Kpi, Card, HandoffBadge } from "@/components/dashboard/primitives";
import { DbStatusNotice } from "@/components/admin/db-status";
import {
  listOwnerStatements,
  listStatementPeriods,
} from "@/features/finance/services";
import { listVillas } from "@/features/villas/services";
import { listProjects } from "@/features/projects/services";
import { listOwners } from "@/features/owners/services";
import { StatementAddButton } from "@/components/finance/statement-add-button";
import { formatMoneyMinor } from "@/lib/money";
import { ownerStateMgmtLabel } from "@/features/owner-statements/state-machine";

export const metadata = { title: "Owner statements" };
export const dynamic = "force-dynamic";

/** Mock status → handoff badge tone. Maps the live status enum onto the
 *  mockup's draft → approved → settled palette. */
const STATUS_TONE: Record<
  string,
  { tone?: "warn" | "ok" | "gold" | "info" | "danger"; label: string }
> = {
  draft: { tone: "warn", label: "Draft" },
  issued: { tone: "gold", label: "Issued" },
  approved: { tone: "info", label: "Approved" },
  paid: { tone: "ok", label: "Settled" },
  voided: { label: "Voided" },
};

export default async function StatementsPage() {
  const [rows, owners, villas, projects, periods] = await Promise.all([
    listOwnerStatements(),
    listOwners(),
    listVillas(),
    listProjects(),
    listStatementPeriods(),
  ]);
  const ownerOpts = owners.map((o) => ({ id: o.id, label: o.displayName }));
  const villaOpts = villas.map((v) => ({ id: v.id, label: `${v.unitCode} · ${v.projectName}` }));
  const projectOpts = projects.map((p) => ({ id: p.id, label: p.name }));
  const periodOpts = periods.map((p) => ({ id: p.id, label: p.label }));

  const draftCount = rows.filter((s) => s.status === "draft").length;
  const approvedCount = rows.filter((s) => s.status === "approved").length;
  const paidCount = rows.filter((s) => s.status === "paid").length;
  const onTimePct =
    rows.length === 0 ? "—" : `${Math.round((paidCount / rows.length) * 100)}%`;

  return (
    <>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard">Dashboard</Link> /{" "}
            <Link href="/dashboard/finance">Finance</Link> / <span>Statements</span>
          </div>
          <h1>Statements</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Generated from the ledger. Drafts are reproducible — generating again
            replaces lines but preserves the statement code.
          </p>
        </div>
        <div className="actions">
          <StatementAddButton
            owners={ownerOpts}
            villas={villaOpts}
            projects={projectOpts}
            periods={periodOpts}
          />
        </div>
      </div>

      <DbStatusNotice />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-[18px] mb-[18px]">
        <Kpi
          label="Drafts awaiting Director"
          value={draftCount === 0 ? "—" : String(draftCount)}
          sub="review then sign off"
          tone={draftCount > 0 ? "accent" : undefined}
        />
        <Kpi
          label="Approved · awaiting send"
          value={approvedCount === 0 ? "—" : String(approvedCount)}
          sub="download PDF + mark sent"
        />
        <Kpi
          label="Statements · total"
          value={rows.length === 0 ? "—" : String(rows.length)}
          sub={`${paidCount} settled`}
        />
        <Kpi
          label="On-time settlement"
          value={onTimePct}
          sub="SLA: by 5th of month"
          tone={paidCount > 0 ? "success" : undefined}
        />
      </div>

      <Card padding="none" overflowHidden className="mb-[18px]">
        {rows.length === 0 ? (
          <p className="p-5 text-[13px] text-ink-3 italic m-0">
            No statements yet. Generate from the ledger to populate this list.
          </p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Statement</th>
                <th scope="col">Owner</th>
                <th scope="col">Villa</th>
                <th scope="col">Period</th>
                <th scope="col" className="num">Net (IDR)</th>
                <th scope="col">Status</th>
                <th scope="col">Owner state</th>
                <th scope="col"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const status = STATUS_TONE[s.status] ?? { label: s.status };
                return (
                  <tr key={s.id}>
                    <td>
                      <Link
                        href={`/dashboard/finance/statements/${s.id}`}
                        className="mono text-[12px] text-ink hover:text-terra"
                      >
                        {s.statementCode}
                      </Link>
                    </td>
                    <td className="row-title">{s.ownerName}</td>
                    <td className="mono text-[12px]">{s.villaCode ?? "—"}</td>
                    <td className="serif text-[14px]">{s.periodLabel}</td>
                    <td className="num text-terra font-medium">
                      {formatMoneyMinor(s.netPayoutMinor, s.currency)}
                    </td>
                    <td>
                      <HandoffBadge tone={status.tone}>{status.label}</HandoffBadge>
                    </td>
                    <td className="text-ink-3 text-[12px]">
                      {ownerStateMgmtLabel(s.ownerState)}
                    </td>
                    <td className="text-right text-ink-4">→</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
