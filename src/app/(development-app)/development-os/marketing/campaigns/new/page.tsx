import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";

export const metadata: Metadata = { title: "New campaign · Marketing" };
export const dynamic = "force-dynamic";

export default function NewCampaignPage() {
  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <span>Marketing</span> /{" "}
            <Link href="/development-os/marketing/campaigns">Campaigns</Link> /{" "}
            <span>New</span>
          </div>
          <h1>New campaign</h1>
        </div>
        <div className="actions">
          <Link
            href="/development-os/marketing/campaigns"
            className="btn btn-secondary btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Back
          </Link>
        </div>
      </div>
      <div>
        <div className="label mb-2.5">Create form</div>
        <Card padding="default">
          <p className="text-sm text-ink-secondary leading-relaxed">
            Wire to the <code>createCampaign</code> server action. Required:
            <code> campaignCode</code>, <code>name</code>,
            <code>campaignObjective</code>, <code>campaignStart</code>,
            <code>campaignEnd</code>.
          </p>
        </Card>
      </div>
    </DevelopmentShell>
  );
}
