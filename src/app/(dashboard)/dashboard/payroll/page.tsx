import Link from "next/link";
import { Kpi, Card, HandoffBadge } from "@/components/dashboard/primitives";
import { listStaff, listPayrollRuns, getPayrollSummary } from "@/features/payroll/services";
import { RunPayroll } from "./run-payroll";
import { StaffRowActions } from "./staff-row-actions";

export const metadata = { title: "Payroll · Staff cost" };
export const dynamic = "force-dynamic";

/** Minor-unit money → "IDR 4,500,000" style, currency-aware. */
function fmtMoney(minor: bigint, currency: string): string {
  const major = Number(minor) / 100;
  return `${currency} ${major.toLocaleString("en-US", {
    minimumFractionDigits: major % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

const COMP_MODE_LABEL: Record<string, string> = {
  salaried: "Salaried",
  per_villa_fixed: "Per villa",
  per_service: "Per service",
};

const BEARER_LABEL: Record<string, string> = {
  owner: "Owner",
  management: "Management",
  shared_pool: "Shared pool",
};

export default async function PayrollPage() {
  const [staffRows, runs, summary] = await Promise.all([
    listStaff(),
    listPayrollRuns(),
    getPayrollSummary(),
  ]);

  const summaryCurrency = summary.currency ?? "IDR";
  const thisMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

  return (
    <>
      <div className="page-header mb-0">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard">Dashboard</Link> /{" "}
            <Link href="/dashboard/finance">Finance</Link> / <span>Payroll</span>
          </div>
          <h1>
            Staff <em>cost</em>
          </h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Model who costs what along two axes — a compensation mode (salaried, per-villa-fixed, or
            ad-hoc per-service) and a cost bearer (owner, management, or shared pool) — then run
            payroll for a month. Each active salaried / per-villa-fixed staff member posts expense
            lines into finance, stamped with their bearer, so the cost flows into owner statements or
            the company P&L exactly like a manual expense. Idempotent: a month can only be posted once.
          </p>
        </div>
        <div className="actions flex items-center gap-2">
          <Link href="/dashboard/payroll/settings" className="btn btn-ghost btn-sm">
            Statutory settings
          </Link>
          <RunPayroll defaultMonth={thisMonth} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-[18px] mb-[18px]">
        <Kpi
          label="Active staff"
          value={summary.activeStaffCount === 0 ? "—" : String(summary.activeStaffCount)}
          sub="included in payroll runs"
        />
        <Kpi
          label="Monthly run rate"
          value={
            summary.activeStaffCount === 0
              ? "—"
              : fmtMoney(summary.monthlyRunRateMinor, summaryCurrency)
          }
          sub="sum of active monthly rates"
          tone={summary.activeStaffCount > 0 ? "accent" : undefined}
        />
        <Kpi
          label="Payroll runs"
          value={summary.runCount === 0 ? "—" : String(summary.runCount)}
          sub="months posted to finance"
        />
        <Kpi label="Roster size" value={staffRows.length === 0 ? "—" : String(staffRows.length)} sub="active + inactive" />
      </div>

      {/* Staff roster */}
      <div className="flex items-center justify-between mt-8 mb-3.5">
        <h2 className="display text-[30px] font-normal m-0">
          Staff <em>roster</em>
        </h2>
        <Link href="/dashboard/payroll/new" className="btn btn-primary btn-sm">
          Add staff
        </Link>
      </div>
      <Card padding="none" overflowHidden className="mb-[18px]">
        {staffRows.length === 0 ? (
          <p className="p-5 text-[13px] text-ink-3 italic m-0">
            No staff yet. Add a housekeeper, pool technician or other recurring staff member with a
            monthly rate — then run payroll to push the cost into finance.
          </p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Role</th>
                <th scope="col">Comp mode</th>
                <th scope="col">Bearer</th>
                <th scope="col">Active window</th>
                <th scope="col" className="num">Assignments</th>
                <th scope="col" className="num">Monthly cost</th>
                <th scope="col">Status</th>
                <th scope="col"></th>
              </tr>
            </thead>
            <tbody>
              {staffRows.map((s) => (
                <tr key={s.id} className={s.active ? "" : "opacity-60"}>
                  <td className="font-medium">{s.fullName}</td>
                  <td>{s.roleLabel}</td>
                  <td className="text-[12px]">
                    <HandoffBadge>{COMP_MODE_LABEL[s.compMode] ?? s.compMode}</HandoffBadge>
                  </td>
                  <td className="text-[12px]">
                    <HandoffBadge tone={s.costBearer === "management" ? undefined : "ok"}>
                      {BEARER_LABEL[s.costBearer] ?? s.costBearer}
                    </HandoffBadge>
                    {s.statutoryEnabled && (
                      <span className="ml-1.5">
                        <HandoffBadge>BPJS/PPh21</HandoffBadge>
                      </span>
                    )}
                  </td>
                  <td className="text-[11px] text-ink-3 mono">
                    {s.hiredOn || s.endedOn ? (
                      <>
                        {s.hiredOn ?? "—"} <span className="text-ink-4">→</span> {s.endedOn ?? "open"}
                      </>
                    ) : (
                      <span className="text-ink-4">always</span>
                    )}
                  </td>
                  <td className="num text-[12px]">
                    {s.compMode === "per_service" ? (
                      <span className="text-ink-4">—</span>
                    ) : (
                      s.assignmentCount
                    )}
                  </td>
                  <td className="num text-terra font-medium">
                    {s.compMode === "per_service" ? (
                      <span className="text-ink-4 font-normal">ad-hoc</span>
                    ) : (
                      fmtMoney(s.monthlyCostMinor, s.currency)
                    )}
                  </td>
                  <td>
                    <HandoffBadge tone={s.active ? "ok" : undefined}>
                      {s.active ? "Active" : "Inactive"}
                    </HandoffBadge>
                  </td>
                  <td>
                    <StaffRowActions id={s.id} active={s.active} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Payroll run history */}
      <h2 className="display text-[30px] mt-8 mb-3.5 font-normal">
        Run <em>history</em>
      </h2>
      <Card padding="none" overflowHidden className="mb-[18px]">
        {runs.length === 0 ? (
          <p className="p-5 text-[13px] text-ink-3 italic m-0">
            No payroll posted yet. Use &quot;Run payroll&quot; above to post the current roster&apos;s
            cost for a month into finance.
          </p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Month</th>
                <th scope="col" className="num">Staff paid</th>
                <th scope="col" className="num">Expense lines</th>
                <th scope="col" className="num">Total posted</th>
                <th scope="col">Posted</th>
                <th scope="col"></th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td className="serif text-[14px]">{r.label}</td>
                  <td className="num">{r.staffCount}</td>
                  <td className="num">{r.expenseCount}</td>
                  <td className="num text-terra font-medium">
                    {fmtMoney(r.totalMinor, r.currency)}
                  </td>
                  <td className="mono text-[11px] text-ink-4">
                    {new Date(r.postedAt).toLocaleDateString("en-GB")}
                  </td>
                  <td className="flex items-center gap-1.5">
                    <Link href={`/dashboard/payroll/runs/${r.id}`} className="btn btn-ghost btn-sm">
                      Payslips →
                    </Link>
                    <Link href={`/dashboard/finance/expenses`} className="btn btn-ghost btn-sm">
                      Finance →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
