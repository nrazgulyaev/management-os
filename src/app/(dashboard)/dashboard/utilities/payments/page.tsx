import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/ui/section";
import { listUtilityPaymentReminders } from "@/features/utilities/services";
import { formatBalanceLabel } from "@/features/utilities/risk-pure";
import { MarkPaidButton } from "@/components/utilities/mark-paid-button";

export const metadata = { title: "Utility payments" };
export const dynamic = "force-dynamic";

const STATUS_TONES: Record<string, "neutral" | "info" | "warning" | "success" | "danger"> = {
  open: "info",
  paid: "success",
  overdue: "warning",
  cancelled: "neutral",
};

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const rows = await listUtilityPaymentReminders({
    status: sp.status || undefined,
    limit: 200,
  });
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Utilities", href: "/dashboard/utilities" },
          { label: "Payments" },
        ]}
        title="Payment reminders"
        description="Operator-side payment ledger. Marking a reminder paid optionally creates an expense_line if the period is open; locked periods are skipped with a clear note."
      />

      <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-widest">
        {[
          { label: "All", status: undefined },
          { label: "Open", status: "open" },
          { label: "Paid", status: "paid" },
          { label: "Overdue", status: "overdue" },
        ].map((f) => (
          <Link
            key={f.label}
            href={f.status ? `?status=${f.status}` : "?"}
            className={`px-3 py-1.5 rounded-full border ${
              (sp.status ?? "") === (f.status ?? "")
                ? "bg-ink text-ink-inverse border-ink"
                : "border-line-soft text-ink-secondary hover:border-line-strong"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <Section eyebrow="Reminders" title={`${rows.length} rows`}>
        {rows.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            None.
          </p>
        ) : (
          <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-ink-tertiary text-[11px] uppercase tracking-widest">
                <tr>
                  <th className="text-left px-3 py-2">Villa</th>
                  <th className="text-left px-3 py-2">Type</th>
                  <th className="text-left px-3 py-2">Due</th>
                  <th className="text-right px-3 py-2">Amount</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-left px-3 py-2">Linked</th>
                  <th className="text-right px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2 text-ink font-medium">{r.villaCode ?? "—"}</td>
                    <td className="px-3 py-2 text-ink-secondary">{r.utilityType ?? "—"}</td>
                    <td className="px-3 py-2 text-ink-tertiary tabular-nums">{r.dueDate}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatBalanceLabel(r.amountMinor, r.currency)}
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={STATUS_TONES[r.status] ?? "neutral"}>{r.status}</Badge>
                    </td>
                    <td className="px-3 py-2 text-ink-tertiary text-xs">
                      {r.linkedExpenseLineId ? "expense line" : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {r.status === "open" || r.status === "overdue" ? (
                        <MarkPaidButton id={r.id} />
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
