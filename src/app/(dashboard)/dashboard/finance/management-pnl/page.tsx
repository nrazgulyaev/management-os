import Link from "next/link";
import { Kpi, Card, HandoffBadge } from "@/components/dashboard/primitives";
import {
  getManagementPnl,
  listManagementPnlPeriods,
} from "@/features/finance/management-pnl-queries";
import { requireCabinetAccess } from "@/features/keystone/access";
import { CabinetGate } from "@/components/keystone/cabinet-gate";

/**
 * STAFF-COST-MODEL phase 2 — Management P&L / company-margin report.
 *
 * Third leg of the two-axis staff-cost model. Lines with
 * cost_bearer='management' never touch owner payout; until now they vanished
 * after posting. This surface gives them a financial home:
 *
 *     management commission earned − management-borne costs = company net margin
 *
 * Org-scoped (every query ANDs the caller's org) and gated by the Finance
 * cabinet — same gate as the owner-statements surface.
 */

export const metadata = { title: "Finance · Management P&L" };
export const dynamic = "force-dynamic";

const IDR_BILLION_MINOR = 1_000_000_000_00;
const IDR_MILLION_MINOR = 1_000_000_00;
const IDR_K_MINOR = 1_000_00;

function fmtIdr(minor: bigint): string {
  const abs = minor < 0n ? -minor : minor;
  const sign = minor < 0n ? "−" : "";
  if (abs >= BigInt(IDR_BILLION_MINOR)) return `${sign}IDR ${(Number(abs) / IDR_BILLION_MINOR).toFixed(2)}B`;
  if (abs >= BigInt(IDR_MILLION_MINOR)) return `${sign}IDR ${(Number(abs) / IDR_MILLION_MINOR).toFixed(1)}M`;
  return `${sign}IDR ${Math.round(Number(abs) / IDR_K_MINOR)}K`;
}

