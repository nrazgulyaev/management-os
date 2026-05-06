import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Wallet } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
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

export default async function InvoicesPage() {
  const invoices = await getInvoices();
  const unpaid = invoices.filter(
    (i) => i.status !== "paid" && i.status !== "void",
  );
  const paid = invoices.filter((i) => i.status === "paid");

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Invoices" },
        ]}
        eyebrow={`${invoices.length} total · ${unpaid.length} unpaid · ${paid.length} paid`}
        title="Invoices"
        description="Issued invoices for contract milestones. PDF generation, multi-language rendering, and direct send-via-email all wire up in the next checkpoint."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Command center
            </Link>
          </Button>
        }
      />

      {invoices.length === 0 ? (
        <EmptyState
          icon={<Wallet className="w-5 h-5" strokeWidth={1.75} />}
          title="No invoices issued"
          description="Invoices are created when a contract milestone fires its pre-invoice or due-date trigger. Open a contract group to issue one manually."
        />
      ) : (
        <Section eyebrow="All invoices" title={`${invoices.length} records`}>
          <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 border-b border-line-soft text-left">
                  <tr>
                    <th className="px-4 py-2.5 text-[11px] uppercase tracking-wide font-medium text-ink-tertiary">Number</th>
                    <th className="px-4 py-2.5 text-[11px] uppercase tracking-wide font-medium text-ink-tertiary">Buyer</th>
                    <th className="px-4 py-2.5 text-[11px] uppercase tracking-wide font-medium text-ink-tertiary">Type</th>
                    <th className="px-4 py-2.5 text-[11px] uppercase tracking-wide font-medium text-ink-tertiary text-right">Amount</th>
                    <th className="px-4 py-2.5 text-[11px] uppercase tracking-wide font-medium text-ink-tertiary">Due</th>
                    <th className="px-4 py-2.5 text-[11px] uppercase tracking-wide font-medium text-ink-tertiary">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((i) => (
                    <tr
                      key={i.id}
                      className="border-b border-line-soft last:border-b-0 hover:bg-muted/30"
                    >
                      <td className="px-4 py-3 font-mono text-xs text-ink">
                        {i.invoiceNumber}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="text-ink">{i.contactFullName}</span>
                          <span className="text-xs text-ink-tertiary">
                            {i.contactEmail ?? "—"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-secondary">
                        {INVOICE_TYPE_LABEL[i.invoiceType]}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-ink">
                        {fmtUsd(i.amountUsdMinor)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {formatDate(i.dueDate, "short")}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={statusTone[i.status]}>
                          {INVOICE_STATUS_LABEL[i.status]}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Section>
      )}
    </DevelopmentShell>
  );
}
