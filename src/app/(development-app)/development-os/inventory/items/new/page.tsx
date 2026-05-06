import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { DevelopmentShell } from "@/components/development/development-shell";
import { InventoryItemForm } from "@/components/development/inventory/inventory-item-form";

export const metadata: Metadata = { title: "New SKU · Development OS" };
export const dynamic = "force-dynamic";

export default async function NewInventoryItemPage() {
  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Inventory", href: "/development-os/inventory/items" },
          { label: "New SKU" },
        ]}
        title="New inventory SKU"
        description="Add a new item to the SKU catalog."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/inventory/items">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Catalog
            </Link>
          </Button>
        }
      />
      <Section eyebrow="Form" title="Item details">
        <InventoryItemForm />
      </Section>
    </DevelopmentShell>
  );
}
