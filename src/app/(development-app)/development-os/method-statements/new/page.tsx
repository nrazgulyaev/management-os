import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { MethodStatementForm } from "@/components/development/method-statements/method-statement-form";

export const metadata: Metadata = {
  title: "New method statement · Development OS",
};
export const dynamic = "force-dynamic";

export default async function NewMethodStatementPage() {
  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/method-statements">Method statements</Link> /{" "}
            <span>New</span>
          </div>
          <h1>New method statement / SOP</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Step-by-step procedure for site staff. Add steps with optional
            duration estimates. Tools, materials, PPE, hazards can be edited
            after creation.
          </p>
        </div>
        <div className="actions">
          <Link
            href="/development-os/method-statements"
            className="btn btn-secondary btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            SOPs
          </Link>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Form</div>
        <Card padding="default">
          <MethodStatementForm />
        </Card>
      </div>
    </DevelopmentShell>
  );
}
