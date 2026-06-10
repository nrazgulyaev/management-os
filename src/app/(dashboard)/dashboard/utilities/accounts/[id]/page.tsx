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
    listUtilityReadings({ utilityAccountId: id, limit: 50 }),
    listUtilityPaymentReminders({ utilityAccountId: id, limit: 50 }),
  ]);
  if (!account) notFound();

  const latestBalance = readings.find((r) => r.balanceMinor != null);
  const villaLabel = account.villaCode ?? account.projectName ?? "—";

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
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 mt-[18px]">
        {/* Left — readings + record */}
        <div className="flex flex-col gap-6 min-w-0">
          <section>
            <div className="flex items-baseline gap-2 mb-3">
              <h2 className="display text-[22px] font-normal">
                Readings{" "}
                <em className="text-terra italic">· {readings.length}</em>
              </h2>
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
                  {readings.length === 0 ? (
                    <TableEmpty colSpan={5}>No readings yet.</TableEmpty>
                  ) : (
                    readings.map((r) => (
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
            {reminders.length === 0 ? (
              <p className="text-[12.5px] text-ink-3">No reminders.</p>
            ) : (
              <div className="card overflow-hidden">
                <ul className="divide-y divide-line-soft">
                  {reminders.map((r) => (
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
