import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
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

/** Map the legacy Badge tone vocabulary onto the handoff badge palette. */
const HANDOFF_TONE: Record<
  string,
  "ok" | "warn" | "danger" | "gold" | "info" | "soft"
> = {
  success: "ok",
  warning: "warn",
  danger: "danger",
  gold: "gold",
  info: "info",
  neutral: "soft",
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
        <div className="page-header">
          <div className="left">
            <h1>Invoice</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const data = await getInvoice(id);
  if (!data) notFound();
  const { invoice: inv, lines } = data;

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/finance">Finance</Link> /{" "}
            <Link href="/development-os/finance/invoices">Invoices</Link> /{" "}
            <span>{inv.invoiceNumber}</span>
          </div>
          <h1>{inv.invoiceNumber}</h1>
          <div className="label mt-2">{`${inv.invoiceType} · issued ${inv.issueDate} · due ${inv.dueDate}`}</div>
          {inv.notes && (
            <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">{inv.notes}</p>
          )}
        </div>
        <div className="actions">
          <Link href="/development-os/finance/invoices" className="btn btn-secondary btn-sm">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            All invoices
          </Link>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Header</div>
        <Card padding="default">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
          <Field label="Status">
            <HandoffBadge tone={HANDOFF_TONE[STATUS_TONE[inv.status] ?? "neutral"]}>{inv.status}</HandoffBadge>
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
        </Card>
      </div>

      <div>
        <div className="label mb-2.5">Parties</div>
        <Card padding="default">
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
        </Card>
      </div>

      <div>
        <div className="label mb-2.5">Lines</div>
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
      </div>

      {(inv.relatedPoId ||
        inv.relatedCommitmentId ||
        inv.relatedLandInstallmentId ||
        inv.relatedPermitId) && (
        <div>
          <div className="label mb-2.5">Linked</div>
          <Card padding="default">
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
          </Card>
        </div>
      )}

      {inv.status !== "paid" &&
        inv.status !== "voided" &&
        inv.status !== "cancelled" && (
          <div>
            <div className="label mb-2.5">Action</div>
            <InvoicePaymentForm
              invoiceId={inv.id}
              outstandingMinor={String(inv.outstandingMinor ?? 0)}
              currency={inv.currency}
            />
          </div>
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
