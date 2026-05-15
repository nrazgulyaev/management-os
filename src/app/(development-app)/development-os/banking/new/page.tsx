import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import { ConnectBankForm } from "@/components/banking/connect-bank-form";

export const metadata: Metadata = {
  title: "Add bank connection · Development OS",
};
export const dynamic = "force-dynamic";

export default async function NewBankConnectionPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Add bank connection" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  let orgId: string;
  try {
    orgId = await requireOrgId();
  } catch {
    return (
      <DevelopmentShell>
        <PageHeader title="Add bank connection" />
        <EmptyState title="No active organization" description="Contact support." />
      </DevelopmentShell>
    );
  }

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Banking", href: "/development-os/banking" },
          { label: "New" },
        ]}
        title="Add bank connection"
        description="Pick a provider, fill in credentials. We test the connection on save and surface the result."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/banking">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              All connections
            </Link>
          </Button>
        }
      />

      <Section title="Provider + credentials">
        <ConnectBankForm organizationId={orgId} />
      </Section>
    </DevelopmentShell>
  );
}
