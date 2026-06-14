import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DevelopmentShell } from "@/components/development/development-shell";
import { Card } from "@/components/dashboard/primitives";
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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <span>Schedule</span> /{" "}
            <Link href="/development-os/schedule/resources">Resources</Link> /{" "}
            <span>New</span>
          </div>
          <h1>New resource pool</h1>
        </div>
        <div className="actions">
          <Link
            href="/development-os/schedule/resources"
            className="btn btn-secondary btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Back
          </Link>
        </div>
      </div>
      <div>
        <div className="label mb-2.5">Create resource pool</div>
        <Card padding="default">
          <ResourcePoolForm vendors={vendors} />
        </Card>
      </div>
    </DevelopmentShell>
  );
}
