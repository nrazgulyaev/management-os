import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Section } from "@/components/ui/section";
import { getFulfilmentByVendorToken } from "@/features/service-fulfilment/services";
import { VendorInvoiceForm } from "@/components/vendor/invoice-form";

export const metadata = { title: "Submit invoice" };
export const dynamic = "force-dynamic";

export default async function VendorInvoicePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const ctx = await getFulfilmentByVendorToken(token);
  if (!ctx) notFound();
  return (
    <div className="min-h-screen bg-canvas px-4 py-10 md:py-16">
      <div className="max-w-2xl mx-auto flex flex-col gap-8">
        <Link
          href={`/vendor/service/${token}`}
          className="inline-flex items-center gap-1.5 text-xs text-ink-tertiary hover:text-ink"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to request
        </Link>
        <header className="flex flex-col gap-2">
          <span className="text-[11px] uppercase tracking-widest text-ink-tertiary">
            Invoice
          </span>
          <h1 className="text-display text-2xl md:text-3xl font-medium text-ink">
            Submit invoice for {ctx.fulfilment.fulfilmentCode}
          </h1>
          <p className="text-sm text-ink-secondary">
            Document upload arrives in a future update — for now, please enter
            the amount + invoice number; we'll match the document on file.
          </p>
        </header>
        <Section eyebrow="Invoice" title="Metadata">
          <VendorInvoiceForm
            fulfilmentId={ctx.fulfilment.id}
            vendorId={ctx.fulfilment.vendorId ?? ""}
            currency={ctx.fulfilment.currency}
          />
        </Section>
      </div>
    </div>
  );
}
