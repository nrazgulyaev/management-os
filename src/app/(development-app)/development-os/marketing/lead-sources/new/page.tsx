import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";

export const metadata: Metadata = { title: "New lead source · Marketing" };
export const dynamic = "force-dynamic";

export default function NewLeadSourcePage() {
  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <span>Marketing</span> /{" "}
            <Link href="/development-os/marketing/lead-sources">
              Lead sources
            </Link>{" "}
            / <span>New</span>
          </div>
          <h1>New lead source</h1>
        </div>
        <div className="actions">
          <Link
            href="/development-os/marketing/lead-sources"
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
            The 14 default sources are seeded by migration <code>0063</code>.
            Adding a new custom channel uses the{" "}
            <code>createLeadSource</code> server action — wire from your admin
            form when needed.
          </p>
        </Card>
      </div>
    </DevelopmentShell>
  );
}
