import Link from "next/link";
import { Kpi, Card } from "@/components/dashboard/primitives";
import { Badge } from "@/components/ui/badge";
import { QueryWarningCard } from "@/components/system/query-warning-card";
import { safeList } from "@/features/system/db-health";
import {
  listUtilityAccounts,
  listOrgMeterReadings,
  listOrgUtilityBills,
  type UtilityAccountRow,
  type OrgUtilityBillRow,
} from "@/features/utilities/services";
import {
  detectSpike,
  formatPct,
  lastNMonthKeys,
  monthlyConsumption,
  sumByCurrencyLabel,
  type SpikeFlag,
} from "@/features/utilities/rollup-pure";

export const metadata = { title: "Utilities by type" };
export const dynamic = "force-dynamic";

/** Display order + terra/forest/gold accent per type (mock variant C). */
const TYPE_META: { type: string; label: string; accentClass: string }[] = [
  { type: "electricity", label: "Electricity", accentClass: "border-l-gold" },
  { type: "water", label: "Water", accentClass: "border-l-forest" },
  { type: "gas", label: "Gas", accentClass: "border-l-terra" },
  { type: "internet", label: "Internet", accentClass: "border-l-line-strong" },
  { type: "waste", label: "Waste", accentClass: "border-l-line-strong" },
  { type: "security", label: "Security", accentClass: "border-l-line-strong" },
  { type: "other", label: "Other", accentClass: "border-l-line-strong" },
];

interface TypeRollup {
  type: string;
  label: string;
  accentClass: string;
  accounts: UtilityAccountRow[];
  providers: string[];
  planned: string;
  billedMtd: string;
  billedMtdCount: number;
  /** MoM billed delta — only when both months bill in ONE currency. */
  billedMoM: number | null;
  openOrOverdue: number;
  worstSpike: { account: UtilityAccountRow; spike: SpikeFlag } | null;
}

