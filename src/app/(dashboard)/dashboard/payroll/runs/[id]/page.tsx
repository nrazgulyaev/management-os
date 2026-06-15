import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { payrollRuns } from "@/lib/db/schema/payroll";
import { requireOrgId } from "@/features/auth/require-org";
import { Card, Kpi, HandoffBadge } from "@/components/dashboard/primitives";
import { listRunExpenseLines, listRunPayslips } from "@/features/payroll/services";

export const metadata = { title: "Payroll run · payslips" };
export const dynamic = "force-dynamic";

function fmtMoney(minor: bigint, currency: string): string {
  const major = Number(minor) / 100;
  return `${currency} ${major.toLocaleString("en-US", {
    minimumFractionDigits: major % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Org-scoped run header — null when the run is missing or cross-org. */
async function getRun(id: string) {
  const db = getDb();
  if (!db) return null;
  const organizationId = await requireOrgId();
  const [run] = await db
    .select()
    .from(payrollRuns)
    .where(and(eq(payrollRuns.id, id), eq(payrollRuns.organizationId, organizationId)))
    .limit(1);
  return run ?? null;
}

export default async function PayrollRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = await getRun(id);
  if (!run) notFound();

  const [lines, payslips] = await Promise.all([listRunExpenseLines(id), listRunPayslips(id)]);
  const currency = run.currency;

  // Run-level statutory totals (sum across payslips).
  const totals = payslips.reduce(
    (acc, p) => ({
      gross: acc.gross + p.grossMinor,
      employer: acc.employer + p.employerContribMinor,
      employee: acc.employee + p.employeeBpjsMinor,
      pph21: acc.pph21 + p.pph21Minor,
      net: acc.net + p.netTakeHomeMinor,
      total: acc.total + p.totalEmployerCostMinor,
    }),
    { gross: 0n, employer: 0n, employee: 0n, pph21: 0n, net: 0n, total: 0n },
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/finance">Finance</Link> /{" "}
            <Link href="/dashboard/payroll">Payroll</Link> /{" "}
            <span>{run.label}</span>
          </div>
          <h1>Payroll · {run.label}</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            The expense lines this run posted into finance, plus the BPJS / PPh21
            payslip breakdown for staff with statutory enabled.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Total posted" value={fmtMoney(run.totalMinor, currency)} sub="cost borne by owner / management" tone="accent" />
        <Kpi label="Staff paid" value={String(run.staffCount)} sub="included in this run" />
        <Kpi label="Expense lines" value={String(run.expenseCount)} sub="posted to finance" />
        <Kpi
          label="Payslips"
          value={payslips.length === 0 ? "—" : String(payslips.length)}
          sub="with BPJS / PPh21"
        />
      </div>

      {/* Expense lines */}
      <div>
        <h2 className="display text-[26px] font-normal m-0 mb-3">Posted <em>expense lines</em></h2>
        <Card padding="none" overflowHidden>
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Description</th>
                <th scope="col">Scope</th>
                <th scope="col">Bearer</th>
                <th scope="col" className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id}>
                  <td>{l.description}</td>
                  <td className="text-[12px]">{l.allocationScope}</td>
                  <td className="text-[12px]">
                    <HandoffBadge tone={l.costBearer === "management" ? undefined : "ok"}>
                      {l.costBearer}
                    </HandoffBadge>
                  </td>
                  <td className="num text-terra font-medium">{fmtMoney(l.amountMinor, l.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      {/* Statutory payslips */}
      <div>
        <h2 className="display text-[26px] font-normal m-0 mb-1">Statutory <em>payslips</em></h2>
        <p className="text-[12px] text-ink-3 mt-0 mb-3 max-w-[760px]">
          For staff with BPJS / PPh21 enabled. The posted expense line carries the <strong>total
          employer cost</strong> (gross + employer BPJS). Employee BPJS and PPh21 are withheld from
          gross and remitted to the state — they are <strong>not</strong> extra expense lines. Rates
          are configurable org defaults; the December annual reconciliation is out of scope.
        </p>
        {payslips.length === 0 ? (
          <Card>
            <p className="text-[13px] text-ink-3 italic m-0">
              No statutory payslips for this run. Enable BPJS / PPh21 on salaried staff and turn on
              statutory in{" "}
              <Link href="/dashboard/payroll/settings" className="underline">
                payroll settings
              </Link>
              , then run a future month.
            </p>
          </Card>
        ) : (
          <Card padding="none" overflowHidden>
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Staff</th>
                  <th scope="col" className="num">Gross</th>
                  <th scope="col" className="num">Employer BPJS</th>
                  <th scope="col" className="num">Employee BPJS</th>
                  <th scope="col" className="num">PPh21</th>
                  <th scope="col" className="num">Net take-home</th>
                  <th scope="col" className="num">Total employer cost</th>
                </tr>
              </thead>
              <tbody>
                {payslips.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="font-medium">{p.staffName}</div>
                      <div className="text-[11px] text-ink-4">
                        {p.roleLabel}
                        {p.prorationNumerator < p.prorationDenominator
                          ? ` · prorated ${p.prorationNumerator}/${p.prorationDenominator} days`
                          : ""}
                        {p.terCategory ? ` · TER ${p.terCategory}` : ""}
                      </div>
                      <div className="text-[10px] text-ink-4 mono mt-0.5">
                        JHT {fmtMoney(p.employerJhtMinor, p.currency)} · JKK{" "}
                        {fmtMoney(p.employerJkkMinor, p.currency)} · JKM{" "}
                        {fmtMoney(p.employerJkmMinor, p.currency)} · JP{" "}
                        {fmtMoney(p.employerJpMinor, p.currency)} · Kesehatan{" "}
                        {fmtMoney(p.employerKesehatanMinor, p.currency)}
                      </div>
                    </td>
                    <td className="num">{fmtMoney(p.grossMinor, p.currency)}</td>
                    <td className="num">{fmtMoney(p.employerContribMinor, p.currency)}</td>
                    <td className="num text-ink-3">−{fmtMoney(p.employeeBpjsMinor, p.currency)}</td>
                    <td className="num text-ink-3">−{fmtMoney(p.pph21Minor, p.currency)}</td>
                    <td className="num font-medium">{fmtMoney(p.netTakeHomeMinor, p.currency)}</td>
                    <td className="num text-terra font-medium">
                      {fmtMoney(p.totalEmployerCostMinor, p.currency)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-line font-medium">
                  <td>Run totals</td>
                  <td className="num">{fmtMoney(totals.gross, currency)}</td>
                  <td className="num">{fmtMoney(totals.employer, currency)}</td>
                  <td className="num text-ink-3">−{fmtMoney(totals.employee, currency)}</td>
                  <td className="num text-ink-3">−{fmtMoney(totals.pph21, currency)}</td>
                  <td className="num">{fmtMoney(totals.net, currency)}</td>
                  <td className="num text-terra">{fmtMoney(totals.total, currency)}</td>
                </tr>
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </div>
  );
}
