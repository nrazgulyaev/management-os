import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { SpecificationForm } from "@/components/development/specifications/specification-form";

export const metadata: Metadata = {
  title: "New specification · Development OS",
};
export const dynamic = "force-dynamic";

export default async function NewSpecificationPage() {
  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/specifications">Specifications</Link> /{" "}
            <span>New</span>
          </div>
          <h1>New specification</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Add a material/finish specification to the library. Once approved,
            BOQ items can reference it for material selection.
          </p>
        </div>
        <div className="actions">
          <Link
            href="/development-os/specifications"
            className="btn btn-secondary btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Specs
          </Link>
        </div>
      </div>
      <div>
        <div className="label mb-2.5">Form</div>
        <Card padding="default">
          <SpecificationForm />
        </Card>
      </div>
    </DevelopmentShell>
  );
}
