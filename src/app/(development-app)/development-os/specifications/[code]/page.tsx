import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getSpecificationByCode } from "@/lib/development/server/specifications/specification-queries";

export const metadata: Metadata = {
  title: "Specification · Development OS",
};
export const dynamic = "force-dynamic";

export default async function SpecificationDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Specification" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const spec = await getSpecificationByCode(decodeURIComponent(code));
  if (!spec) notFound();

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Specifications", href: "/development-os/specifications" },
          { label: spec.specCode },
        ]}
        eyebrow={spec.specCategory}
        title={spec.specName}
        description={spec.description}
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/specifications">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              All specs
            </Link>
          </Button>
        }
      />

      <Section eyebrow="Identity" title="Material details">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <Field label="Code" value={spec.specCode} mono />
          <Field label="Brand" value={spec.brand ?? "—"} />
          <Field label="Model" value={spec.modelNumber ?? "—"} mono />
          <Field label="Color code" value={spec.colorCode ?? "—"} />
          <Field label="Dimensions" value={spec.dimensions ?? "—"} />
          <Field label="Finish type" value={spec.finishType ?? "—"} />
        </div>
        <div className="mt-3">
          {spec.isActive ? (
            <Badge tone="success">active</Badge>
          ) : (
            <Badge tone="neutral">inactive</Badge>
          )}
        </div>
      </Section>

      {spec.applicableStandards && spec.applicableStandards.length > 0 && (
        <Section eyebrow="Standards" title="Applicable industry standards">
          <ul className="flex flex-wrap gap-2">
            {spec.applicableStandards.map((s, i) => (
              <li key={i}>
                <Badge tone="neutral">{s}</Badge>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {spec.toleranceSpecifications && (
        <Section eyebrow="Tolerances" title="Acceptable tolerances">
          <p className="text-sm whitespace-pre-wrap">
            {spec.toleranceSpecifications}
          </p>
        </Section>
      )}

      <Section eyebrow="Vendors" title="Preferred + alternatives">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Field
            label="Preferred vendor"
            value={spec.preferredVendorId?.slice(0, 8) ?? "—"}
            mono
          />
          <Field
            label="Alternative count"
            value={String(spec.alternativeVendorIds.length)}
          />
        </div>
      </Section>

      {spec.notes && (
        <Section eyebrow="Notes" title="Operator notes">
          <p className="text-sm text-ink-secondary whitespace-pre-wrap">
            {spec.notes}
          </p>
        </Section>
      )}
    </DevelopmentShell>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-ink-tertiary">
        {label}
      </div>
      <div className={`mt-0.5 ${mono ? "font-mono text-xs" : "text-sm"}`}>
        {value}
      </div>
    </div>
  );
}
