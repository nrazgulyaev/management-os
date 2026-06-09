import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { listInvoices } from "@/lib/development/server/invoices/invoice-actions";
import { listActiveTaxTypes } from "@/lib/development/server/tax/tax-actions";
import { getCostCategories } from "@/lib/development/server/cost-categories";
import { safeQuery } from "@/lib/development/safe-query";
import { FinanceTabs } from "@/components/development/finance/finance-tabs";
import { ExportButton } from "@/components/development/bulk-import/export-button";
import { InvoiceAddButton } from "@/components/development/finance/invoice-add-button";

export const metadata: Metadata = { title: "Invoices · Development OS" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<
  string,
  "info" | "success" | "warning" | "danger" | "neutral"
> = {
  draft: "neutral",
  issued: "info",
  partial_paid: "warning",
  paid: "success",
  overdue: "danger",
  disputed: "warning",
  cancelled: "neutral",
  voided: "neutral",
};

const TYPE_LABEL: Record<string, string> = {
  payable: "Payable",
  receivable: "Receivable",
  investor_call: "Investor call",
  internal: "Internal",
};

function fmtUsd(b: bigint | string | number | null): string {
  if (b == null) return "—";
  const n = typeof b === "bigint" ? Number(b) : Number(b);
  return `$${(n / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{
    type?: string;
    status?: string;
    project?: string;
  }>;
}) {
  const sp = await searchParams;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader
          breadcrumbs={[
            { label: "Development OS", href: "/development-os" },
            { label: "Finance", href: "/development-os/finance" },
            { label: "Invoices" },
          ]}
          title="Invoices"
        />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }

  const [invoices, taxTypes, costCategories] = await Promise.all([
    safeQuery(
      "listInvoices",
      listInvoices({
        invoiceType:
          sp.type && ["payable", "receivable", "investor_call", "internal"].includes(sp.type)
            ? sp.type
            : undefined,
        status: sp.status,
        projectId: sp.project,
        limit: 200,
      }),
      [],
      4000,
    ),
    safeQuery(
      "invoices.taxTypes",
      listActiveTaxTypes(),
      [] as Array<{ id: string; displayName: string; ratePercentage: string }>,
      4000,
    ),
    safeQuery(
      "invoices.costCategories",
      getCostCategories(),
      [] as Array<{ id: string; displayName: string }>,
      4000,
    ),
  ]);
  const categoryOpts = costCategories.map((c) => ({
    id: c.id,
    label: c.displayName,
  }));

  const totalOutstanding = invoices.reduce(
    (s, i) => s + BigInt(i.outstandingMinor ?? "0"),
    0n,
  );

  // Per-status counts for the filter chips. Invoiced from the same
  // page-load query so chip totals reflect any other active filters.
  const statusCounts = invoices.reduce<Record<string, number>>((acc, i) => {
    acc[i.status] = (acc[i.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Finance", href: "/development-os/finance" },
          { label: "Invoices" },
        ]}
        eyebrow={`${invoices.length} invoices · ${fmtUsd(totalOutstanding)} outstanding`}
        title="Invoices"
        description="Vendor bills, milestone invoices to buyers, and capital-call invoices to investors. Lives in parallel with capital_commitments — they never overlap."
        actions={
          <div className="flex items-center gap-2">
            <InvoiceAddButton taxTypes={taxTypes} categories={categoryOpts} />
            <ExportButton entity="invoices" />
            <Button asChild variant="secondary">
              <Link href="/development-os/finance">
                <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
                Finance
              </Link>
            </Button>
          </div>
        }
      />

      <FinanceTabs />

      {invoices.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          {(["draft", "issued", "partial_paid", "paid", "overdue", "disputed", "cancelled", "voided"] as const).map(
            (s) => {
              const n = statusCounts[s] ?? 0;
              if (n === 0 && sp.status !== s) return null;
              const isActive = sp.status === s;
              const params = new URLSearchParams();
              if (sp.type) params.set("type", sp.type);
              if (sp.project) params.set("project", sp.project);
              if (!isActive) params.set("status", s);
              const href = `/development-os/finance/invoices${params.toString() ? "?" + params.toString() : ""}`;
              return (
                <Link
                  key={s}
                  href={href}
                  className={`rounded-md px-2 py-1 border ${
                    isActive
                      ? "bg-ink text-ink-inverse border-ink"
                      : "border-line-soft hover:bg-muted/40"
                  }`}
                  data-testid={`invoice-status-chip-${s}`}
                >
                  {s} <span className="opacity-70">({n})</span>
                </Link>
              );
            },
          )}
        </div>
      )}

      <form
        method="GET"
        action="/development-os/finance/invoices"
        className="rounded-lg border border-line-soft bg-surface p-3 grid grid-cols-1 md:grid-cols-4 gap-3 text-sm"
      >
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wide text-ink-tertiary">
            Type
          </span>
          <select
            name="type"
            defaultValue={sp.type ?? ""}
            className="rounded-md border border-line-soft bg-surface px-2 py-1 text-xs"
          >
            <option value="">All types</option>
            <option value="payable">Payable</option>
            <option value="receivable">Receivable</option>
            <option value="investor_call">Investor call</option>
            <option value="internal">Internal</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wide text-ink-tertiary">
            Status
          </span>
          <select
            name="status"
            defaultValue={sp.status ?? ""}
            className="rounded-md border border-line-soft bg-surface px-2 py-1 text-xs"
          >
            <option value="">All</option>
            <option value="draft">Draft</option>
            <option value="issued">Issued</option>
            <option value="partial_paid">Partial paid</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
            <option value="disputed">Disputed</option>
            <option value="cancelled">Cancelled</option>
            <option value="voided">Voided</option>
          </select>
        </label>
        <div className="flex items-end gap-2 md:col-span-2">
          <Button type="submit">Apply</Button>
          {(sp.type || sp.status || sp.project) && (
            <Button asChild variant="secondary">
              <Link href="/development-os/finance/invoices">Clear</Link>
            </Button>
          )}
        </div>
      </form>

      <Section eyebrow="Catalog" title="All invoices">
        {invoices.length === 0 ? (
          <EmptyState
            title="No invoices match"
            description="Try clearing filters or use '+ New invoice' to create one."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Number</TH>
                <TH>Type</TH>
                <TH>Issue</TH>
                <TH>Due</TH>
                <TH>Total</TH>
                <TH>Paid</TH>
                <TH>Outstanding</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {invoices.map((i) => (
                <TR key={i.id}>
                  <TD className="font-mono text-xs">
                    <Link
                      href={`/development-os/finance/invoices/${i.id}`}
                      className="hover:underline"
                    >
                      {i.invoiceNumber}
                    </Link>
                  </TD>
                  <TD className="text-xs">
                    {TYPE_LABEL[i.invoiceType] ?? i.invoiceType}
                  </TD>
                  <TD className="text-xs">{i.issueDate}</TD>
                  <TD className="text-xs">{i.dueDate}</TD>
                  <TDNum>{fmtUsd(i.totalMinor)}</TDNum>
                  <TDNum>{fmtUsd(i.paidMinor)}</TDNum>
                  <TDNum>{fmtUsd(i.outstandingMinor)}</TDNum>
                  <TD>
                    <Badge tone={STATUS_TONE[i.status] ?? "neutral"}>
                      {i.status}
                    </Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Section>
    </DevelopmentShell>
  );
}
