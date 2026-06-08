import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getVendors } from "@/lib/development/server/vendors";
import { safeQuery } from "@/lib/development/safe-query";
import { ResourcePoolForm } from "./_resource-pool-form";

export const metadata: Metadata = { title: "New resource pool · Schedule" };
export const dynamic = "force-dynamic";

export default async function NewResourcePoolPage() {
  const vendorRows = await safeQuery("vendors", getVendors({ status: "active" }), []);
  const vendors = vendorRows.map((v) => ({
    id: v.id,
    label: `${v.legalName} · ${v.vendorCode}`,
  }));

  return (
    <DevelopmentShell>
      <PageHeader
        title="New resource pool"
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Schedule" },
          { label: "Resources", href: "/development-os/schedule/resources" },
          { label: "New" },
        ]}
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/schedule/resources">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Back
            </Link>
          </Button>
        }
      />
      <Section title="Create resource pool">
        <ResourcePoolForm vendors={vendors} />
      </Section>
    </DevelopmentShell>
  );
}
