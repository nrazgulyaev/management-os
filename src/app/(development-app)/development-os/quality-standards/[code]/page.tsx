import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle, XCircle } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getQualityStandardByCode } from "@/lib/development/server/quality-standards/quality-standard-queries";

export const metadata: Metadata = {
  title: "Quality standard · Development OS",
};
export const dynamic = "force-dynamic";

interface ToleranceSpec {
  dimension: string;
  tolerance: string;
  unit?: string;
}

export default async function QualityStandardDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Quality standard" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const q = await getQualityStandardByCode(decodeURIComponent(code));
  if (!q) notFound();

  const tolerance = q.toleranceSpecification as ToleranceSpec | null;

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Quality standards", href: "/development-os/quality-standards" },
          { label: q.standardCode },
        ]}
        eyebrow={q.category}
        title={q.title}
        description={q.description ?? undefined}
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/quality-standards">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              All standards
            </Link>
          </Button>
        }
      />

      <Section eyebrow="Acceptance" title="Criteria">
        <p className="text-sm whitespace-pre-wrap leading-relaxed">
          {q.acceptanceCriteria}
        </p>
        {q.measurementMethod && (
          <p className="text-xs text-ink-tertiary mt-3">
            Measurement method: {q.measurementMethod}
          </p>
        )}
      </Section>

      {tolerance && (
        <Section eyebrow="Tolerance" title="Specification">
          <div className="rounded border border-line-soft p-3 text-sm grid grid-cols-3 gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-ink-tertiary">
                Dimension
              </div>
              <div className="font-medium">{tolerance.dimension}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-ink-tertiary">
                Tolerance
              </div>
              <div className="font-mono">{tolerance.tolerance}</div>
            </div>
            {tolerance.unit && (
              <div>
                <div className="text-[11px] uppercase tracking-wide text-ink-tertiary">
                  Unit
                </div>
                <div className="font-mono">{tolerance.unit}</div>
              </div>
            )}
          </div>
        </Section>
      )}

      {q.industryStandardsReference &&
        q.industryStandardsReference.length > 0 && (
          <Section eyebrow="References" title="Industry standards">
            <ul className="flex flex-wrap gap-2">
              {q.industryStandardsReference.map((s, i) => (
                <li key={i}>
                  <Badge tone="neutral">{s}</Badge>
                </li>
              ))}
            </ul>
          </Section>
        )}

      <Section eyebrow="Photo refs" title="Acceptable / unacceptable examples">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-sm font-medium text-success flex items-center gap-1 mb-2">
              <CheckCircle className="w-4 h-4" />
              Acceptable ({q.referencePhotosAcceptable.length})
            </div>
            {q.referencePhotosAcceptable.length === 0 ? (
              <p className="text-xs text-ink-tertiary">No reference photos.</p>
            ) : (
              <ul className="space-y-1 text-xs font-mono">
                {q.referencePhotosAcceptable.map((id) => (
                  <li key={id}>{id.slice(0, 8)}</li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <div className="text-sm font-medium text-danger flex items-center gap-1 mb-2">
              <XCircle className="w-4 h-4" />
              Unacceptable ({q.referencePhotosUnacceptable.length})
            </div>
            {q.referencePhotosUnacceptable.length === 0 ? (
              <p className="text-xs text-ink-tertiary">No reference photos.</p>
            ) : (
              <ul className="space-y-1 text-xs font-mono">
                {q.referencePhotosUnacceptable.map((id) => (
                  <li key={id}>{id.slice(0, 8)}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Section>
    </DevelopmentShell>
  );
}
