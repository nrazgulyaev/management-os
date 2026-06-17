import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getSpecificationByCode } from "@/lib/development/server/specifications/specification-queries";
import { getVendors } from "@/lib/development/server/vendors";
import { SpecificationLifecycleActions } from "./_spec-actions";
import { SpecificationEditForm } from "./_spec-edit-form";

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
        <div className="page-header">
          <div className="left">
            <h1>Specification</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const spec = await getSpecificationByCode(decodeURIComponent(code));
  if (!spec) notFound();

  const vendors = await getVendors();
  const vendorOptions = vendors.map((v) => ({
    id: v.id,
    label: `${v.vendorCode} · ${v.legalName}`,
  }));

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/specifications">Specifications</Link> /{" "}
            <span>{spec.specCode}</span>
          </div>
          <h1>{spec.specName}</h1>
          {spec.description && (
            <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
              {spec.description}
            </p>
          )}
        </div>
        <div className="actions">
          <SpecificationEditForm
            specId={spec.id}
            vendors={vendorOptions}
            defaults={{
              specName: spec.specName,
              description: spec.description,
              brand: spec.brand,
              modelNumber: spec.modelNumber,
              colorCode: spec.colorCode,
              dimensions: spec.dimensions,
              finishType: spec.finishType,
              applicableStandards: spec.applicableStandards,
              toleranceSpecifications: spec.toleranceSpecifications,
              preferredVendorId: spec.preferredVendorId,
              notes: spec.notes,
            }}
          />
          <Link
            href="/development-os/specifications"
            className="btn btn-secondary btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            All specs
          </Link>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Identity</div>
        <Card padding="default">
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
              <HandoffBadge tone="ok">active</HandoffBadge>
            ) : (
              <HandoffBadge tone="soft">inactive</HandoffBadge>
            )}
            {spec.supersededBy && (
              <span className="ml-2 text-xs text-ink-tertiary">
                superseded · replaced by a newer spec
              </span>
            )}
          </div>
          <div className="mt-3">
            <SpecificationLifecycleActions
              specId={spec.id}
              isActive={spec.isActive}
              defaultCategory={spec.specCategory}
            />
          </div>
        </Card>
      </div>

      {spec.applicableStandards && spec.applicableStandards.length > 0 && (
        <div>
          <div className="label mb-2.5">Standards</div>
          <Card padding="default">
            <ul className="flex flex-wrap gap-2">
              {spec.applicableStandards.map((s, i) => (
                <li key={i}>
                  <HandoffBadge tone="soft">{s}</HandoffBadge>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {spec.toleranceSpecifications && (
        <div>
          <div className="label mb-2.5">Tolerances</div>
          <Card padding="default">
            <p className="text-sm whitespace-pre-wrap">
              {spec.toleranceSpecifications}
            </p>
          </Card>
        </div>
      )}

      <div>
        <div className="label mb-2.5">Vendors</div>
        <Card padding="default">
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
        </Card>
      </div>

      {spec.notes && (
        <div>
          <div className="label mb-2.5">Notes</div>
          <Card padding="default">
            <p className="text-sm text-ink-secondary whitespace-pre-wrap">
              {spec.notes}
            </p>
          </Card>
        </div>
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
