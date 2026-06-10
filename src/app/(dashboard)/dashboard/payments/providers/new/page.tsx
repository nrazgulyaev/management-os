import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { getDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import { ConnectPaymentForm } from "@/components/payments/connect-payment-form";

export const metadata = { title: "Add payment processor" };
export const dynamic = "force-dynamic";

export default async function NewPaymentConnectionPage() {
  const db = getDb();
  if (!db) {
    return (
      <div className="flex flex-col gap-10">
        <PageHeader title="Add payment processor" />
        <p className="text-sm text-ink-tertiary">Database not configured.</p>
      </div>
    );
  }
  let orgId: string;
  try {
    orgId = await requireOrgId();
  } catch {
    return (
      <div className="flex flex-col gap-10">
        <PageHeader title="Add payment processor" />
        <p className="text-sm text-ink-tertiary">No active organization.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Payments", href: "/dashboard/payments" },
          { label: "Providers", href: "/dashboard/payments/providers" },
          { label: "New" },
        ]}
        title="Connect a payment processor"
        description="Xendit (Indonesia — QRIS, e-wallets, virtual accounts) and Stripe have live API calls today. Wise Payments + PayPal connections save credentials but route through DryRun until each provider's implementation lands."
        actions={
          <Button asChild variant="secondary">
            <Link href="/dashboard/payments/providers">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              All providers
            </Link>
          </Button>
        }
      />
      <Section title="Provider + credentials">
        <ConnectPaymentForm organizationId={orgId} />
      </Section>
    </div>
  );
}