export default async function UtilitiesByType() {
  const [accountsResult, metersResult, billsResult] = await Promise.all([
    safeList("utility_accounts", () => listUtilityAccounts({ status: "active" })),
    safeList("utility_readings", () => listOrgMeterReadings({ sinceMonths: 4 })),
    safeList("utility_payment_reminders", () =>
      listOrgUtilityBills({ sinceMonths: 2 }),
    ),
  ]);
  const accounts = accountsResult.value;
  const meterReadings = metersResult.value;
  const bills = billsResult.value;

  const [prevMonth, currentMonth] = lastNMonthKeys(2);

  const meterByAccount = new Map<string, { readingAt: string; readingValue: number }[]>();
  for (const r of meterReadings) {
    const list = meterByAccount.get(r.utilityAccountId) ?? [];
    list.push({ readingAt: r.readingAt, readingValue: r.readingValue });
    meterByAccount.set(r.utilityAccountId, list);
  }
  const spikeByAccount = new Map<string, SpikeFlag>();
  for (const [accountId, points] of meterByAccount) {
    const spike = detectSpike(monthlyConsumption(points));
    if (spike) spikeByAccount.set(accountId, spike);
  }

  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const billsByType = new Map<string, OrgUtilityBillRow[]>();
  for (const b of bills) {
    const acct = accountById.get(b.utilityAccountId);
    if (!acct) continue;
    const list = billsByType.get(acct.utilityType) ?? [];
    list.push(b);
    billsByType.set(acct.utilityType, list);
  }

  const typesPresent = new Set(accounts.map((a) => a.utilityType));
  const rollups: TypeRollup[] = TYPE_META.filter((m) =>
    typesPresent.has(m.type),
  ).map((m) => {
    const typeAccounts = accounts.filter((a) => a.utilityType === m.type);
    const typeBills = billsByType.get(m.type) ?? [];
    const mtdBills = typeBills.filter((b) => b.dueDate.slice(0, 7) === currentMonth);
    const prevBills = typeBills.filter((b) => b.dueDate.slice(0, 7) === prevMonth);

    // MoM billed change — honest only when one currency on both sides.
    const currencies = new Set(
      [...mtdBills, ...prevBills].map((b) => b.currency),
    );
    let billedMoM: number | null = null;
    if (currencies.size === 1 && mtdBills.length > 0 && prevBills.length > 0) {
      const cur = mtdBills.reduce((s, b) => s + (b.amountMinor ?? 0), 0);
      const prev = prevBills.reduce((s, b) => s + (b.amountMinor ?? 0), 0);
      if (prev > 0) billedMoM = (cur - prev) / prev;
    }

    const worst = typeAccounts
      .map((a) => {
        const spike = spikeByAccount.get(a.id);
        return spike ? { account: a, spike } : null;
      })
      .filter((x): x is { account: UtilityAccountRow; spike: SpikeFlag } =>
        Boolean(x),
      )
      .sort((x, y) => y.spike.pct - x.spike.pct)[0];

    return {
      type: m.type,
      label: m.label,
      accentClass: m.accentClass,
      accounts: typeAccounts,
      providers: [
        ...new Set(typeAccounts.map((a) => a.providerName).filter(Boolean)),
      ] as string[],
      planned: sumByCurrencyLabel(
        typeAccounts.map((a) => ({
          amountMinor: a.averageMonthlyCostMinor,
          currency: a.currency,
        })),
      ),
      billedMtd: sumByCurrencyLabel(
        mtdBills.map((b) => ({ amountMinor: b.amountMinor, currency: b.currency })),
      ),
      billedMtdCount: mtdBills.length,
      billedMoM,
      openOrOverdue: typeBills.filter(
        (b) => b.status === "open" || b.status === "overdue",
      ).length,
      worstSpike: worst ?? null,
    };
  });

  const spikeCount = accounts.filter((a) => spikeByAccount.has(a.id)).length;
  const billedMtdAll = bills.filter((b) => b.dueDate.slice(0, 7) === currentMonth);

  return (
    <>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard">Dashboard</Link> /{" "}
            <Link href="/dashboard/utilities">Utilities</Link> /{" "}
            <span>By type</span>
          </div>
          <h1>
            Utilities <em className="text-terra italic">· by type</em>
          </h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            Electricity, water, gas, internet and the rest — rolled up for
            budgeting. Planned spend per month, billed so far, and the account
            with the sharpest consumption jump in each category.
          </p>
        </div>
        <div className="actions">
          <Link
            href="/dashboard/utilities/villas"
            className="btn btn-secondary btn-sm"
          >
            By villa →
          </Link>
          <Link href="/dashboard/utilities/accounts" className="btn btn-accent btn-sm">
            All accounts →
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mt-[18px] mb-[18px]">
        <Kpi label="Utility types" value={String(rollups.length)} sub="in active use" />
        <Kpi label="Active accounts" value={String(accounts.length)} sub="all villas" />
        <Kpi
          label="Planned / mo"
          value={sumByCurrencyLabel(
            accounts.map((a) => ({
              amountMinor: a.averageMonthlyCostMinor,
              currency: a.currency,
            })),
          )}
          sub="sum of account averages"
        />
        <Kpi
          label="Billed this month"
          value={sumByCurrencyLabel(billedMtdAll)}
          sub={billedMtdAll.length > 0 ? `${billedMtdAll.length} bills due` : "no bills yet"}
        />
        <Kpi
          label="Spike flags"
          value={String(spikeCount)}
          sub={spikeCount > 0 ? "meter jump ≥15% MoM" : "meters steady"}
          tone={spikeCount > 0 ? "warn" : undefined}
        />
      </div>

      <QueryWarningCard result={accountsResult} tableName="utility_accounts" />
      <QueryWarningCard result={metersResult} tableName="utility_readings" />
      <QueryWarningCard result={billsResult} tableName="utility_payment_reminders" />

      {rollups.length === 0 ? (
        <Card padding="default">
          <p className="text-[13px] text-ink-3 m-0">
            No active utility accounts yet — this budgeting view fills in as
            accounts are created.{" "}
            <Link
              href="/dashboard/utilities/accounts/new"
              className="text-terra hover:underline"
            >
              Add the first account →
            </Link>
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
          {rollups.map((r) => (
            <Card
              key={r.type}
              padding="default"
              className={`border-l-[3px] ${r.accentClass}`}
            >
              <div className="flex items-baseline gap-3">
                <span className="display text-[18px] text-ink">{r.label}</span>
                {r.providers.length > 0 && (
                  <span className="mono text-[10.5px] text-ink-4 truncate">
                    {r.providers.slice(0, 3).join(" · ")}
                  </span>
                )}
                <span className="ml-auto mono text-[13px] text-ink tabular-nums">
                  {r.billedMtdCount > 0 ? r.billedMtd : r.planned}
                </span>
              </div>
              <div className="mono text-[10.5px] text-ink-3 mt-1.5 flex gap-3 flex-wrap">
                <span>{r.accounts.length} accounts</span>
                <span>
                  {r.billedMtdCount > 0
                    ? `billed MTD · planned ${r.planned}/mo`
                    : "planned / mo (no bills yet this month)"}
                </span>
                {r.billedMoM != null && (
                  <span
                    className={
                      r.billedMoM >= 0.15
                        ? "text-warning"
                        : r.billedMoM <= -0.05
                          ? "text-ok"
                          : ""
                    }
                  >
                    {formatPct(r.billedMoM)} MoM billed
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2.5 flex-wrap mt-3">
                {r.openOrOverdue > 0 ? (
                  <Badge tone="warning">
                    {r.openOrOverdue} open / overdue
                  </Badge>
                ) : (
                  <Badge tone="outline">no open bills</Badge>
                )}
                {r.worstSpike && (
                  <Link
                    href={`/dashboard/utilities/accounts/${r.worstSpike.account.id}`}
                    className={
                      "mono text-[11px] hover:underline " +
                      (r.worstSpike.spike.severity === "danger"
                        ? "text-danger"
                        : "text-warning")
                    }
                  >
                    spike {formatPct(r.worstSpike.spike.pct)} ·{" "}
                    {r.worstSpike.account.villaCode ??
                      r.worstSpike.account.providerName ??
                      "account"}{" "}
                    →
                  </Link>
                )}
                <Link
                  href="/dashboard/utilities/accounts"
                  className="ml-auto text-[11.5px] text-ink-3 hover:text-ink underline"
                >
                  Accounts →
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
