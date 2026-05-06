import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getInvoice } from "@/lib/development/server/invoices/invoice-actions";
import { InvoicePaymentForm } from "@/components/development/finance/invoice-payment-form";

export const metadata: Metadata = { title: "Invoice · Development OS" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "info" | "success" | "warning" | "danger" | "neutral"> = {
  draft: "neutral",
  issued: "info",
  partial_paid: "warning",
  paid: "success",
  overdue: "danger",
  disputed: "warning",
  cancelled: "neutral",
  voided: "neutral",
};

function fmtUsd(b: bigint | string | number | null): string {
  if (b == null) return "—";
  const n = typeof b === "bigint" ? Number(b) : Number(b);
  return `$${(n / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Invoice" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const data = await getInvoice(id);
  if (!data) notFound();
  const { invoice: inv, lines } = data;

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Finance", href: "/development-os/finance" },
          { label: "Invoices", href: "/development-os/finance/invoices" },
          { label: inv.invoiceNumber },
        ]}
        eyebrow={`${inv.invoiceType} · issued ${inv.issueDate} · due ${inv.dueDate}`}
        title={inv.invoiceNumber}
        description={inv.notes ?? undefined}
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/finance/invoices">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              All invoices
            </Link>
          </Button>
        }
      />

      <Section eyebrow="Header" title="Amounts">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
          <Field label="Status">
            <Badge tone={STATUS_TONE[inv.status] ?? "neutral"}>{inv.status}</Badge>
          </Field>
          <Field label="Currency" value={inv.currency} />
          <Field label="Subtotal" value={fmtUsd(inv.subtotalMinor)} />
          <Field label="Tax total" value={fmtUsd(inv.taxTotalMinor)} />
          <Field label="Total" value={fmtUsd(inv.totalMinor)} />
          <Field label="Paid" value={fmtUsd(inv.paidMinor)} />
          <Field label="Outstanding" value={fmtUsd(inv.outstandingMinor)} />
          <Field label="Payment terms" value={inv.paymentTerms ?? "—"} />
          <Field
            label="External ref"
            value={inv.externalReference ?? "—"}
            mono
          />
        </div>
      </Section>

      <Section eyebrow="Parties" title="Who's involved">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <Field label="Vendor ID" value={inv.vendorId ?? "—"} mono />
          <Field
            label="Buyer contact ID"
            value={inv.buyerContactId ?? "—"}
            mono
          />
          <Field label="Investor ID" value={inv.investorId ?? "—"} mono />
          <Field label="Project ID" value={inv.projectId ?? "—"} mono />
          <Field label="Unit ID" value={inv.unitId ?? "—"} mono />
        </div>
      </Section>

      <Section eyebrow="Lines" title={`${lines.length} line${lines.length === 1 ? "" : "s"}`}>
        {lines.length === 0 ? (
          <EmptyState
            title="No lines"
            description="Edit the invoice to add line items."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>#</TH>
                <TH>Description</TH>
                <TH>Qty</TH>
                <TH>Unit</TH>
                <TH>Unit price</TH>
                <TH>Subtotal</TH>
                <TH>Tax</TH>
              </TR>
            </THead>
            <TBody>
              {lines.map((l) => (
                <TR key={l.id}>
                  <TD className="text-xs">{l.lineNumber}</TD>
                  <TD className="text-sm">{l.description}</TD>
                  <TDNum>{l.quantity}</TDNum>
                  <TD className="text-xs">{l.unitOfMeasure ?? "—"}</TD>
                  <TDNum>{fmtUsd(l.unitPriceMinor)}</TDNum>
                  <TDNum>{fmtUsd(l.lineSubtotalMinor)}</TDNum>
                  <TDNum>
                    {l.taxAmountMinor != null
                      ? fmtUsd(l.taxAmountMinor)
                      : "—"}
                  </TDNum>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Section>

      {(inv.relatedPoId ||
        inv.relatedCommitmentId ||
        inv.relatedLandInstallmentId ||
        inv.relatedPermitId) && (
        <Section eyebrow="Linked" title="Related entities">
          <ul className="text-sm space-y-1">
            {inv.relatedPoId && (
              <li>
                Related PO: <span className="font-mono text-xs">{inv.relatedPoId}</span>
              </li>
            )}
            {inv.relatedCommitmentId && (
              <li>
                Related commitment:{" "}
                <span className="font-mono text-xs">{inv.relatedCommitmentId}</span>
              </li>
            )}
            {inv.relatedLandInstallmentId && (
              <li>
                Related land installment:{" "}
                <span className="font-mono text-xs">
                  {inv.relatedLandInstallmentId}
                </span>
              </li>
            )}
            {inv.relatedPermitId && (
              <li>
                Related permit:{" "}
                <span className="font-mono text-xs">{inv.relatedPermitId}</span>
              </li>
            )}
          </ul>
        </Section>
      )}

      {inv.status !== "paid" &&
        inv.status !== "voided" &&
        inv.status !== "cancelled" && (
          <Section eyebrow="Action" title="Record payment">
            <InvoicePaymentForm
              invoiceId={inv.id}
              outstandingMinor={String(inv.outstandingMinor ?? 0)}
              currency={inv.currency}
            />
          </Section>
        )}
    </DevelopmentShell>
  );
}

function Field({
  label,
  value,
  children,
  mono,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-ink-tertiary">
        {label}
      </div>
      <div className={`mt-0.5 ${mono ? "font-mono text-xs break-all" : "text-sm"}`}>
        {children ?? value ?? "—"}
      </div>
    </div>
  );
}
