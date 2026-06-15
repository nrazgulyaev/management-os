import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/dashboard/primitives";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { listActiveTaxTypes } from "@/lib/development/server/tax/tax-actions";
import { getCostCategories } from "@/lib/development/server/cost-categories";
import { safeQuery } from "@/lib/development/safe-query";
import { InvoiceCreateForm } from "@/components/development/finance/invoice-create-form";

export const metadata: Metadata = { title: "New invoice · Development OS" };
export const dynamic = "force-dynamic";

export default async function NewInvoicePage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <h1>New invoice</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }

  const [taxTypes, categories] = await Promise.all([
    safeQuery("listActiveTaxTypes", listActiveTaxTypes(), [], 4000),
    safeQuery("getCostCategories", getCostCategories(), [], 4000),
  ]);

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/finance">Finance</Link> /{" "}
            <Link href="/development-os/finance/invoices">Invoices</Link> /{" "}
            <span>New</span>
          </div>
          <h1>New invoice</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Create a vendor bill, milestone invoice, or capital call. Lines
            auto-compute the subtotal + total. Atomic — header + all lines insert
            in one transaction.
          </p>
        </div>
        <div className="actions">
          <Button asChild variant="secondary">
            <Link href="/development-os/finance/invoices">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              All invoices
            </Link>
          </Button>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Form</div>
        <Card padding="default">
          <InvoiceCreateForm
            taxTypes={taxTypes.map((t) => ({
              id: t.id,
              displayName: t.displayName,
              ratePercentage: String(t.ratePercentage),
            }))}
            categories={categories.map((c) => ({
              id: c.id,
              label: c.displayName,
            }))}
          />
        </Card>
      </div>
    </DevelopmentShell>
  );
}
