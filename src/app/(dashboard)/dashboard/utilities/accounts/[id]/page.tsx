import Link from "next/link";
import { notFound } from "next/navigation";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { TableEmpty } from "@/components/ui/table-empty";
import {
  getUtilityAccountById,
  listUtilityReadings,
  listUtilityPaymentReminders,
} from "@/features/utilities/services";
import { formatBalanceLabel } from "@/features/utilities/risk-pure";
import {
  detectSpike,
  formatMoneyMinor,
  formatPct,
  lastNMonthKeys,
  monthLabel,
  monthlyConsumption,
  sumAmountsByMonth,
  type SpikeFlag,
} from "@/features/utilities/rollup-pure";
import { RecordReadingForm } from "@/components/utilities/record-reading-form";
import { CreateReminderForm } from "@/components/utilities/create-reminder-form";

export const metadata = { title: "Utility account" };
export const dynamic = "force-dynamic";

const REMINDER_TONES: Record<
  string,
  "info" | "ok" | "warn" | "soft"
> = {
  open: "info",
  paid: "ok",
  overdue: "warn",
  cancelled: "soft",
};

export default async function UtilityAccountDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [account, readings, reminders] = await Promise.all([
    getUtilityAccountById(id),
    // 400 covers >12 months of history for the trend; the table below
    // still shows the latest 50.
    listUtilityReadings({ utilityAccountId: id, limit: 400 }),
    listUtilityPaymentReminders({ utilityAccountId: id, limit: 200 }),
  ]);
  if (!account) notFound();

  const latestBalance = readings.find((r) => r.balanceMinor != null);
  const villaLabel = account.villaCode ?? account.projectName ?? "—";

  // ── 12-month trend (mock §03 — spike investigation) ──────────────
  const trendMonths = lastNMonthKeys(12);
  const meterPoints = readings
    .filter((r) => r.readingType === "meter" && r.readingValue != null)
    .map((r) => ({
      readingAt: r.readingAt,
      readingValue: r.readingValue as number,
    }));
  const consumption = monthlyConsumption(meterPoints);
  const usageByMonth = new Map(consumption.map((c) => [c.month, c.units]));
  const spike = detectSpike(consumption);
  const billedByMonth = sumAmountsByMonth(
    reminders
      .filter(
        (r) =>
          r.status !== "cancelled" &&
          r.amountMinor != null &&
          r.currency === account.currency,
      )
      .map((r) => ({
        month: r.dueDate.slice(0, 7),
        amountMinor: r.amountMinor as number,
      })),
  );
  const hasUsage = trendMonths.some((m) => usageByMonth.has(m));
  const hasBilled = trendMonths.some((m) => (billedByMonth.get(m) ?? 0) > 0);
  const latestMeter = meterPoints[0] ?? null; // readings come newest-first
  const tableReadings = readings.slice(0, 50);
  const visibleReminders = reminders.slice(0, 50);

  return (
    <>
      <div className="page-header mb-0">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/utilities">Utilities</Link> /{" "}
            <Link href="/dashboard/utilities/accounts">Accounts</Link> /{" "}
            <span>{account.utilityType}</span>
          </div>
          <h1>
            {account.utilityType} ·{" "}
            {account.villaCode ?? account.projectName ?? ""}
            {spike && (
              <em
                className={
                  spike.severity === "danger"
                    ? "text-danger italic"
                    : "text-warning italic"
                }
              >
                {" "}
                · spike {formatPct(spike.pct)}
              </em>
            )}
            {account.status !== "active" && (
              <em className="text-terra italic"> · {account.status}</em>
            )}
          </h1>
          <p className="page-header-meta">
            <span>{account.providerName ?? "no provider"}</span>
            <span>{account.tokenMeter ? "token meter" : "billed"}</span>
            {latestBalance && (
              <span>
                balance{" "}
                {formatBalanceLabel(latestBalance.balanceMinor, account.currency)}
              </span>
            )}
            {latestMeter && (
              <span>
                last meter read {latestMeter.readingAt.slice(0, 10)} ·{" "}
                {latestMeter.readingValue.toLocaleString("en-US")}
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 mt-[18px]">
        {/* Left — trend + readings + record */}
        <div className="flex flex-col gap-6 min-w-0">
          <section>
            <div className="flex items-baseline gap-2 mb-3">
              <h2 className="display text-[22px] font-normal">
                12-month trend
                {spike && (
                  <em
                    className={
                      spike.severity === "danger"
                        ? "text-danger italic"
                        : "text-warning italic"
                    }
                  >
                    {" "}
                    · {formatPct(spike.pct)} in {monthLabel(spike.month)}
                  </em>
                )}
              </h2>
            </div>
            {!hasUsage && !hasBilled ? (
              <p className="text-[12.5px] text-ink-3">
                Not enough history to chart yet — log monthly meter readings
                (or bills) and the 12-month trend appears here.
              </p>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {hasUsage && (
                  <TrendCard
                    label="usage · meter units / month"
                    months={trendMonths}
                    valueByMonth={usageByMonth}
                    spike={spike}
                    format={(v) => `${v.toLocaleString("en-US")} units`}
                  />
                )}
                {hasBilled && (
                  <TrendCard
                    label={`billed · ${account.currency} / month`}
                    months={trendMonths}
                    valueByMonth={billedByMonth}
                    format={(v) => formatMoneyMinor(v, account.currency)}
                  />
                )}
              </div>
            )}
            {hasUsage && !spike && consumption.length >= 2 && (
              <p className="mono text-[10.5px] text-ink-4 mt-2">
                no spike — latest month within +15% of the previous month
              </p>
            )}
          </section>

          <section>
            <div className="flex items-baseline gap-2 mb-3">
              <h2 className="display text-[22px] font-normal">
                Readings{" "}
                <em className="text-terra italic">· {readings.length}</em>
              </h2>
              {readings.length > tableReadings.length && (
                <span className="mono text-[10.5px] text-ink-4">
                  latest {tableReadings.length} shown
                </span>
              )}
            </div>
            <div className="card p-0 overflow-hidden">
              <table className="data">
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Type</th>
                    <th scope="col" className="num">Value</th>
                    <th scope="col" className="num">Balance</th>
                    <th scope="col">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {tableReadings.length === 0 ? (
                    <TableEmpty colSpan={5}>No readings yet.</TableEmpty>
                  ) : (
                    tableReadings.map((r) => (
                      <tr key={r.id}>
                        <td className="mono text-[11px] text-ink-3 whitespace-nowrap">
                          {r.readingAt.slice(0, 16).replace("T", " ")}
                        </td>
                        <td className="text-[12px] text-ink-2">
                          {r.readingType}
                        </td>
                        <td className="num">{r.readingValue ?? "—"}</td>
                        <td className="num">
                          {formatBalanceLabel(
                            r.balanceMinor,
                            r.currency ?? account.currency,
                          )}
                        </td>
                        <td className="mono text-[10px] text-ink-4">
                          {r.source}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <div className="flex items-baseline gap-2 mb-3">
              <h2 className="display text-[22px] font-normal">Add a reading</h2>
            </div>
            <RecordReadingForm
              accountId={account.id}
              tokenMeter={account.tokenMeter}
              currency={account.currency}
            />
          </section>

          <section>
            <div className="flex items-baseline gap-2 mb-3">
              <h2 className="display text-[22px] font-normal">
                Reminders{" "}
                <em className="text-terra italic">· {reminders.length}</em>
              </h2>
            </div>
            {visibleReminders.length === 0 ? (
              <p className="text-[12.5px] text-ink-3">No reminders.</p>
            ) : (
              <div className="card overflow-hidden">
                <ul className="divide-y divide-line-soft">
                  {visibleReminders.map((r) => (
                    <li
                      key={r.id}
                      className="px-[18px] py-[13px] flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <HandoffBadge tone={REMINDER_TONES[r.status] ?? "soft"}>
                          {r.status}
                        </HandoffBadge>
                        <span className="mono text-[11px] text-ink-3 tabular-nums">
                          due {r.dueDate}
                        </span>
                        <span className="text-[12.5px] text-ink-2 tabular-nums">
                          {formatBalanceLabel(r.amountMinor, r.currency)}
                        </span>
                      </div>
                      <div className="mono text-[10px] text-ink-4 truncate">
                        {r.linkedExpenseLineId
                          ? "→ expense line"
                          : r.notes
                            ? r.notes.slice(0, 60)
                            : "—"}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="mt-4">
              <CreateReminderForm
                accountId={account.id}
                currency={account.currency}
              />
            </div>
          </section>
        </div>

        {/* Right rail — account meta (the mock's .kv block) */}
        <aside className="flex flex-col gap-4">
          <div className="card px-5 py-[18px]">
            <div className="mono text-[10px] uppercase tracking-[0.16em] text-ink-3 mb-3">
              Account
            </div>
            <dl className="flex flex-col">
              <KvRow label="Status">
                <HandoffBadge tone={account.status === "active" ? "ok" : "soft"}>
                  {account.status}
                </HandoffBadge>
              </KvRow>
              <KvRow label="Provider">
                <span className="text-[12.5px] text-ink-2">
                  {account.providerName ?? "—"}
                </span>
              </KvRow>
              <KvRow label="Meter">
                <span className="text-[12.5px] text-ink-2">
                  {account.tokenMeter ? "token meter" : "billed"}
                </span>
              </KvRow>
              <KvRow label="Villa">
                <span className="text-[12.5px] text-ink-2">{villaLabel}</span>
              </KvRow>
              <KvRow label="Latest balance">
                <span className="mono text-[12px] text-ink tabular-nums">
                  {latestBalance
                    ? formatBalanceLabel(
                        latestBalance.balanceMinor,
                        account.currency,
                      )
                    : "—"}
                </span>
              </KvRow>
              <KvRow label="Low threshold">
                <span className="mono text-[12px] text-ink-2 tabular-nums">
                  {formatBalanceLabel(
                    account.lowBalanceThresholdMinor,
                    account.currency,
                  )}
                </span>
              </KvRow>
              <KvRow label="Critical threshold" last>
                <span className="mono text-[12px] text-ink-2 tabular-nums">
                  {formatBalanceLabel(
                    account.criticalBalanceThresholdMinor,
                    account.currency,
                  )}
                </span>
              </KvRow>
            </dl>
          </div>
        </aside>
      </div>
    </>
  );
}

/**
 * 12-bar monthly trend (mock §03 `.chart-box`). Bar heights are
 * data-driven (% of the window max) — months without data render a
 * muted stub so gaps stay honest.
 */
function TrendCard({
  label,
  months,
  valueByMonth,
  spike,
  format,
}: {
  label: string;
  months: string[];
  valueByMonth: Map<string, number>;
  spike?: SpikeFlag | null;
  format: (v: number) => string;
}) {
  const max = Math.max(
    0,
    ...months.map((m) => valueByMonth.get(m) ?? 0),
  );
  return (
    <div className="card px-4 py-3.5">
      <div className="mono text-[10px] uppercase tracking-[0.14em] text-ink-3 mb-2.5">
        {label}
      </div>
      <div className="flex items-end gap-[3px] h-[90px]">
        {months.map((m) => {
          const v = valueByMonth.get(m);
          if (v == null || max <= 0) {
            return (
              <span
                key={m}
                className="flex-1 rounded-[2px] bg-line-soft h-[3px]"
                title={`${monthLabel(m)} · no data`}
              />
            );
          }
          const pct = Math.max(4, Math.round((v / max) * 100));
          const isSpike = spike?.month === m;
          const color = isSpike
            ? spike?.severity === "danger"
              ? "bg-danger"
              : "bg-warning"
            : "bg-gold";
          return (
            <span
              key={m}
              className={`flex-1 rounded-[2px] ${color}`}
              style={{ height: `${pct}%` }}
              title={`${monthLabel(m)} · ${format(v)}`}
            />
          );
        })}
      </div>
      <div className="flex justify-between mt-1.5 mono text-[9.5px] text-ink-4">
        <span>{monthLabel(months[0])}</span>
        <span>{monthLabel(months[Math.floor(months.length / 2)])}</span>
        <span>{monthLabel(months[months.length - 1])}</span>
      </div>
    </div>
  );
}

function KvRow({
  label,
  children,
  last,
}: {
  label: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={
        "flex items-center justify-between gap-3 py-[9px]" +
        (last ? "" : " border-b border-line-soft")
      }
    >
      <span className="mono text-[10px] uppercase tracking-[0.12em] text-ink-4">
        {label}
      </span>
      <span className="text-right">{children}</span>
    </div>
  );
}
