import Link from "next/link";
import { TableEmpty } from "@/components/ui/table-empty";
import { Kpi } from "@/components/dashboard/primitives";
import { Badge } from "@/components/ui/badge";
import { QueryWarningCard } from "@/components/system/query-warning-card";
import {
  listUtilityAccounts,
  listUtilityPaymentReminders,
  listUtilityReadings,
} from "@/features/utilities/services";
import { listMaintenanceRiskEvents } from "@/features/maintenance-intelligence/services";
import { safeList } from "@/features/system/db-health";

export const metadata = { title: "Utilities" };
export const dynamic = "force-dynamic";

function money(minor: number | null, currency: string | null): string {
  if (minor === null) return "—";
  return `${currency ?? ""} ${Math.round(minor / 100).toLocaleString()}`.trim();
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

export default async function UtilitiesHub() {
  const [accountsResult, openPaymentsResult, allRisksResult, readingsResult] =
    await Promise.all([
      safeList("utility_accounts", () => listUtilityAccounts({ status: "active" })),
      safeList("utility_payment_reminders", () =>
        listUtilityPaymentReminders({ status: ["open", "overdue"], limit: 200 }),
      ),
      safeList("maintenance_risk_events", () =>
        listMaintenanceRiskEvents({ status: "open", limit: 500 }),
      ),
      safeList("utility_readings", () => listUtilityReadings({ limit: 12 })),
    ]);
  const accounts = accountsResult.value;
  const openPayments = openPaymentsResult.value;
  const readings = readingsResult.value;
  const utilityRisks = allRisksResult.value.filter(
    (r) => r.riskType.startsWith("utility_") || r.riskType === "no_recent_reading",
  );

  const tokenMeters = accounts.filter((a) => a.tokenMeter).length;
  const categories = new Set(accounts.map((a) => a.utilityType)).size;

  return (
    <>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard">Dashboard</Link> / <span>Utilities</span>
          </div>
          <h1>Utilities</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            Per-villa accounts (electricity tokens, water, internet, gas…),
            readings, and payment reminders. The risk scanner watches balances +
            reading freshness.
          </p>
        </div>
        <div className="actions">
          <Link href="/dashboard/utilities/villas" className="btn btn-ghost btn-sm">
            By villa
          </Link>
          <Link href="/dashboard/utilities/by-type" className="btn btn-ghost btn-sm">
            By type
          </Link>
          <Link href="/dashboard/utilities/readings" className="btn btn-secondary btn-sm">
            Readings →
          </Link>
          <Link href="/dashboard/utilities/accounts" className="btn btn-accent btn-sm">
            All accounts →
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mt-[18px] mb-[18px]">
        <Kpi label="Accounts" value={String(accounts.length)} sub={`${categories} categories`} />
        <Kpi
          label="Open payments"
          value={String(openPayments.length)}
          sub={openPayments.length > 0 ? "due / overdue" : "all settled"}
          tone={openPayments.length > 0 ? "accent" : undefined}
        />
        <Kpi
          label="Utility risks"
          value={String(utilityRisks.length)}
          sub={utilityRisks.length > 0 ? "balance / reading" : "all clear"}
          tone={utilityRisks.length > 0 ? "accent" : undefined}
        />
        <Kpi label="Token meters" value={String(tokenMeters)} sub="prepaid" tone="gold" />
        <Kpi label="Readings logged" value={String(readings.length)} sub="recent window" />
      </div>

      <QueryWarningCard result={accountsResult} tableName="utility_accounts" />
      <QueryWarningCard result={openPaymentsResult} tableName="utility_payment_reminders" />
      <QueryWarningCard result={allRisksResult} tableName="maintenance_risk_events" />

      {/* Accounts */}
      <div className="flex items-end justify-between mt-2 mb-3.5">
        <h2 className="display text-[22px] font-normal" id="accounts">Accounts</h2>
        <Link
          href="/dashboard/utilities/payments"
          className="text-[12px] text-ink-3 hover:text-ink underline"
        >
          Payments →
        </Link>
      </div>
      <div className="card p-0 overflow-hidden mb-[18px]">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">Account</th>
              <th scope="col">Type</th>
              <th scope="col">Villa / scope</th>
              <th scope="col">Provider</th>
              <th scope="col" className="num">Avg / mo</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {accounts.length === 0 ? (
              <TableEmpty colSpan={6}>No utility accounts yet.</TableEmpty>
            ) : (
              accounts.slice(0, 14).map((a) => (
                <tr key={a.id}>
                  <td className="mono text-[12px]">{a.accountNumber ?? a.providerName ?? "—"}</td>
                  <td>
                    <Badge tone="outline">{a.utilityType}</Badge>
                    {a.tokenMeter && <span className="ml-1.5 text-[10px] text-ink-4">token</span>}
                  </td>
                  <td className="mono text-[12px] text-ink-3">
                    {a.villaCode ?? a.projectName ?? "—"}
                  </td>
                  <td className="text-[12px] text-ink-3">{a.providerName ?? "—"}</td>
                  <td className="num mono text-[12px]">
                    {money(a.averageMonthlyCostMinor, a.currency)}
                  </td>
                  <td>
                    <Badge tone={a.status === "active" ? "success" : "neutral"}>{a.status}</Badge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Recent readings */}
      <h2 className="display text-[22px] font-normal mt-8 mb-3.5" id="readings">
        Recent readings
      </h2>
      <div className="card p-0 overflow-hidden">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">When</th>
              <th scope="col">Villa</th>
              <th scope="col">Type</th>
              <th scope="col" className="num">Reading</th>
              <th scope="col" className="num">Balance</th>
              <th scope="col">Source</th>
            </tr>
          </thead>
          <tbody>
            {readings.length === 0 ? (
              <TableEmpty colSpan={6}>No readings captured yet.</TableEmpty>
            ) : (
              readings.map((r) => (
                <tr key={r.id}>
                  <td className="mono text-[11px] text-ink-3 whitespace-nowrap">
                    {fmtDateTime(r.readingAt)}
                  </td>
                  <td className="mono">{r.villaCode ?? "—"}</td>
                  <td className="text-[12px] text-ink-3">{r.readingType}</td>
                  <td className="num mono text-[12px]">{r.readingValue ?? "—"}</td>
                  <td className="num mono text-[12px]">{money(r.balanceMinor, r.currency)}</td>
                  <td>
                    <Badge tone="outline">{r.source}</Badge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
