import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Wallet } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Kpi, Card } from "@/components/dashboard/primitives";
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

const statusTone: Record<InvoiceStatus, "neutral" | "warning" | "accent" | "success" | "danger"> = {
  draft: "neutral",
  sent: "accent",
  viewed: "accent",
  paid: "success",
  overdue: "danger",
  void: "neutral",
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
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Invoices" },
        ]}
        eyebrow="Sales · milestone invoices"
        title="Issued against milestones"
        description="Invoices fire on a contract milestone's pre-invoice or due-date trigger. PDF generation and multi-language rendering wire up next."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="accent">+ Issue invoice</Button>
            <Button asChild variant="secondary">
              <Link href="/development-os">
                <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
                Command center
              </Link>
            </Button>
          </div>
        }
      />

      <div className="projects-kpi-strip">
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
        <Card padding="default" overflowHidden>
          <div className="flex items-center gap-2.5 mb-3.5">
            <h3 className="display text-[19px] font-medium tracking-tight m-0">
              All invoices
            </h3>
            <span className="label ml-auto text-[10.5px] tracking-[0.04em]">
              {invoices.length} records
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="data w-full">
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
                    <td className="text-ink-secondary">
                      {INVOICE_TYPE_LABEL[i.invoiceType]}
                    </td>
                    <td className="num">{fmtUsd(i.amountUsdMinor)}</td>
                    <td className="font-mono text-[11px]">
                      {i.status === "paid"
                        ? "paid"
                        : formatDate(i.dueDate, "short")}
                    </td>
                    <td>
                      <Badge tone={statusTone[i.status]}>
                        {INVOICE_STATUS_LABEL[i.status]}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </DevelopmentShell>
  );
}
