import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import { ConnectMarketingForm } from "@/components/marketing/connect-marketing-form";

export const metadata: Metadata = {
  title: "Connect provider · Marketing",
};
export const dynamic = "force-dynamic";

export default async function NewMarketingConnectionPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <h1>Connect provider</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  // TENANT-1: resolve org from authenticated session.
  let orgId: string;
  try {
    orgId = await requireOrgId();
  } catch {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <h1>Connect provider</h1>
          </div>
        </div>
        <EmptyState
          title="No active organization"
          description="The default organization is missing. Contact support."
        />
      </DevelopmentShell>
    );
  }

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/marketing/dashboard">Marketing</Link> /{" "}
            <Link href="/development-os/marketing/connections">Connections</Link> /{" "}
            <span>New</span>
          </div>
          <h1>Connect a marketing provider</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Pick a provider, fill in the credential fields it requires. We test
            the connection immediately on save and surface the result.
          </p>
        </div>
        <div className="actions">
          <Link
            href="/development-os/marketing/connections"
            className="btn btn-secondary btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            All connections
          </Link>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Provider + credentials</div>
        <Card padding="default">
          <ConnectMarketingForm organizationId={orgId} />
        </Card>
      </div>
    </DevelopmentShell>
  );
}
