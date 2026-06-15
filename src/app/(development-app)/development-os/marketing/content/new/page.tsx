import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";

export const metadata: Metadata = { title: "New content · Marketing" };
export const dynamic = "force-dynamic";

export default function NewContentPage() {
  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <span>Marketing</span> /{" "}
            <Link href="/development-os/marketing/content">Content</Link> /{" "}
            <span>New</span>
          </div>
          <h1>New content piece</h1>
        </div>
        <div className="actions">
          <Link
            href="/development-os/marketing/content"
            className="btn btn-secondary btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Back
          </Link>
        </div>
      </div>
      <div>
        <div className="label mb-2.5">Create content</div>
        <Card padding="default">
          <p className="text-sm text-ink-secondary leading-relaxed">
            New content pieces start in <code>draft</code>. Use the AI Marketing
            Assistant agent to generate captions and hashtags, then flow the
            piece through the pipeline:
            <code> draft → in_production → pending_review → approved → scheduled → published</code>.
          </p>
        </Card>
      </div>
    </DevelopmentShell>
  );
}
