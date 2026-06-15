import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
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
        <div className="page-header">
          <div className="left">
            <h1>Quality standard</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const q = await getQualityStandardByCode(decodeURIComponent(code));
  if (!q) notFound();

  const tolerance = q.toleranceSpecification as ToleranceSpec | null;

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/quality-standards">Quality standards</Link> /{" "}
            <span>{q.standardCode}</span>
          </div>
          <h1>{q.title}</h1>
          {q.description && (
            <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
              {q.description}
            </p>
          )}
        </div>
        <div className="actions">
          <Button asChild variant="secondary">
            <Link href="/development-os/quality-standards">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              All standards
            </Link>
          </Button>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Acceptance</div>
        <Card padding="default">
          <p className="text-sm whitespace-pre-wrap leading-relaxed">
            {q.acceptanceCriteria}
          </p>
          {q.measurementMethod && (
            <p className="text-xs text-ink-tertiary mt-3">
              Measurement method: {q.measurementMethod}
            </p>
          )}
        </Card>
      </div>

      {tolerance && (
        <div>
          <div className="label mb-2.5">Tolerance</div>
          <Card padding="default">
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
          </Card>
        </div>
      )}

      {q.industryStandardsReference &&
        q.industryStandardsReference.length > 0 && (
          <div>
            <div className="label mb-2.5">References</div>
            <Card padding="default">
              <ul className="flex flex-wrap gap-2">
                {q.industryStandardsReference.map((s, i) => (
                  <li key={i}>
                    <HandoffBadge tone="soft">{s}</HandoffBadge>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        )}

      <div>
        <div className="label mb-2.5">Photo refs</div>
        <Card padding="default">
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
        </Card>
      </div>
    </DevelopmentShell>
  );
}
