import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/dashboard/primitives";
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
        <div className="page-header">
          <div className="left">
            <h1>Add bank connection</h1>
          </div>
        </div>
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
        <div className="page-header">
          <div className="left">
            <h1>Add bank connection</h1>
          </div>
        </div>
        <EmptyState title="No active organization" description="Contact support." />
      </DevelopmentShell>
    );
  }

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/banking">Banking</Link> /{" "}
            <span>New</span>
          </div>
          <h1>Add bank connection</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Pick a provider, fill in credentials. We test the connection on save and surface the result.
          </p>
        </div>
        <div className="actions">
          <Link href="/development-os/banking" className="btn btn-secondary btn-sm">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            All connections
          </Link>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Provider + credentials</div>
        <Card padding="default">
          <ConnectBankForm organizationId={orgId} />
        </Card>
      </div>
    </DevelopmentShell>
  );
}
