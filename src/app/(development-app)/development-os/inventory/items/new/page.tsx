import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { InventoryItemForm } from "@/components/development/inventory/inventory-item-form";

export const metadata: Metadata = { title: "New SKU · Development OS" };
export const dynamic = "force-dynamic";

export default async function NewInventoryItemPage() {
  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/inventory/items">Inventory</Link> /{" "}
            <span>New SKU</span>
          </div>
          <h1>New inventory SKU</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Add a new item to the SKU catalog.
          </p>
        </div>
        <div className="actions">
          <Link
            href="/development-os/inventory/items"
            className="btn btn-secondary btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Catalog
          </Link>
        </div>
      </div>
      <div>
        <div className="label mb-2.5">Form</div>
        <Card padding="default">
          <InventoryItemForm />
        </Card>
      </div>
    </DevelopmentShell>
  );
}