function fmtIdrFull(minor: bigint): string {
  const abs = minor < 0n ? -minor : minor;
  const sign = minor < 0n ? "−" : "";
  return `${sign}IDR ${(Number(abs) / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

interface PageProps {
  searchParams: Promise<{ period?: string }>;
}

export default async function ManagementPnlPage({ searchParams }: PageProps) {
  const { allowed } = await requireCabinetAccess("finance");
  if (!allowed) return <CabinetGate cabinet="Finance" />;

  const sp = await searchParams;
  const periods = await listManagementPnlPeriods().catch(() => []);
  const selectedPeriod = sp.period ?? periods[0] ?? null;
  const report = selectedPeriod
    ? await getManagementPnl(selectedPeriod).catch(() => null)
    : null;

  const marginTone =
    report == null
      ? undefined
      : report.netMarginMinor > 0n
        ? "success"
        : report.netMarginMinor < 0n
          ? "danger"
          : "warn";

  return (
    <>
      <div className="page-header mb-0">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard">Dashboard</Link> /{" "}
            <Link href="/dashboard/finance">Finance</Link> / <span>Management P&amp;L</span>
          </div>
          <h1>
            Management P&amp;L
            {report ? <> · <em>{report.monthLabel}</em></> : null}
          </h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Company margin for the period: management commission earned on owner
            statements, minus management-borne staff &amp; overhead costs
            (cost_bearer = management). These costs never reduce owner payout —
            this is where they land instead.
          </p>
        </div>
        <div className="actions flex gap-2 items-center">
          <Link href="/dashboard/payroll" className="btn btn-secondary btn-sm">
            Payroll · staff cost
          </Link>
          <form className="flex gap-2 items-center">
            <select
              name="period"
              defaultValue={selectedPeriod ?? ""}
              className="px-2.5 py-1.5 text-[12px] border border-line rounded-md bg-paper"
            >
              {periods.length === 0 ? (
                <option value="">No periods with data</option>
              ) : (
                periods.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))
              )}
            </select>
            <button className="btn btn-primary btn-sm" type="submit">
              View
            </button>
          </form>
        </div>
      </div>

      {report == null ? (
        <Card className="p-5 mt-[18px]">
          <p className="text-[13px] text-ink-3 italic m-0">
            No management P&amp;L data yet. Once owner statements are generated
            (operator commission) and a payroll run posts management-borne staff
            lines, this report populates for the month.
          </p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-[18px] mb-[18px]">
            <Kpi
              label="Commission earned"
              value={report.commissionEarnedMinor === 0n ? "—" : fmtIdr(report.commissionEarnedMinor)}
              sub={`${report.commissionLineCount} management-fee line${report.commissionLineCount === 1 ? "" : "s"}`}
              tone={report.commissionEarnedMinor > 0n ? "accent" : undefined}
            />
            <Kpi
              label="Management-borne costs"
              value={report.managementCostMinor === 0n ? "—" : `−${fmtIdr(report.managementCostMinor)}`}
              sub={`${report.managementCostLineCount} cost line${report.managementCostLineCount === 1 ? "" : "s"}`}
              tone={report.managementCostMinor > 0n ? "warn" : undefined}
            />
            <Kpi
              label="Company net margin"
              value={report.commissionEarnedMinor === 0n && report.managementCostMinor === 0n
                ? "—"
                : fmtIdr(report.netMarginMinor)}
              sub="commission − management costs"
              tone={marginTone}
            />
            <Kpi
              label="Margin %"
              value={report.marginPct == null ? "—" : `${(report.marginPct * 100).toFixed(1)}%`}
              sub="of commission earned"
              tone={
                report.marginPct == null
                  ? undefined
                  : report.marginPct > 0
                    ? "success"
                    : "danger"
              }
            />
          </div>

          <h2 className="display text-[30px] mt-8 mb-3.5 font-normal">
            Management-borne cost breakdown
          </h2>
          <Card padding="none" overflowHidden className="mb-[18px]">
            {report.breakdown.length === 0 ? (
              <p className="p-5 text-[13px] text-ink-3 italic m-0">
                No management-borne cost lines for {report.monthLabel}. All staff
                this month are owner- or shared-pool-borne, or no payroll run has
                posted yet.
              </p>
            ) : (
              <table className="data">
                <thead>
                  <tr>
                    <th>Staff / category</th>
                    <th>Role / type</th>
                    <th>Source</th>
                    <th className="text-right">Lines</th>
                    <th className="text-right">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {report.breakdown.map((b, i) => (
                    <tr key={`${b.label}-${i}`}>
                      <td className="font-medium">{b.label}</td>
                      <td className="text-ink-3">{b.category}</td>
                      <td>
                        <HandoffBadge tone={b.source === "payroll" ? "info" : "soft"}>
                          {b.source}
                        </HandoffBadge>
                      </td>
                      <td className="text-right tabular-nums">{b.lineCount}</td>
                      <td className="text-right tabular-nums" title={fmtIdrFull(b.costMinor)}>
                        −{fmtIdr(b.costMinor)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3} className="font-semibold">Total management-borne</td>
                    <td className="text-right tabular-nums font-semibold">
                      {report.managementCostLineCount}
                    </td>
                    <td
                      className="text-right tabular-nums font-semibold"
                      title={fmtIdrFull(report.managementCostMinor)}
                    >
                      −{fmtIdr(report.managementCostMinor)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </Card>

          <Card className="p-5 mb-[18px]">
            <p className="text-[13px] text-ink-3 m-0">
              <strong className="text-ink">How this ties out:</strong>{" "}
              Commission earned ({fmtIdr(report.commissionEarnedMinor)}) is the sum
              of operator management-fee lines across this org&apos;s owner
              statements for {report.monthLabel}. Management-borne costs (
              {fmtIdr(report.managementCostMinor)}) are posted expense lines with
              cost_bearer = management — they are deliberately excluded from owner
              payouts. The difference is the company&apos;s net margin for the
              month.
            </p>
          </Card>
        </>
      )}
    </>
  );
}
