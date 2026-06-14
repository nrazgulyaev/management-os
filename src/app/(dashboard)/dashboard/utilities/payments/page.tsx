import Link from "next/link";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { listUtilityPaymentReminders } from "@/features/utilities/services";
import { formatBalanceLabel } from "@/features/utilities/risk-pure";
import { MarkPaidButton } from "@/components/utilities/mark-paid-button";

export const metadata = { title: "Utility payments" };
export const dynamic = "force-dynamic";

const STATUS_TONES: Record<string, "soft" | "info" | "warn" | "ok" | "danger"> = {
  open: "info",
  paid: "ok",
  overdue: "warn",
  cancelled: "soft",
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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/utilities">Utilities</Link> /{" "}
            <span>Payments</span>
          </div>
          <h1>Payment reminders</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Operator-side payment ledger. Marking a reminder paid optionally creates an expense_line if the period is open; locked periods are skipped with a clear note.
          </p>
        </div>
      </div>

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

      <div>
        <div className="label mb-2.5">Reminders</div>
        {rows.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            None.
          </p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Villa</th>
                <th scope="col">Type</th>
                <th scope="col">Due</th>
                <th scope="col" className="num">Amount</th>
                <th scope="col">Status</th>
                <th scope="col">Linked</th>
                <th scope="col"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="row-title">{r.villaCode ?? "—"}</td>
                  <td>{r.utilityType ?? "—"}</td>
                  <td className="text-ink-3 num">{r.dueDate}</td>
                  <td className="num">
                    {formatBalanceLabel(r.amountMinor, r.currency)}
                  </td>
                  <td>
                    <HandoffBadge tone={STATUS_TONES[r.status] ?? "soft"}>{r.status}</HandoffBadge>
                  </td>
                  <td className="text-ink-3 text-xs">
                    {r.linkedExpenseLineId ? "expense line" : "—"}
                  </td>
                  <td className="text-right">
                    {r.status === "open" || r.status === "overdue" ? (
                      <MarkPaidButton id={r.id} />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
