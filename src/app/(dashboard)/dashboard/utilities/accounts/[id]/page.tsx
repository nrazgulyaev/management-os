import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/ui/section";
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

const REMINDER_TONES: Record<string, "neutral" | "info" | "warning" | "success" | "danger"> = {
  open: "info",
  paid: "success",
  overdue: "warning",
  cancelled: "neutral",
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

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Utilities", href: "/dashboard/utilities" },
          { label: "Accounts", href: "/dashboard/utilities/accounts" },
          { label: account.utilityType },
        ]}
        title={`${account.utilityType} · ${account.villaCode ?? account.projectName ?? ""}`}
        description={`${account.providerName ?? "no provider"} · ${account.tokenMeter ? "token meter" : "billed"}`}
      />

      <Section eyebrow="Status" title="Account">
        <div className="rounded-md border border-line-soft bg-surface p-5 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <Field label="Status">
            <Badge tone={account.status === "active" ? "success" : "neutral"}>
              {account.status}
            </Badge>
          </Field>
          <Field
            label="Latest balance"
            value={
              latestBalance
                ? formatBalanceLabel(latestBalance.balanceMinor, account.currency)
                : "—"
            }
          />
          <Field
            label="Low threshold"
            value={formatBalanceLabel(account.lowBalanceThresholdMinor, account.currency)}
          />
          <Field
            label="Critical threshold"
            value={formatBalanceLabel(account.criticalBalanceThresholdMinor, account.currency)}
          />
        </div>
      </Section>

      <Section eyebrow="Record" title="Add a reading">
        <RecordReadingForm
          accountId={account.id}
          tokenMeter={account.tokenMeter}
          currency={account.currency}
        />
      </Section>

      <Section eyebrow="Recent" title={`${readings.length} readings`}>
        {readings.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            No readings yet.
          </p>
        ) : (
          <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-ink-tertiary text-[11px] uppercase tracking-widest">
                <tr>
                  <th className="text-left px-3 py-2">When</th>
                  <th className="text-left px-3 py-2">Type</th>
                  <th className="text-right px-3 py-2">Value</th>
                  <th className="text-right px-3 py-2">Balance</th>
                  <th className="text-left px-3 py-2">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {readings.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2 text-ink-tertiary tabular-nums">
                      {r.readingAt.slice(0, 16).replace("T", " ")}
                    </td>
                    <td className="px-3 py-2 text-ink-secondary">{r.readingType}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.readingValue ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatBalanceLabel(r.balanceMinor, r.currency ?? account.currency)}
                    </td>
                    <td className="px-3 py-2 text-ink-tertiary text-xs">{r.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section eyebrow="Payment" title="Add a reminder">
        <CreateReminderForm accountId={account.id} currency={account.currency} />
      </Section>

      <Section eyebrow="Reminders" title={`${reminders.length} rows`}>
        {reminders.length === 0 ? (
          <p className="text-sm text-ink-tertiary">No reminders.</p>
        ) : (
          <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
            <ul className="divide-y divide-line-soft">
              {reminders.map((r) => (
                <li
                  key={r.id}
                  className="p-3 flex items-center justify-between gap-3 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <Badge tone={REMINDER_TONES[r.status] ?? "neutral"}>{r.status}</Badge>
                    <span className="text-ink-tertiary tabular-nums">
                      due {r.dueDate}
                    </span>
                    <span className="text-ink-tertiary">
                      {formatBalanceLabel(r.amountMinor, r.currency)}
                    </span>
                  </div>
                  <div className="text-[11px] text-ink-tertiary">
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
      </Section>
    </div>
  );
}

function Field({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-widest text-ink-tertiary">
        {label}
      </div>
      <div className="mt-1">{children ?? <span>{value}</span>}</div>
    </div>
  );
}
