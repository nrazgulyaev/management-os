import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { listVendorInvoices } from "@/features/service-fulfilment/services";
import { formatFulfilmentAmountForAdmin } from "@/features/service-fulfilment/pricing-pure";
import { InvoiceStatusButton } from "@/components/service-fulfilment/buttons";

export const metadata = { title: "Vendor invoices" };
export const dynamic = "force-dynamic";

export default async function VendorInvoicesPage() {
  const rows = await listVendorInvoices({ limit: 200 });
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Service fulfilment", href: "/dashboard/service-fulfilment" },
          { label: "Invoices" },
        ]}
        title="Vendor invoices"
        description="Invoices submitted by vendors via their portal or entered manually. Approval here gates the finance bridge from seeing them as committed expenses."
      />
      <Section eyebrow="Tracking" title={`${rows.length} invoices`}>
        <div className="rounded-md border border-line-soft bg-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-canvas/50 text-left">
              <tr className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                <th className="px-4 py-3">Invoice</th>
                <th className="px-4 py-3">Vendor</th>
                <th className="px-4 py-3">Fulfilment</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Due</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-ink-tertiary">
                    No vendor invoices yet.
                  </td>
                </tr>
              )}
              {rows.map(({ invoice: inv, vendor, fulfilment }) => (
                <tr key={inv.id} className="border-t border-line-soft">
                  <td className="px-4 py-3 text-xs">
                    {inv.invoiceNumber ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-sm">{vendor?.displayName ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {fulfilment?.fulfilmentCode ?? "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {formatFulfilmentAmountForAdmin(inv.amountMinor, inv.currency)}
                  </td>
                  <td className="px-4 py-3 text-xs">{inv.dueDate ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Badge
                      tone={
                        inv.invoiceStatus === "approved"
                          ? "success"
                          : inv.invoiceStatus === "paid"
                            ? "success"
                            : inv.invoiceStatus === "rejected"
                              ? "danger"
                              : "neutral"
                      }
                    >
                      {inv.invoiceStatus}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {inv.invoiceStatus === "received" && (
                        <>
                          <InvoiceStatusButton id={inv.id} action="approve" />
                          <InvoiceStatusButton id={inv.id} action="reject" />
                        </>
                      )}
                      {inv.invoiceStatus === "approved" && (
                        <InvoiceStatusButton id={inv.id} action="paid" />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
