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
} from "@/features/utilities/services";
import {
  detectSpike,
  formatMoneyMinor,
  formatPct,
  lastNMonthKeys,
  monthlyConsumption,
  sumByCurrencyLabel,
  utilityTypeShort,
  type SpikeFlag,
} from "@/features/utilities/rollup-pure";

export const metadata = { title: "Utilities by villa" };
export const dynamic = "force-dynamic";

interface VillaGroup {
  key: string;
  villaId: string | null;
  label: string;
  accounts: UtilityAccountRow[];
}

export default async function UtilitiesByVilla() {
  const [accountsResult, metersResult, billsResult] = await Promise.all([
    safeList("utility_accounts", () => listUtilityAccounts({ status: "active" })),
    safeList("utility_readings", () => listOrgMeterReadings({ sinceMonths: 4 })),
    safeList("utility_payment_reminders", () =>
      listOrgUtilityBills({ sinceMonths: 1 }),
    ),
  ]);
  const accounts = accountsResult.value;
  const meterReadings = metersResult.value;
  const bills = billsResult.value;

  const currentMonth = lastNMonthKeys(1)[0];

  // Spike per account — only where meter history supports a verdict.
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

  // Billed this month per account (due in the current calendar month).
  const billedByAccount = new Map<
    string,
    { amountMinor: number | null; currency: string | null }[]
  >();
  for (const b of bills) {
    if (b.dueDate.slice(0, 7) !== currentMonth) continue;
    const list = billedByAccount.get(b.utilityAccountId) ?? [];
    list.push({ amountMinor: b.amountMinor, currency: b.currency });
    billedByAccount.set(b.utilityAccountId, list);
  }

  // Group accounts: villas first, then project / org-wide accounts.
  const villaGroups = new Map<string, VillaGroup>();
  const sharedGroups = new Map<string, VillaGroup>();
  for (const a of accounts) {
    if (a.villaId) {
      const key = a.villaId;
      const g = villaGroups.get(key) ?? {
        key,
        villaId: a.villaId,
        label: a.villaCode ?? "Unnamed villa",
        accounts: [],
      };
      g.accounts.push(a);
      villaGroups.set(key, g);
    } else {
      const key = a.projectId ?? "org";
      const g = sharedGroups.get(key) ?? {
        key,
        villaId: null,
        label: a.projectName ?? "Org-wide / shared",
        accounts: [],
      };
      g.accounts.push(a);
      sharedGroups.set(key, g);
    }
  }
  const villas = [...villaGroups.values()].sort((x, y) =>
    x.label.localeCompare(y.label),
  );
  const shared = [...sharedGroups.values()].sort((x, y) =>
    x.label.localeCompare(y.label),
  );

  const spikeCount = accounts.filter((a) => spikeByAccount.has(a.id)).length;
  const billedMtdAll = bills.filter((b) => b.dueDate.slice(0, 7) === currentMonth);
  const plannedAll = accounts.map((a) => ({
    amountMinor: a.averageMonthlyCostMinor,
    currency: a.currency,
  }));

  return (
    <>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard">Dashboard</Link> /{" "}
            <Link href="/dashboard/utilities">Utilities</Link> /{" "}
            <span>By villa</span>
          </div>
          <h1>
            Utilities <em className="text-terra italic">· by villa</em>
          </h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            Every villa with its utility accounts rolled up — planned monthly
            cost, what has been billed this month, and a spike flag wherever
            the meter history shows consumption jumping.
          </p>
        </div>
        <div className="actions">
          <Link
            href="/dashboard/utilities/by-type"
            className="btn btn-secondary btn-sm"
          >
            By type →
          </Link>
          <Link href="/dashboard/utilities/accounts" className="btn btn-accent btn-sm">
            All accounts →
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mt-[18px] mb-[18px]">
        <Kpi label="Villas covered" value={String(villas.length)} sub={`${shared.length} shared scopes`} />
        <Kpi label="Active accounts" value={String(accounts.length)} sub="all utility types" />
        <Kpi
          label="Planned / mo"
          value={sumByCurrencyLabel(plannedAll)}
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

      {accounts.length === 0 ? (
        <Card padding="default">
          <p className="text-[13px] text-ink-3 m-0">
            No active utility accounts yet — once accounts are set up per
            villa, this rollup fills in.{" "}
            <Link
              href="/dashboard/utilities/accounts/new"
              className="text-terra hover:underline"
            >
              Add the first account →
            </Link>
          </p>
        </Card>
      ) : (
        <>
          <h2 className="display text-[22px] font-normal mt-2 mb-3.5">
            Villas <em className="text-terra italic">· {villas.length}</em>
          </h2>
          <div className="flex flex-col gap-2.5">
            {villas.length === 0 ? (
              <Card padding="tight">
                <p className="text-[12.5px] text-ink-3 m-0">
                  No accounts are linked to a specific villa yet.
                </p>
              </Card>
            ) : (
              villas.map((g) => (
                <VillaRollupRow
                  key={g.key}
                  group={g}
                  spikeByAccount={spikeByAccount}
                  billedByAccount={billedByAccount}
                />
              ))
            )}
          </div>

          {shared.length > 0 && (
            <>
              <h2 className="display text-[22px] font-normal mt-8 mb-3.5">
                Shared &amp; project accounts{" "}
                <em className="text-terra italic">· {shared.length}</em>
              </h2>
              <div className="flex flex-col gap-2.5">
                {shared.map((g) => (
                  <VillaRollupRow
                    key={g.key}
                    group={g}
                    spikeByAccount={spikeByAccount}
                    billedByAccount={billedByAccount}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}

function VillaRollupRow({
  group,
  spikeByAccount,
  billedByAccount,
}: {
  group: VillaGroup;
  spikeByAccount: Map<string, SpikeFlag>;
  billedByAccount: Map<
    string,
    { amountMinor: number | null; currency: string | null }[]
  >;
}) {
  const planned = sumByCurrencyLabel(
    group.accounts.map((a) => ({
      amountMinor: a.averageMonthlyCostMinor,
      currency: a.currency,
    })),
  );
  const billedItems = group.accounts.flatMap(
    (a) => billedByAccount.get(a.id) ?? [],
  );
  const billed = sumByCurrencyLabel(billedItems);
  const worstSpike = group.accounts
    .map((a) => spikeByAccount.get(a.id))
    .filter((s): s is SpikeFlag => Boolean(s))
    .sort((a, b) => b.pct - a.pct)[0];

  return (
    <Card padding="tight">
      <div className="flex items-baseline gap-3 flex-wrap">
        {group.villaId ? (
          <Link
            href={`/dashboard/villas/${group.villaId}`}
            className="display text-[16px] text-ink hover:text-terra"
          >
            {group.label}
          </Link>
        ) : (
          <span className="display text-[16px] text-ink">{group.label}</span>
        )}
        {worstSpike && (
          <Badge tone={worstSpike.severity === "danger" ? "danger" : "warning"}>
            spike {formatPct(worstSpike.pct)} MoM
          </Badge>
        )}
        <span className="ml-auto mono text-[11px] text-ink-3 tabular-nums">
          planned {planned}/mo
          {billedItems.length > 0 && (
            <span className="text-ink"> · billed MTD {billed}</span>
          )}
        </span>
      </div>
      <div className="flex items-center gap-2 flex-wrap mt-2">
        {group.accounts.map((a) => {
          const spike = spikeByAccount.get(a.id);
          return (
            <Link
              key={a.id}
              href={`/dashboard/utilities/accounts/${a.id}`}
              className={
                "inline-flex items-center gap-1.5 rounded-md border border-line-soft px-2 py-1 mono text-[10.5px] hover:border-terra " +
                (spike
                  ? spike.severity === "danger"
                    ? "text-danger"
                    : "text-warning"
                  : "text-ink-2")
              }
            >
              <span className="uppercase tracking-[0.06em]">
                {utilityTypeShort(a.utilityType)}
              </span>
              <span className="tabular-nums">
                {formatMoneyMinor(a.averageMonthlyCostMinor, a.currency)}
              </span>
              {spike && <span>{formatPct(spike.pct)}</span>}
            </Link>
          );
        })}
      </div>
    </Card>
  );
}
