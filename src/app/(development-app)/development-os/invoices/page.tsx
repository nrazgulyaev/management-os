import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Wallet } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Kpi, HandoffBadge } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { formatDate, formatUSD } from "@/lib/utils";
import { getInvoices } from "@/lib/development/server/invoices";
import {
  INVOICE_STATUS_LABEL,
  INVOICE_TYPE_LABEL,
} from "@/lib/development/constants/payment-constants";
import type { InvoiceStatus } from "@/lib/development/types/payments";

export const metadata: Metadata = { title: "Invoices · Development OS" };
export const dynamic = "force-dynamic";

const statusTone: Record<
  InvoiceStatus,
  "ok" | "warn" | "danger" | "info" | "amber" | "soft" | undefined
> = {
  draft: "soft",
  sent: "amber",
  viewed: "amber",
  paid: "ok",
  overdue: "danger",
  void: "soft",
};

function fmtUsd(minor: bigint): string {
  return formatUSD(Number(minor) / 100);
}

/** Abbreviated USD for KPI tiles — `$2.1M` / `$1.8M`, matching the mockup. */
function fmtAbbrevUsd(minor: bigint): string {
  const usd = Number(minor) / 100;
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
  if (usd >= 1_000) return `$${Math.round(usd / 1_000)}K`;
  return `$${Math.round(usd)}`;
}

export default async function InvoicesPage() {
  const invoices = await getInvoices();
  const unpaid = invoices.filter(
    (i) => i.status !== "paid" && i.status !== "void",
  );
  const paid = invoices.filter((i) => i.status === "paid");
  const overdue = invoices.filter((i) => i.status === "overdue");

  const unpaidOpenUsdMinor = unpaid.reduce((acc, i) => acc + i.amountUsdMinor, 0n);

  // Paid month-to-date — sum of invoices marked paid within the current
  // calendar month (falls back to all paid when paidAt is absent).
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const paidMtd = paid.filter((i) =>
    i.paidAt ? new Date(i.paidAt) >= monthStart : false,
  );
  const paidMtdUsdMinor = paidMtd.reduce((acc, i) => acc + i.amountUsdMinor, 0n);

  return (
    <DevelopmentShell>
      <div className="section-heading">
        <div className="eyebrow label">Sales · milestone invoices</div>
        <h1>
          Issued against <em>milestones</em>.
        </h1>
        <p>
          Invoices fire on a contract milestone&apos;s pre-invoice or due-date
          trigger. PDF generation and multi-language rendering wire up next.
        </p>
      </div>

      <div className="flex justify-end gap-2 mb-[22px]">
        <button type="button" className="btn btn-accent btn-sm">
          + Issue invoice
        </button>
        <Link href="/development-os" className="btn btn-dark btn-sm">
          <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
          Command center
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Total" value={invoices.length} sub="issued" />
        <Kpi
          label="Unpaid"
          value={unpaid.length}
          sub={`${fmtAbbrevUsd(unpaidOpenUsdMinor)} open`}
          tone="warn"
        />
        <Kpi
          label="Overdue"
          value={overdue.length}
          sub="past due date"
          tone="danger"
        />
        <Kpi
          label="Paid · MTD"
          value={fmtAbbrevUsd(paidMtdUsdMinor)}
          sub={`${paidMtd.length} invoices`}
          tone="success"
        />
      </div>

      {invoices.length === 0 ? (
        <EmptyState
          icon={<Wallet className="w-5 h-5" strokeWidth={1.75} />}
          title="No invoices issued"
          description="Invoices are created when a contract milestone fires its pre-invoice or due-date trigger. Open a contract group to issue one manually."
        />
      ) : (
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <span className="label">All invoices</span>
            <span className="label">{invoices.length} records</span>
          </div>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="data">
                <thead>
                  <tr>
                    <th>Number</th>
                    <th>Buyer</th>
                    <th>Type</th>
                    <th className="num">Amount</th>
                    <th>Due</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((i) => (
                    <tr key={i.id}>
                      <td className="font-mono text-[12px] text-ink">
                        {i.invoiceNumber}
                      </td>
                      <td>
                        <div className="text-ink">{i.contactFullName}</div>
                        <div className="text-[11px] text-ink-4">
                          {i.contactEmail ?? "—"}
                        </div>
                      </td>
                      <td className="text-ink-3">
                        {INVOICE_TYPE_LABEL[i.invoiceType]}
                      </td>
                      <td className="num">{fmtUsd(i.amountUsdMinor)}</td>
                      <td className="font-mono text-[11px]">
                        {i.status === "paid"
                          ? "paid"
                          : formatDate(i.dueDate, "short")}
                      </td>
                      <td>
                        <HandoffBadge tone={statusTone[i.status]}>
                          {INVOICE_STATUS_LABEL[i.status]}
                        </HandoffBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </DevelopmentShell>
  );
}
