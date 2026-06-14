import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { QualityStandardForm } from "@/components/development/quality-standards/quality-standard-form";

export const metadata: Metadata = {
  title: "New quality standard · Development OS",
};
export const dynamic = "force-dynamic";

export default async function NewQualityStandardPage() {
  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/quality-standards">Quality standards</Link> /{" "}
            <span>New</span>
          </div>
          <h1>New quality standard</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Acceptance-criteria template. Once created, QA inspectors can pin
            inspections against this standard for traceable rework history.
          </p>
        </div>
        <div className="actions">
          <Button asChild variant="secondary">
            <Link href="/development-os/quality-standards">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Standards
            </Link>
          </Button>
        </div>
      </div>
      <div>
        <div className="label mb-2.5">Form</div>
        <Card padding="default">
          <QualityStandardForm />
        </Card>
      </div>
    </DevelopmentShell>
  );
}
