import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/dashboard/primitives";
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
        <div className="page-header">
          <div className="left">
            <h1>Add payment processor</h1>
          </div>
        </div>
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
        <div className="page-header">
          <div className="left">
            <h1>Add payment processor</h1>
          </div>
        </div>
        <p className="text-sm text-ink-tertiary">No active organization.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/payments">Payments</Link> /{" "}
            <Link href="/dashboard/payments/providers">Providers</Link> /{" "}
            <span>New</span>
          </div>
          <h1>Connect a payment processor</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Xendit (Indonesia — QRIS, e-wallets, virtual accounts) and Stripe
            have live API calls today. Wise Payments + PayPal connections save
            credentials but route through DryRun until each provider&apos;s
            implementation lands.
          </p>
        </div>
        <div className="actions">
          <Link
            href="/dashboard/payments/providers"
            className="btn btn-secondary btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            All providers
          </Link>
        </div>
      </div>
      <div>
        <div className="label mb-2.5">Provider + credentials</div>
        <Card padding="default">
          <ConnectPaymentForm organizationId={orgId} />
        </Card>
      </div>
    </div>
  );
}
